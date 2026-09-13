import { createPublicKey, verify } from 'node:crypto';
import {
  canonicalSubmissionDigest,
  publisherAttestationPayload,
} from '../../authoring/src/index.ts';
import {
  validatePublisherAttestation,
  validatePublisherPolicy,
  validateSkillSubmission,
  type PublisherAttestationV1,
  type PublisherPolicyV1,
  type SkillSubmissionV1,
  type SigningKeyV1,
} from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';

export interface PublisherVerificationResult {
  required: boolean;
  verified: boolean;
  keyId?: string;
}

export interface VerifyPublisherAttestationInput {
  submission: SkillSubmissionV1;
  attestation?: PublisherAttestationV1;
  policy: PublisherPolicyV1;
  now?: Date;
}

function namespaceOf(packageId: string): string {
  const [namespace, runtimeName, ...rest] = packageId.split('/');
  if (!namespace || !runtimeName || rest.length > 0) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_NAMESPACE_DENIED',
      message: `Package ID must use a single publisher namespace: ${packageId}`,
      category: 'security',
    });
  }
  return namespace;
}

function assertActiveKey(key: SigningKeyV1, now: Date): void {
  const current = now.getTime();
  if (
    (key.validFrom !== undefined && Date.parse(key.validFrom) > current)
    || (key.validUntil !== undefined && Date.parse(key.validUntil) <= current)
    || (key.revokedAt !== undefined && Date.parse(key.revokedAt) <= current)
  ) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_KEY_INACTIVE',
      message: `Publisher signing key is not active: ${key.keyId}`,
      category: 'security',
    });
  }
}

function signatureInvalid(message: string): never {
  throw new AunoError({
    code: 'AUNO_PUBLISHER_SIGNATURE_INVALID',
    message,
    category: 'security',
  });
}

export function verifyPublisherAttestation(
  input: VerifyPublisherAttestationInput,
): PublisherVerificationResult {
  const submission = validateSkillSubmission(input.submission);
  const policy = validatePublisherPolicy(input.policy);
  const namespace = namespaceOf(submission.packageId);
  if (submission.publisher !== undefined && submission.publisher !== namespace) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_NAMESPACE_DENIED',
      message: `Publisher ${submission.publisher} does not own namespace ${namespace}`,
      category: 'security',
    });
  }
  const namespacePolicy = policy.namespaces[namespace];
  if (!namespacePolicy) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_NAMESPACE_DENIED',
      message: `Publisher namespace is not authorized by registry policy: ${namespace}`,
      category: 'security',
    });
  }
  if (!input.attestation) {
    if (namespacePolicy.requireSignature) {
      throw new AunoError({
        code: 'AUNO_PUBLISHER_KEY_REQUIRED',
        message: `Publisher attestation is required for namespace ${namespace}`,
        category: 'security',
      });
    }
    return { required: false, verified: false };
  }

  const attestation = validatePublisherAttestation(input.attestation);
  if (
    attestation.publisher !== namespace
    || attestation.packageId !== submission.packageId
    || attestation.version !== submission.version
    || attestation.artifactDigest !== submission.artifact.sha256
    || attestation.submissionDigest !== canonicalSubmissionDigest(submission)
  ) {
    return signatureInvalid('Publisher attestation does not match the submitted immutable identity');
  }

  const key = namespacePolicy.keys.find((candidate) => candidate.keyId === attestation.signature.keyId);
  if (!key) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_KEY_UNKNOWN',
      message: `Publisher signing key is not authorized for namespace ${namespace}: ${attestation.signature.keyId}`,
      category: 'security',
    });
  }
  assertActiveKey(key, input.now ?? new Date());

  const payload = publisherAttestationPayload({
    publisher: attestation.publisher,
    packageId: attestation.packageId,
    version: attestation.version,
    submissionDigest: attestation.submissionDigest,
    artifactDigest: attestation.artifactDigest,
  });
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(key.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (!verify(null, payload, publicKey, Buffer.from(attestation.signature.signature, 'base64'))) {
      return signatureInvalid('Publisher attestation signature is invalid');
    }
  } catch (cause) {
    if (cause instanceof AunoError) throw cause;
    return signatureInvalid('Publisher attestation signature or public key is invalid');
  }
  return {
    required: namespacePolicy.requireSignature,
    verified: true,
    keyId: key.keyId,
  };
}
