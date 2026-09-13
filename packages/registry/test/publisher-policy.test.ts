import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createPublisherAttestation } from '../../authoring/src/index.ts';
import type { PublisherPolicyV1, SkillSubmissionV1 } from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';
import { verifyPublisherAttestation } from '../src/index.ts';

function submission(): SkillSubmissionV1 {
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

function keys(): { privateKey: string; publicKey: string } {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    publicKey: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  };
}

function policy(publicKey: string, overrides: Record<string, unknown> = {}): PublisherPolicyV1 {
  return {
    schemaVersion: 1,
    namespaces: {
      acme: {
        requireSignature: true,
        keys: [{
          keyId: 'acme-2026',
          algorithm: 'ed25519',
          publicKey,
          validFrom: '2026-01-01T00:00:00Z',
          ...overrides,
        }],
      },
    },
  };
}

const now = new Date('2026-06-01T00:00:00Z');

test('verifies publisher attestation only against registry policy key', () => {
  const key = keys();
  const item = submission();
  const attestation = createPublisherAttestation(item, { keyId: 'acme-2026', privateKey: key.privateKey });
  assert.deepEqual(
    verifyPublisherAttestation({ submission: item, attestation, policy: policy(key.publicKey), now }),
    { required: true, verified: true, keyId: 'acme-2026' },
  );
});

test('fails closed when a required publisher attestation is missing or key is unknown', () => {
  const key = keys();
  const item = submission();
  assert.throws(
    () => verifyPublisherAttestation({ submission: item, policy: policy(key.publicKey), now }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_PUBLISHER_KEY_REQUIRED',
  );
  const attestation = createPublisherAttestation(item, { keyId: 'other-key', privateKey: key.privateKey });
  assert.throws(
    () => verifyPublisherAttestation({ submission: item, attestation, policy: policy(key.publicKey), now }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_PUBLISHER_KEY_UNKNOWN',
  );
});

test('rejects inactive publisher keys', () => {
  const key = keys();
  const item = submission();
  const attestation = createPublisherAttestation(item, { keyId: 'acme-2026', privateKey: key.privateKey });
  for (const overrides of [
    { revokedAt: '2026-05-01T00:00:00Z' },
    { validUntil: '2026-05-01T00:00:00Z' },
    { validFrom: '2026-07-01T00:00:00Z' },
  ]) {
    assert.throws(
      () => verifyPublisherAttestation({ submission: item, attestation, policy: policy(key.publicKey, overrides), now }),
      (error: unknown) => error instanceof AunoError && error.code === 'AUNO_PUBLISHER_KEY_INACTIVE',
    );
  }
});

test('rejects publisher namespace mismatch and tampered signature payload', () => {
  const key = keys();
  const item = submission();
  const attestation = createPublisherAttestation(item, { keyId: 'acme-2026', privateKey: key.privateKey });
  assert.throws(
    () => verifyPublisherAttestation({
      submission: { ...item, publisher: 'other' },
      attestation,
      policy: policy(key.publicKey),
      now,
    }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_PUBLISHER_NAMESPACE_DENIED',
  );
  assert.throws(
    () => verifyPublisherAttestation({
      submission: item,
      attestation: { ...attestation, artifactDigest: 'b'.repeat(64) },
      policy: policy(key.publicKey),
      now,
    }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_PUBLISHER_SIGNATURE_INVALID',
  );
});

test('allows explicitly unsigned namespace policy without asserting verification', () => {
  const item = submission();
  const unsignedPolicy: PublisherPolicyV1 = {
    schemaVersion: 1,
    namespaces: { acme: { requireSignature: false, keys: [] } },
  };
  assert.deepEqual(
    verifyPublisherAttestation({ submission: item, policy: unsignedPolicy, now }),
    { required: false, verified: false },
  );
});
