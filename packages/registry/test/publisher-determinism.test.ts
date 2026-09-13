import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  canonicalSubmissionDigest,
  publisherAttestationPayload,
} from '../../authoring/src/index.ts';
import {
  stableStringify,
  validateRegistryIntakeCandidate,
  type SkillSubmissionV1,
} from '../../schema/src/index.ts';

const artifactDigest = 'a'.repeat(64);
const submission: SkillSubmissionV1 = {
  schemaVersion: 1,
  packageId: 'acme/deterministic',
  runtimeName: 'deterministic',
  version: '1.2.3',
  publisher: 'acme',
  artifact: {
    sha256: artifactDigest,
    file: 'deterministic-1.2.3.aunoskill',
  },
  provenance: {
    sourceRepository: 'https://github.com/acme/skills',
    sourceCommit: 'b'.repeat(40),
  },
  capabilities: {
    network: { connect: ['api.example.com'] },
  },
  dependencies: {
    'acme/base': '^1.0.0',
  },
};

const submissionDigest = canonicalSubmissionDigest(submission);
const payload = publisherAttestationPayload({
  publisher: 'acme',
  packageId: submission.packageId,
  version: submission.version,
  submissionDigest,
  artifactDigest,
});
const payloadDigest = createHash('sha256').update(payload).digest('hex');
const candidate = validateRegistryIntakeCandidate({
  schemaVersion: 1,
  packageId: submission.packageId,
  runtimeName: submission.runtimeName,
  version: submission.version,
  publisher: 'acme',
  artifact: {
    sha256: artifactDigest,
    path: `artifacts/sha256/${artifactDigest}.aunoskill`,
  },
  submissionDigest,
  publisherVerification: {
    required: true,
    verified: true,
    keyId: 'acme-2026',
  },
  provenance: submission.provenance,
  capabilities: submission.capabilities,
  dependencies: submission.dependencies,
});
const candidateDigest = createHash('sha256')
  .update(Buffer.from(stableStringify(candidate), 'utf8'))
  .digest('hex');

test('canonical publisher submission digest is portable', () => {
  assert.equal(submissionDigest, '0'.repeat(64));
});

test('publisher attestation payload digest is portable', () => {
  assert.equal(payloadDigest, '0'.repeat(64));
});

test('accepted registry intake candidate digest is portable', () => {
  assert.equal(candidateDigest, '0'.repeat(64));
});
