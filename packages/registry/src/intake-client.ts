import {
  canonicalSubmissionDigest,
  verifySkillArtifact,
} from '../../authoring/src/index.ts';
import {
  stableStringify,
  validatePublisherAttestation,
  validateRegistryIntakeEnvelope,
  validateSkillSubmission,
  type PublisherAttestationV1,
  type SkillSubmissionV1,
} from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';
import { registryAuthHeaders } from './auth.ts';
import type { RegistryAuthConfig, RegistryFetch } from './types.ts';

const MAX_DIAGNOSTIC_BYTES = 4096;

export interface RemoteIntakeRequest {
  intakeUrl: string;
  auth?: RegistryAuthConfig;
  artifact: Buffer;
  submission: SkillSubmissionV1;
  attestation?: PublisherAttestationV1;
  fetchImpl?: RegistryFetch;
}

export interface RemoteIntakeResult {
  artifactStatus: number;
  submissionStatus: number;
  artifactDigest: string;
  submissionDigest: string;
  remoteReference?: string;
}

function intakeBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_INTAKE_INVALID',
      message: 'Registry intake URL must be an absolute HTTP(S) URL',
      category: 'config',
      cause,
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_INTAKE_INVALID',
      message: 'Registry intake URL must use HTTP(S)',
      category: 'config',
    });
  }
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function appendPath(base: URL, ...segments: string[]): URL {
  const url = new URL(base.toString());
  const suffix = segments.map((segment) => encodeURIComponent(segment)).join('/');
  url.pathname = `${base.pathname}/${suffix}`.replace(/\/{2,}/g, '/');
  return url;
}

async function diagnosticText(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_DIAGNOSTIC_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = MAX_DIAGNOSTIC_BYTES - total;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (value.byteLength > remaining) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function redact(value: string, secrets: string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted;
}

function intakeError(status: number, diagnostic: string, secrets: string[]): AunoError {
  const code = status === 401 || status === 403
    ? 'AUNO_REGISTRY_INTAKE_AUTH'
    : status === 409
      ? 'AUNO_REGISTRY_INTAKE_CONFLICT'
      : status === 422
        ? 'AUNO_REGISTRY_INTAKE_INVALID'
        : 'AUNO_REGISTRY_INTAKE_UNAVAILABLE';
  const category = status === 401 || status === 403 ? 'registry' : status === 422 ? 'config' : 'network';
  const safeDiagnostic = redact(diagnostic.trim(), secrets);
  return new AunoError({
    code,
    message: safeDiagnostic
      ? `Registry intake request failed with HTTP ${status}: ${safeDiagnostic}`
      : `Registry intake request failed with HTTP ${status}`,
    category,
    retryable: status >= 500,
  });
}

async function put(
  fetchImpl: RegistryFetch,
  url: URL,
  body: BodyInit,
  headers: Record<string, string>,
  secrets: string[],
): Promise<{ response: Response; diagnostic: string }> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: 'PUT', headers, body, redirect: 'manual' });
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_INTAKE_UNAVAILABLE',
      message: 'Registry intake request failed before receiving a response',
      category: 'network',
      retryable: true,
      cause,
    });
  }
  if (response.status !== 200 && response.status !== 201) {
    throw intakeError(response.status, await diagnosticText(response), secrets);
  }
  return { response, diagnostic: await diagnosticText(response) };
}

function parseRemoteReference(text: string): string | undefined {
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as { reference?: unknown };
    return typeof parsed.reference === 'string' && parsed.reference ? parsed.reference : undefined;
  } catch {
    return undefined;
  }
}

export async function submitToRegistryIntake(request: RemoteIntakeRequest): Promise<RemoteIntakeResult> {
  const base = intakeBaseUrl(request.intakeUrl);
  const artifact = Buffer.from(request.artifact);
  const verified = await verifySkillArtifact(artifact);
  const submission = validateSkillSubmission(request.submission);
  if (
    submission.artifact.sha256 !== verified.sha256
    || submission.packageId !== verified.packageId
    || submission.runtimeName !== verified.runtimeName
    || submission.version !== verified.version
  ) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_INTAKE_INVALID',
      message: 'Verified artifact identity does not match the submission descriptor',
      category: 'integrity',
    });
  }

  const submissionDigest = canonicalSubmissionDigest(submission);
  const attestation = request.attestation === undefined
    ? undefined
    : validatePublisherAttestation(request.attestation);
  if (attestation && (
    attestation.packageId !== submission.packageId
    || attestation.version !== submission.version
    || attestation.artifactDigest !== verified.sha256
    || attestation.submissionDigest !== submissionDigest
  )) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_INTAKE_INVALID',
      message: 'Publisher attestation does not match the submission descriptor',
      category: 'integrity',
    });
  }

  const envelope = validateRegistryIntakeEnvelope({
    schemaVersion: 1,
    submission,
    ...(attestation ? { attestation } : {}),
  });
  const authHeaders = registryAuthHeaders(request.auth ?? { type: 'none' });
  const authorization = authHeaders.Authorization ?? '';
  const secrets = authorization.startsWith('Bearer ') ? [authorization.slice('Bearer '.length)] : [];
  const fetchImpl = request.fetchImpl ?? fetch;

  const artifactResponse = await put(
    fetchImpl,
    appendPath(base, 'artifacts', 'sha256', verified.sha256),
    artifact,
    {
      ...authHeaders,
      'Content-Type': 'application/vnd.aunoskills.skill+json',
      'Idempotency-Key': `sha256:${verified.sha256}`,
    },
    secrets,
  );

  const submissionResponse = await put(
    fetchImpl,
    appendPath(base, 'submissions', attestation?.publisher ?? submission.publisher ?? submission.packageId.split('/')[0]!, submission.runtimeName, submission.version),
    stableStringify(envelope),
    {
      ...authHeaders,
      'Content-Type': 'application/vnd.aunoskills.submission+json',
      'Idempotency-Key': `sha256:${submissionDigest}`,
    },
    secrets,
  );

  return {
    artifactStatus: artifactResponse.response.status,
    submissionStatus: submissionResponse.response.status,
    artifactDigest: verified.sha256,
    submissionDigest,
    ...(parseRemoteReference(submissionResponse.diagnostic) ? { remoteReference: parseRemoteReference(submissionResponse.diagnostic) } : {}),
  };
}
