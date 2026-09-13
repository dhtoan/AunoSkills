import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePublisherAttestation,
  validatePublisherPolicy,
  validateRegistryIntakeCandidate,
  validateRegistryIntakeEnvelope,
  validateSkillBundle,
  validateSkillBundleManifest,
  validateSkillSubmission,
} from '../src/index.ts';

test('validates a deterministic skill bundle manifest', () => {
  const manifest = validateSkillBundleManifest({
    schemaVersion: 1,
    packageId: 'auno/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    metadataDigest: 'a'.repeat(64),
    files: [{ path: 'SKILL.md', sha256: 'b'.repeat(64), size: 10 }],
    capabilities: {},
    dependencies: {},
  });
  assert.equal(manifest.runtimeName, 'example-skill');
});

test('rejects a bundle whose file inventory is malformed', () => {
  assert.throws(() => validateSkillBundle({
    schemaVersion: 1,
    manifest: {},
    files: [{ path: '../secret', contentBase64: 'eA==' }],
  }));
});

test('validates a publication submission without trust assertions', () => {
  const submission = validateSkillSubmission({
    schemaVersion: 1,
    packageId: 'auno/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    publisher: 'auno',
    artifact: { sha256: 'c'.repeat(64), file: 'example-skill-1.0.0.aunoskill' },
    capabilities: {},
    dependencies: {},
  });
  assert.equal(submission.packageId, 'auno/example-skill');
});

test('rejects trust elevation inside an author submission', () => {
  assert.throws(() => validateSkillSubmission({
    schemaVersion: 1,
    packageId: 'auno/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    artifact: { sha256: 'd'.repeat(64), file: 'example-skill-1.0.0.aunoskill' },
    capabilities: {},
    dependencies: {},
    trust: 'verified',
  }));
});

test('validates publisher attestation digests and signature envelope', () => {
  const attestation = validatePublisherAttestation({
    schemaVersion: 1,
    publisher: 'acme',
    packageId: 'acme/security-review',
    version: '1.0.0',
    submissionDigest: 'a'.repeat(64),
    artifactDigest: 'b'.repeat(64),
    signature: { keyId: 'acme-2026', algorithm: 'ed25519', signature: 'c2ln' },
  });
  assert.equal(attestation.packageId, 'acme/security-review');
  assert.throws(() => validatePublisherAttestation({ ...attestation, submissionDigest: 'sha256:bad' }));
});

test('validates publisher namespace policy and rejects duplicate key ids', () => {
  const policy = validatePublisherPolicy({
    schemaVersion: 1,
    namespaces: {
      acme: {
        requireSignature: true,
        keys: [{ keyId: 'acme-2026', algorithm: 'ed25519', publicKey: 'cHVi' }],
      },
    },
  });
  assert.equal(policy.namespaces.acme?.requireSignature, true);
  assert.throws(() => validatePublisherPolicy({
    schemaVersion: 1,
    namespaces: {
      acme: {
        requireSignature: true,
        keys: [
          { keyId: 'dup', algorithm: 'ed25519', publicKey: 'YQ==' },
          { keyId: 'dup', algorithm: 'ed25519', publicKey: 'Yg==' },
        ],
      },
    },
  }));
});

test('validates deterministic registry intake candidate and envelope', () => {
  const candidate = validateRegistryIntakeCandidate({
    schemaVersion: 1,
    packageId: 'acme/security-review',
    runtimeName: 'security-review',
    version: '1.0.0',
    publisher: 'acme',
    artifact: { sha256: 'c'.repeat(64), path: `artifacts/sha256/${'c'.repeat(64)}.aunoskill` },
    submissionDigest: 'd'.repeat(64),
    publisherVerification: { required: true, verified: true, keyId: 'acme-2026' },
    capabilities: {},
    dependencies: {},
  });
  assert.equal(candidate.publisherVerification.verified, true);
  assert.throws(() => validateRegistryIntakeCandidate({
    ...candidate,
    artifact: { ...candidate.artifact, path: '../escape.aunoskill' },
  }));

  const envelope = validateRegistryIntakeEnvelope({
    schemaVersion: 1,
    submission: {
      schemaVersion: 1,
      packageId: 'acme/security-review',
      runtimeName: 'security-review',
      version: '1.0.0',
      publisher: 'acme',
      artifact: { sha256: 'c'.repeat(64), file: 'security-review-1.0.0.aunoskill' },
    },
    attestation: {
      schemaVersion: 1,
      publisher: 'acme',
      packageId: 'acme/security-review',
      version: '1.0.0',
      submissionDigest: 'd'.repeat(64),
      artifactDigest: 'c'.repeat(64),
      signature: { keyId: 'acme-2026', algorithm: 'ed25519', signature: 'c2ln' },
    },
  });
  assert.equal(envelope.submission.packageId, 'acme/security-review');
});
