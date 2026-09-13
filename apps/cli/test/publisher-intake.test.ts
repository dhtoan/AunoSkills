import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishSkill } from '../../../packages/authoring/src/index.ts';
import { stableStringify, type PublisherPolicyV1 } from '../../../packages/schema/src/index.ts';
import type { RegistryFetch } from '../../../packages/registry/src/index.ts';
import { parseArgs } from '../src/args.ts';
import { runCli } from '../src/main.ts';

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    io: { stdout: (text: string) => { stdout += text; }, stderr: (text: string) => { stderr += text; } },
    get stdout() { return stdout; },
    get stderr() { return stderr; },
  };
}

async function legacyRegistry(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-v05-registry-'));
  await writeFile(join(root, 'index.json'), JSON.stringify({ schemaVersion: 1, registry: 'legacy', skills: {} }));
  return root;
}

async function sourceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-v05-source-'));
  await writeFile(join(root, 'SKILL.md'), '# Publisher Intake\n\n## Purpose\nCLI publisher intake fixture.\n');
  await writeFile(join(root, 'auno.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'acme/publisher-intake',
    version: '1.0.0',
    publisher: 'acme',
  }));
  return root;
}

function keyFixture(): { privateKey: string; publicKey: string } {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  };
}

test('publisher intake CLI flags parse without overloading existing registry flags', () => {
  const args = parseArgs([
    'skill', 'submit', './skill.aunoskill',
    '--submission', './skill.submission.json',
    '--attestation', './skill.attestation.json',
    '--publish-registry', 'company',
    '--publisher-key-id', 'acme-2026',
    '--publisher-key-env', 'ACME_PUBLISHER_KEY',
    '--publisher-policy', './publishers.json',
    '--accepted-workspace', './accepted',
  ]);
  assert.equal(args.submission, './skill.submission.json');
  assert.equal(args.attestation, './skill.attestation.json');
  assert.equal(args.publishRegistry, 'company');
  assert.equal(args.publisherKeyId, 'acme-2026');
  assert.equal(args.publisherKeyEnv, 'ACME_PUBLISHER_KEY');
  assert.equal(args.publisherPolicy, './publishers.json');
  assert.equal(args.acceptedWorkspace, './accepted');
});

test('skill attest and registry intake emit machine-readable envelopes', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-v05-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-v05-home-'));
  const bundled = await legacyRegistry();
  const source = await sourceFixture();
  const published = await publishSkill(source, { output: join(project, 'skill.submission.json') });
  const keys = keyFixture();
  const keyEnv = 'AUNOSKILLS_CLI_PUBLISHER_KEY';
  const previous = process.env[keyEnv];
  process.env[keyEnv] = keys.privateKey;
  try {
    let out = capture();
    assert.equal(await runCli([
      'skill', 'attest', published.submissionPath,
      '--publisher-key-id', 'acme-2026',
      '--publisher-key-env', keyEnv,
      '--output', join(project, 'skill.attestation.json'),
      '--json',
    ], { cwd: project, homeDir: home, registryBase: bundled, io: out.io }), 0);
    const attestEnvelope = JSON.parse(out.stdout);
    assert.equal(attestEnvelope.command, 'skill attest');
    assert.equal(attestEnvelope.ok, true);
    assert.equal(attestEnvelope.data.attestation.signature.keyId, 'acme-2026');

    const policy: PublisherPolicyV1 = {
      schemaVersion: 1,
      namespaces: {
        acme: {
          requireSignature: true,
          keys: [{ keyId: 'acme-2026', algorithm: 'ed25519', publicKey: keys.publicKey }],
        },
      },
    };
    const policyPath = join(project, 'publishers.json');
    await writeFile(policyPath, stableStringify(policy));
    out = capture();
    assert.equal(await runCli([
      'registry', 'intake', published.artifactPath,
      '--submission', published.submissionPath,
      '--attestation', join(project, 'skill.attestation.json'),
      '--publisher-policy', policyPath,
      '--accepted-workspace', join(project, 'accepted'),
      '--json',
    ], { cwd: project, homeDir: home, registryBase: bundled, io: out.io }), 0);
    const intakeEnvelope = JSON.parse(out.stdout);
    assert.equal(intakeEnvelope.command, 'registry');
    assert.equal(intakeEnvelope.ok, true);
    assert.equal(intakeEnvelope.data.candidate.publisherVerification.verified, true);
  } finally {
    if (previous === undefined) delete process.env[keyEnv];
    else process.env[keyEnv] = previous;
  }
});

test('skill submit uses configured intake endpoint and offline mode fails before fetch', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-v05-submit-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-v05-submit-home-'));
  const bundled = await legacyRegistry();
  const source = await sourceFixture();
  const published = await publishSkill(source, { output: join(project, 'skill.submission.json') });
  await mkdir(join(home, '.aunoskills'), { recursive: true });
  await writeFile(join(home, '.aunoskills', 'config.json'), stableStringify({
    registries: {
      company: {
        url: 'https://registry.example.test',
        intake: { url: 'https://registry.example.test/v1/intake' },
      },
    },
  }));

  const calls: string[] = [];
  const fetchImpl: RegistryFetch = async (input) => {
    calls.push(String(input));
    return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } });
  };
  let out = capture();
  assert.equal(await runCli([
    'skill', 'submit', published.artifactPath,
    '--submission', published.submissionPath,
    '--publish-registry', 'company',
    '--json',
  ], { cwd: project, homeDir: home, registryBase: bundled, registryFetch: fetchImpl, io: out.io }), 0);
  assert.equal(JSON.parse(out.stdout).command, 'skill submit');
  assert.equal(calls.length, 2);

  calls.length = 0;
  out = capture();
  assert.notEqual(await runCli([
    'skill', 'submit', published.artifactPath,
    '--submission', published.submissionPath,
    '--publish-registry', 'company',
    '--offline',
    '--json',
  ], { cwd: project, homeDir: home, registryBase: bundled, registryFetch: fetchImpl, io: out.io }), 0);
  assert.equal(calls.length, 0);
});
