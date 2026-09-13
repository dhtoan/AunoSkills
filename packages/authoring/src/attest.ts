import { createHash, createPrivateKey, sign } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  stableStringify,
  validatePublisherAttestation,
  validateSkillSubmission,
  type PublisherAttestationV1,
  type SkillSubmissionV1,
} from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';

const PUBLISHER_ATTESTATION_DOMAIN = 'aunoskills.publisher-attestation.v1';

export interface PublisherAttestationPayloadInput {
  publisher: string;
  packageId: string;
  version: string;
  submissionDigest: string;
  artifactDigest: string;
}

export interface CreatePublisherAttestationOptions {
  keyId: string;
  privateKey: string;
}

export interface AttestSkillSubmissionOptions {
  keyId: string;
  privateKeyEnv?: string;
  output?: string;
}

function canonicalBytes(value: unknown): Buffer {
  const serialized = stableStringify(value);
  return Buffer.from(serialized.endsWith('\n') ? serialized.slice(0, -1) : serialized, 'utf8');
}

export function canonicalSubmissionDigest(submission: SkillSubmissionV1): string {
  const normalized = validateSkillSubmission(submission);
  return createHash('sha256').update(canonicalBytes(normalized)).digest('hex');
}

export function publisherAttestationPayload(input: PublisherAttestationPayloadInput): Buffer {
  return canonicalBytes({
    domain: PUBLISHER_ATTESTATION_DOMAIN,
    publisher: input.publisher,
    packageId: input.packageId,
    version: input.version,
    submissionDigest: input.submissionDigest,
    artifactDigest: input.artifactDigest,
  });
}

export function createPublisherAttestation(
  submission: SkillSubmissionV1,
  options: CreatePublisherAttestationOptions,
): PublisherAttestationV1 {
  const normalized = validateSkillSubmission(submission);
  const publisher = normalized.publisher ?? normalized.packageId.split('/')[0];
  if (!publisher) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_ATTESTATION_INVALID',
      message: 'Publisher identity is required for attestation',
      category: 'security',
    });
  }
  const submissionDigest = canonicalSubmissionDigest(normalized);
  const payload = publisherAttestationPayload({
    publisher,
    packageId: normalized.packageId,
    version: normalized.version,
    submissionDigest,
    artifactDigest: normalized.artifact.sha256,
  });
  let signature: string;
  try {
    const privateKey = createPrivateKey({
      key: Buffer.from(options.privateKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    signature = sign(null, payload, privateKey).toString('base64');
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_ATTESTATION_INVALID',
      message: 'Publisher private key is invalid or incompatible',
      category: 'security',
      cause,
    });
  }
  return validatePublisherAttestation({
    schemaVersion: 1,
    publisher,
    packageId: normalized.packageId,
    version: normalized.version,
    submissionDigest,
    artifactDigest: normalized.artifact.sha256,
    signature: {
      keyId: options.keyId,
      algorithm: 'ed25519',
      signature,
    },
  });
}

export async function attestSkillSubmission(
  submissionPath: string,
  options: AttestSkillSubmissionOptions,
): Promise<{ attestation: PublisherAttestationV1; attestationPath: string }> {
  const envName = options.privateKeyEnv ?? 'AUNOSKILLS_PUBLISHER_PRIVATE_KEY';
  const privateKey = process.env[envName];
  if (!privateKey) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_KEY_REQUIRED',
      message: `Publisher private key environment variable is required: ${envName}`,
      category: 'security',
    });
  }
  let submission: SkillSubmissionV1;
  try {
    submission = validateSkillSubmission(JSON.parse(await readFile(submissionPath, 'utf8')));
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_ATTESTATION_INVALID',
      message: 'Publisher submission descriptor is invalid',
      category: 'config',
      cause,
    });
  }
  const attestation = createPublisherAttestation(submission, { keyId: options.keyId, privateKey });
  const attestationPath = resolve(
    options.output ?? join(dirname(resolve(submissionPath)), `${submission.runtimeName}-${submission.version}.attestation.json`),
  );
  await mkdir(dirname(attestationPath), { recursive: true });
  await writeFile(attestationPath, stableStringify(attestation), 'utf8');
  return { attestation, attestationPath };
}
