import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPublisherAttestation,
  publishSkill,
} from '../../authoring/src/index.ts';
import { stableStringify, type PublisherPolicyV1 } from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';
import { intakeSkillSubmission } from '../src/index.ts';

async function sourceFixture(body = 'Stable registry intake fixture.'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-intake-source-'));
  await writeFile(join(root, 'SKILL.md'), `# Security Review\n\n## Purpose\n${body}\n`);
  await writeFile(join(root, 'auno.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'acme/security-review',
    version: '1.0.0',
    publisher: 'acme',
    capabilities: {},
    dependencies: {},
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

async function intakeFixture(root: string, privateKey: string, publicKey: string, base: string) {
  const submissionPath = join(base, 'submission.json');
  const published = await publishSkill(root, {
    output: submissionPath,
    sourceRepository: 'https://github.com/acme/skills',
    sourceCommit: 'a'.repeat(40),
  });
  const attestation = createPublisherAttestation(published.submission, {
    keyId: 'acme-2026',
    privateKey,
  });
  const attestationPath = join(base, 'attestation.json');
  await writeFile(attestationPath, stableStringify(attestation));
  const policy: PublisherPolicyV1 = {
    schemaVersion: 1,
    namespaces: {
      acme: {
        requireSignature: true,
        keys: [{ keyId: 'acme-2026', algorithm: 'ed25519', publicKey }],
      },
    },
  };
  const policyPath = join(base, 'publishers.json');
  await writeFile(policyPath, stableStringify(policy));
  return { published, submissionPath, attestationPath, policyPath };
}

test('intake independently verifies and writes deterministic immutable candidate', async () => {
  const root = await sourceFixture();
  const base = await mkdtemp(join(tmpdir(), 'auno-intake-input-'));
  const acceptedWorkspace = await mkdtemp(join(tmpdir(), 'auno-intake-accepted-'));
  const keys = keyFixture();
  const fixture = await intakeFixture(root, keys.privateKey, keys.publicKey, base);
  const first = await intakeSkillSubmission({
    artifactPath: fixture.published.artifactPath,
    submissionPath: fixture.submissionPath,
    attestationPath: fixture.attestationPath,
    policyPath: fixture.policyPath,
    acceptedWorkspace,
    now: new Date('2026-06-01T00:00:00Z'),
  });
  assert.equal(first.candidate.packageId, 'acme/security-review');
  assert.deepEqual(first.candidate.publisherVerification, {
    required: true,
    verified: true,
    keyId: 'acme-2026',
  });
  assert.equal(await readFile(first.candidatePath, 'utf8'), stableStringify(first.candidate));
  assert.match(first.candidate.artifact.path, /^artifacts\/sha256\/[0-9a-f]{64}\.aunoskill$/);

  const second = await intakeSkillSubmission({
    artifactPath: fixture.published.artifactPath,
    submissionPath: fixture.submissionPath,
    attestationPath: fixture.attestationPath,
    policyPath: fixture.policyPath,
    acceptedWorkspace,
    now: new Date('2026-06-01T00:00:00Z'),
  });
  assert.deepEqual(second.candidate, first.candidate);
  assert.equal(second.candidatePath, first.candidatePath);
});

test('intake rejects conflicting immutable bytes for an accepted package version', async () => {
  const acceptedWorkspace = await mkdtemp(join(tmpdir(), 'auno-intake-conflict-'));
  const keys = keyFixture();
  const firstBase = await mkdtemp(join(tmpdir(), 'auno-intake-one-'));
  const first = await intakeFixture(await sourceFixture('First bytes.'), keys.privateKey, keys.publicKey, firstBase);
  await intakeSkillSubmission({
    artifactPath: first.published.artifactPath,
    submissionPath: first.submissionPath,
    attestationPath: first.attestationPath,
    policyPath: first.policyPath,
    acceptedWorkspace,
    now: new Date('2026-06-01T00:00:00Z'),
  });

  const secondBase = await mkdtemp(join(tmpdir(), 'auno-intake-two-'));
  const second = await intakeFixture(await sourceFixture('Different bytes.'), keys.privateKey, keys.publicKey, secondBase);
  await assert.rejects(
    () => intakeSkillSubmission({
      artifactPath: second.published.artifactPath,
      submissionPath: second.submissionPath,
      attestationPath: second.attestationPath,
      policyPath: second.policyPath,
      acceptedWorkspace,
      now: new Date('2026-06-01T00:00:00Z'),
    }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_REGISTRY_VERSION_EXISTS',
  );
});
