import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SkillSubmissionV1 } from '../../schema/src/index.ts';
import {
  attestSkillSubmission,
  canonicalSubmissionDigest,
  createPublisherAttestation,
  publisherAttestationPayload,
} from '../src/index.ts';

function fixtureSubmission(): SkillSubmissionV1 {
  return {
    schemaVersion: 1,
    packageId: 'acme/security-review',
    runtimeName: 'security-review',
    version: '1.0.0',
    publisher: 'acme',
    artifact: { sha256: 'a'.repeat(64), file: 'security-review-1.0.0.aunoskill' },
    capabilities: {},
    dependencies: {},
  };
}

function keyFixture(): { privateKey: string; publicKey: ReturnType<typeof createPublicKey> } {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    publicKey: createPublicKey({
      key: pair.publicKey.export({ format: 'der', type: 'spki' }),
      format: 'der',
      type: 'spki',
    }),
  };
}

test('canonical submission digest changes when immutable artifact identity changes', () => {
  const submission = fixtureSubmission();
  const first = canonicalSubmissionDigest(submission);
  const second = canonicalSubmissionDigest({
    ...submission,
    artifact: { ...submission.artifact, sha256: 'b'.repeat(64) },
  });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test('publisher attestation signs a deterministic domain-separated payload', () => {
  const submission = fixtureSubmission();
  const keys = keyFixture();
  const first = createPublisherAttestation(submission, { keyId: 'acme-2026', privateKey: keys.privateKey });
  const second = createPublisherAttestation(submission, { keyId: 'acme-2026', privateKey: keys.privateKey });
  assert.deepEqual(first, second);
  assert.equal(first.artifactDigest, submission.artifact.sha256);
  assert.equal(first.submissionDigest, canonicalSubmissionDigest(submission));
  const payload = publisherAttestationPayload({
    publisher: first.publisher,
    packageId: first.packageId,
    version: first.version,
    submissionDigest: first.submissionDigest,
    artifactDigest: first.artifactDigest,
  });
  assert.equal(
    verify(null, payload, keys.publicKey, Buffer.from(first.signature.signature, 'base64')),
    true,
  );
  assert.match(payload.toString('utf8'), /aunoskills\.publisher-attestation\.v1/);
});

test('attestSkillSubmission reads private key from env and writes canonical attestation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-attest-'));
  const submissionPath = join(root, 'submission.json');
  const output = join(root, 'attestation.json');
  const keys = keyFixture();
  await writeFile(submissionPath, `${JSON.stringify(fixtureSubmission())}\n`);
  const envName = 'AUNOSKILLS_TEST_PUBLISHER_PRIVATE_KEY';
  const previous = process.env[envName];
  process.env[envName] = keys.privateKey;
  try {
    const result = await attestSkillSubmission(submissionPath, {
      keyId: 'acme-2026',
      privateKeyEnv: envName,
      output,
    });
    assert.equal(result.attestationPath, output);
    const written = JSON.parse(await readFile(output, 'utf8')) as Record<string, unknown>;
    assert.deepEqual(written, result.attestation);
    assert.equal('privateKey' in written, false);
  } finally {
    if (previous === undefined) delete process.env[envName];
    else process.env[envName] = previous;
  }
});
