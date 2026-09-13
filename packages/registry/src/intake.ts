import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import {
  canonicalSubmissionDigest,
  verifySkillArtifact,
} from '../../authoring/src/index.ts';
import {
  stableStringify,
  validatePublisherAttestation,
  validatePublisherPolicy,
  validateRegistryIntakeCandidate,
  validateSkillSubmission,
  type PublisherAttestationV1,
  type PublisherPolicyV1,
  type RegistryIntakeCandidateV1,
  type SkillSubmissionV1,
} from '../../schema/src/index.ts';
import { AunoError, pathExists } from '../../shared/src/index.ts';
import { verifyPublisherAttestation } from './publisher-policy.ts';

export interface RegistryIntakeOptions {
  artifactPath: string;
  submissionPath: string;
  attestationPath?: string;
  policyPath: string;
  acceptedWorkspace: string;
  now?: Date;
}

export interface RegistryIntakeResult {
  candidate: RegistryIntakeCandidateV1;
  candidatePath: string;
  artifactPath: string;
}

function safeSegment(value: string, label: string): string {
  if (!value || value === '.' || value === '..' || /[\\/\0]/.test(value)) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_INTAKE_INVALID',
      message: `${label} is not a safe path segment`,
      category: 'security',
    });
  }
  return value;
}

function publisherFromSubmission(submission: SkillSubmissionV1): string {
  const [namespace, runtimeName, ...rest] = submission.packageId.split('/');
  if (!namespace || !runtimeName || rest.length > 0) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_NAMESPACE_DENIED',
      message: `Package ID must use one publisher namespace: ${submission.packageId}`,
      category: 'security',
    });
  }
  if (submission.publisher !== undefined && submission.publisher !== namespace) {
    throw new AunoError({
      code: 'AUNO_PUBLISHER_NAMESPACE_DENIED',
      message: `Publisher ${submission.publisher} does not match package namespace ${namespace}`,
      category: 'security',
    });
  }
  return namespace;
}

function validateProvenance(submission: SkillSubmissionV1): void {
  const provenance = submission.provenance;
  if (!provenance) return;
  if (provenance.sourceRepository !== undefined) {
    try {
      const url = new URL(provenance.sourceRepository);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('unsupported protocol');
    } catch (cause) {
      throw new AunoError({
        code: 'AUNO_REGISTRY_INTAKE_INVALID',
        message: 'sourceRepository must be an absolute HTTP(S) URL',
        category: 'config',
        cause,
      });
    }
  }
  if (provenance.sourceCommit !== undefined && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(provenance.sourceCommit)) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_INTAKE_INVALID',
      message: 'sourceCommit must be an exact lowercase 40- or 64-hex commit ID',
      category: 'config',
    });
  }
}

async function readJson(path: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_INTAKE_INVALID',
      message: `${label} is not valid JSON`,
      category: 'config',
      cause,
    });
  }
}

async function writeBytesAtomic(path: string, bytes: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temp, bytes);
  try {
    await rename(temp, path);
  } catch (cause) {
    await rm(temp, { force: true });
    throw cause;
  }
}

async function writeIfAbsentOrEqual(
  path: string,
  bytes: Buffer,
  conflictCode: string,
  label: string,
): Promise<void> {
  if (await pathExists(path)) {
    const existing = await readFile(path);
    if (!existing.equals(bytes)) {
      throw new AunoError({
        code: conflictCode,
        message: `${label} already exists with different immutable bytes: ${path}`,
        category: 'integrity',
      });
    }
    return;
  }
  await writeBytesAtomic(path, bytes);
}

export async function intakeSkillSubmission(options: RegistryIntakeOptions): Promise<RegistryIntakeResult> {
  const artifactBytes = await readFile(options.artifactPath);
  const verifiedArtifact = await verifySkillArtifact(artifactBytes);
  const submission = validateSkillSubmission(await readJson(options.submissionPath, 'Skill submission'));
  validateProvenance(submission);

  if (
    verifiedArtifact.sha256 !== submission.artifact.sha256
    || verifiedArtifact.packageId !== submission.packageId
    || verifiedArtifact.runtimeName !== submission.runtimeName
    || verifiedArtifact.version !== submission.version
  ) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_INTAKE_INVALID',
      message: 'Verified artifact identity does not match the submission descriptor',
      category: 'integrity',
    });
  }

  const policy = validatePublisherPolicy(await readJson(options.policyPath, 'Publisher policy')) as PublisherPolicyV1;
  const attestation: PublisherAttestationV1 | undefined = options.attestationPath
    ? validatePublisherAttestation(await readJson(options.attestationPath, 'Publisher attestation'))
    : undefined;
  const publisherVerification = verifyPublisherAttestation({
    submission,
    ...(attestation ? { attestation } : {}),
    policy,
    now: options.now,
  });
  const publisher = publisherFromSubmission(submission);
  const safePublisher = safeSegment(publisher, 'publisher');
  const safeRuntimeName = safeSegment(submission.runtimeName, 'runtimeName');
  const safeVersion = safeSegment(submission.version, 'version');
  const artifactRelativePath = `artifacts/sha256/${verifiedArtifact.sha256}.aunoskill`;
  const candidate = validateRegistryIntakeCandidate({
    schemaVersion: 1,
    packageId: submission.packageId,
    runtimeName: submission.runtimeName,
    version: submission.version,
    publisher,
    artifact: {
      sha256: verifiedArtifact.sha256,
      path: artifactRelativePath,
    },
    submissionDigest: canonicalSubmissionDigest(submission),
    publisherVerification,
    ...(submission.provenance ? { provenance: submission.provenance } : {}),
    ...(submission.capabilities ? { capabilities: submission.capabilities } : {}),
    ...(submission.dependencies ? { dependencies: submission.dependencies } : {}),
  });

  const workspace = resolve(options.acceptedWorkspace);
  const artifactPath = join(workspace, ...artifactRelativePath.split('/'));
  const candidatePath = join(workspace, 'accepted', safePublisher, safeRuntimeName, `${safeVersion}.json`);
  const candidateBytes = Buffer.from(stableStringify(candidate), 'utf8');

  if (await pathExists(candidatePath)) {
    const existing = await readFile(candidatePath);
    if (!existing.equals(candidateBytes)) {
      throw new AunoError({
        code: 'AUNO_REGISTRY_VERSION_EXISTS',
        message: `Immutable registry version already exists with different bytes: ${submission.packageId}@${submission.version}`,
        category: 'integrity',
      });
    }
  }

  await writeIfAbsentOrEqual(
    artifactPath,
    artifactBytes,
    'AUNO_REGISTRY_INTAKE_CONFLICT',
    'Content-addressed artifact',
  );
  await writeIfAbsentOrEqual(
    candidatePath,
    candidateBytes,
    'AUNO_REGISTRY_VERSION_EXISTS',
    'Accepted registry version',
  );
  return { candidate, candidatePath, artifactPath };
}
