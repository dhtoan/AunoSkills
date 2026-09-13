import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPublisherAttestation,
  publishSkill,
} from '../../packages/authoring/src/index.ts';
import { AunoError } from '../../packages/shared/src/index.ts';
import {
  submitToRegistryIntake,
  verifyPublisherAttestation,
  type RegistryFetch,
} from '../../packages/registry/src/index.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'auno-publisher-security-'));
  await writeFile(join(root, 'SKILL.md'), '# Publisher Security\n\n## Purpose\nAdversarial intake fixture.\n');
  await writeFile(join(root, 'auno.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'acme/publisher-security',
    version: '1.0.0',
    publisher: 'acme',
  }));
  const published = await publishSkill(root, { output: join(root, 'submission.json') });
  const artifact = await readFile(published.artifactPath);
  const pair = generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const attestation = createPublisherAttestation(published.submission, { keyId: 'acme-2026', privateKey });
  return { published, artifact, attestation, publicKey };
}

test('remote intake rejects mismatched attestation publisher before network access', async () => {
  const item = await fixture();
  let calls = 0;
  const fetchImpl: RegistryFetch = async () => {
    calls += 1;
    return new Response('{}', { status: 201 });
  };
  await assert.rejects(
    () => submitToRegistryIntake({
      intakeUrl: 'https://registry.example.test/v1/intake',
      artifact: item.artifact,
      submission: item.published.submission,
      attestation: { ...item.attestation, publisher: 'other' },
      fetchImpl,
    }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_REGISTRY_INTAKE_INVALID',
  );
  assert.equal(calls, 0);
});

test('publisher policy cannot be bootstrapped by a self-supplied unknown signing key', async () => {
  const item = await fixture();
  assert.throws(
    () => verifyPublisherAttestation({
      submission: item.published.submission,
      attestation: item.attestation,
      policy: {
        schemaVersion: 1,
        namespaces: {
          acme: {
            requireSignature: true,
            keys: [{ keyId: 'different-key', algorithm: 'ed25519', publicKey: item.publicKey }],
          },
        },
      },
    }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_PUBLISHER_KEY_UNKNOWN',
  );
});

test('remote intake caps diagnostics and redacts bearer token', async () => {
  const item = await fixture();
  const envName = 'AUNOSKILLS_SECURITY_INTAKE_TOKEN';
  const previous = process.env[envName];
  const token = 'publisher-secret-token';
  process.env[envName] = token;
  try {
    const fetchImpl: RegistryFetch = async () => new Response(`${token}:${'x'.repeat(10000)}`, { status: 503 });
    await assert.rejects(
      () => submitToRegistryIntake({
        intakeUrl: 'https://registry.example.test/v1/intake',
        auth: { type: 'bearer-env', env: envName },
        artifact: item.artifact,
        submission: item.published.submission,
        attestation: item.attestation,
        fetchImpl,
      }),
      (error: unknown) => error instanceof AunoError
        && error.code === 'AUNO_REGISTRY_INTAKE_UNAVAILABLE'
        && !error.message.includes(token)
        && error.message.length < 5000,
    );
  } finally {
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
  }
});

test('authenticated intake never follows a redirect to another origin', async () => {
  const item = await fixture();
  const visited: string[] = [];
  const fetchImpl: RegistryFetch = async (input) => {
    visited.push(String(input));
    return new Response('', {
      status: 307,
      headers: { location: 'https://attacker.example.test/write' },
    });
  };
  await assert.rejects(
    () => submitToRegistryIntake({
      intakeUrl: 'https://registry.example.test/v1/intake',
      artifact: item.artifact,
      submission: item.published.submission,
      attestation: item.attestation,
      fetchImpl,
    }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_REGISTRY_INTAKE_UNAVAILABLE',
  );
  assert.equal(visited.length, 1);
  assert.match(visited[0]!, /^https:\/\/registry\.example\.test\//);
});
