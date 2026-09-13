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
import { AunoError } from '../../shared/src/index.ts';
import {
  submitToRegistryIntake,
  type RegistryFetch,
} from '../src/index.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'auno-remote-intake-'));
  await writeFile(join(root, 'SKILL.md'), '# Remote Intake\n\n## Purpose\nRemote intake fixture.\n');
  await writeFile(join(root, 'auno.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'acme/remote-intake',
    version: '1.2.3',
    publisher: 'acme',
  }));
  const published = await publishSkill(root, { output: join(root, 'submission.json') });
  const artifact = await readFile(published.artifactPath);
  const pair = generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const attestation = createPublisherAttestation(published.submission, { keyId: 'acme-2026', privateKey });
  return { artifact, submission: published.submission, attestation };
}

test('remote intake performs two authenticated idempotent PUT requests', async () => {
  const item = await fixture();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: RegistryFetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ reference: 'remote-123' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  };
  const envName = 'AUNOSKILLS_REMOTE_TEST_TOKEN';
  const previous = process.env[envName];
  process.env[envName] = 'super-secret-token';
  try {
    const result = await submitToRegistryIntake({
      intakeUrl: 'https://registry.example.test/v1/intake/',
      auth: { type: 'bearer-env', env: envName },
      artifact: item.artifact,
      submission: item.submission,
      attestation: item.attestation,
      fetchImpl,
    });
    assert.equal(calls.length, 2);
    assert.match(calls[0]!.url, /\/artifacts\/sha256\/[0-9a-f]{64}$/);
    assert.equal(calls[1]!.url, 'https://registry.example.test/v1/intake/submissions/acme/remote-intake/1.2.3');
    for (const call of calls) {
      assert.equal(call.init?.method, 'PUT');
      assert.equal(call.init?.redirect, 'manual');
      const headers = new Headers(call.init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer super-secret-token');
      assert.match(headers.get('idempotency-key') ?? '', /^sha256:[0-9a-f]{64}$/);
    }
    assert.deepEqual(
      { artifactStatus: result.artifactStatus, submissionStatus: result.submissionStatus, remoteReference: result.remoteReference },
      { artifactStatus: 201, submissionStatus: 201, remoteReference: 'remote-123' },
    );
  } finally {
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
  }
});

test('remote intake maps immutable, validation, and auth failures without leaking token', async () => {
  const item = await fixture();
  const envName = 'AUNOSKILLS_REMOTE_ERROR_TOKEN';
  const previous = process.env[envName];
  process.env[envName] = 'do-not-leak-this-token';
  try {
    for (const [status, code] of [
      [401, 'AUNO_REGISTRY_INTAKE_AUTH'],
      [409, 'AUNO_REGISTRY_INTAKE_CONFLICT'],
      [422, 'AUNO_REGISTRY_INTAKE_INVALID'],
      [503, 'AUNO_REGISTRY_INTAKE_UNAVAILABLE'],
    ] as const) {
      const fetchImpl: RegistryFetch = async () => new Response(`server error do-not-leak-this-token`, { status });
      await assert.rejects(
        () => submitToRegistryIntake({
          intakeUrl: 'https://registry.example.test/v1/intake',
          auth: { type: 'bearer-env', env: envName },
          artifact: item.artifact,
          submission: item.submission,
          attestation: item.attestation,
          fetchImpl,
        }),
        (error: unknown) => error instanceof AunoError
          && error.code === code
          && !error.message.includes('do-not-leak-this-token'),
      );
    }
  } finally {
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
  }
});

test('remote intake fails closed on cross-origin redirect', async () => {
  const item = await fixture();
  const fetchImpl: RegistryFetch = async () => new Response('', {
    status: 302,
    headers: { location: 'https://evil.example.test/intake' },
  });
  await assert.rejects(
    () => submitToRegistryIntake({
      intakeUrl: 'https://registry.example.test/v1/intake',
      auth: { type: 'none' },
      artifact: item.artifact,
      submission: item.submission,
      attestation: item.attestation,
      fetchImpl,
    }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_REGISTRY_INTAKE_UNAVAILABLE',
  );
});
