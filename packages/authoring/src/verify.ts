import { readFile } from 'node:fs/promises';
import { stableStringify, validateSkillBundleManifest, validateSkillMetadata, type SkillBundleFileV1, type SkillBundleV1 } from '../../schema/src/index.ts';
import { validateArchiveEntryPaths } from '../../security/src/index.ts';
import { AunoError, sha256Bytes } from '../../shared/src/index.ts';
import { capabilityMismatchFindings, inferCapabilities } from './capabilities.ts';
import { validateSkillDependencies } from './dependencies.ts';
import { deriveRuntimeName, validatePackageId } from './identity.ts';
import { isBlockedSkillSecretPath } from './inventory.ts';
import type { SkillSourceFile, VerifiedSkillArtifact } from './types.ts';

function invalid(message: string, details?: unknown, cause?: unknown): never {
  throw new AunoError({ code: 'AUNO_SKILL_ARTIFACT_INVALID', message, category: 'integrity', ...(details === undefined ? {} : { details }), ...(cause === undefined ? {} : { cause }) });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function strictBase64(value: unknown, path: string): Buffer {
  if (typeof value !== 'string' || value.length % 4 !== 0 || (value && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))) {
    invalid(`Invalid base64 content for ${path}`);
  }
  const bytes = Buffer.from(value as string, 'base64');
  if (bytes.toString('base64') !== value) invalid(`Non-canonical base64 content for ${path}`);
  return bytes;
}

function parseBundle(bytes: Buffer): SkillBundleV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (cause) {
    invalid('Artifact is not valid UTF-8 JSON', undefined, cause);
  }
  const obj = record(parsed, 'artifact');
  const topKeys = new Set(['schemaVersion', 'manifest', 'files']);
  for (const key of Object.keys(obj)) if (!topKeys.has(key)) invalid(`Unknown artifact field: ${key}`);
  if (obj.schemaVersion !== 1) invalid('Unsupported artifact schemaVersion');
  let manifest;
  try {
    manifest = validateSkillBundleManifest(obj.manifest);
  } catch (cause) {
    invalid(cause instanceof Error ? cause.message : String(cause), undefined, cause);
  }
  if (!Array.isArray(obj.files)) invalid('Artifact files must be an array');
  const files: SkillBundleFileV1[] = obj.files.map((value, index) => {
    const file = record(value, `artifact file ${index}`);
    const allowed = new Set(['path', 'sha256', 'size', 'contentBase64']);
    for (const key of Object.keys(file)) if (!allowed.has(key)) invalid(`Unknown artifact file field: ${key}`);
    if (typeof file.path !== 'string' || !file.path) invalid('Artifact file path is required');
    if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) invalid(`Artifact file hash is invalid: ${file.path}`);
    if (!Number.isSafeInteger(file.size) || Number(file.size) < 0) invalid(`Artifact file size is invalid: ${file.path}`);
    if (typeof file.contentBase64 !== 'string') invalid(`Artifact file content is required: ${file.path}`);
    return { path: file.path, sha256: file.sha256, size: Number(file.size), contentBase64: file.contentBase64 };
  });
  return { schemaVersion: 1, manifest, files };
}

export async function verifySkillArtifact(pathOrBytes: string | Buffer): Promise<VerifiedSkillArtifact> {
  const bytes = typeof pathOrBytes === 'string' ? await readFile(pathOrBytes) : Buffer.from(pathOrBytes);
  const artifactSha256 = sha256Bytes(bytes);
  const bundle = parseBundle(bytes);
  const paths = bundle.files.map((file) => file.path);
  try {
    validateArchiveEntryPaths(paths);
  } catch (cause) {
    invalid(cause instanceof Error ? cause.message : String(cause), undefined, cause);
  }
  for (const path of paths) if (isBlockedSkillSecretPath(path)) invalid(`Credential-like path is forbidden in skill artifact: ${path}`);

  const sourceFiles: SkillSourceFile[] = [];
  for (const file of bundle.files) {
    const decoded = strictBase64(file.contentBase64, file.path);
    if (decoded.byteLength !== file.size) invalid(`Artifact file size mismatch: ${file.path}`);
    if (sha256Bytes(decoded) !== file.sha256) invalid(`Artifact file hash mismatch: ${file.path}`);
    sourceFiles.push({ path: file.path, bytes: decoded, sha256: file.sha256, size: file.size });
  }
  const actualInventory = sourceFiles.map(({ path, sha256, size }) => ({ path, sha256, size }));
  if (stableStringify(actualInventory) !== stableStringify(bundle.manifest.files)) invalid('Artifact manifest inventory does not match embedded files');

  const metadataFile = sourceFiles.find((file) => file.path === 'auno.json');
  const skillFile = sourceFiles.find((file) => file.path === 'SKILL.md');
  if (!metadataFile) invalid('Artifact is missing auno.json');
  if (!skillFile) invalid('Artifact is missing SKILL.md');
  let metadata;
  try {
    metadata = validateSkillMetadata(JSON.parse(metadataFile.bytes.toString('utf8')));
  } catch (cause) {
    invalid(`Embedded auno.json is invalid: ${cause instanceof Error ? cause.message : String(cause)}`, undefined, cause);
  }
  try {
    validatePackageId(metadata.id);
  } catch (cause) {
    invalid(`Embedded package id is invalid: ${metadata.id}`, undefined, cause);
  }
  if (metadata.id !== bundle.manifest.packageId) invalid('Artifact package id does not match manifest');
  if (deriveRuntimeName(metadata.id) !== bundle.manifest.runtimeName) invalid('Artifact runtime name does not match package id');
  if (metadata.version !== bundle.manifest.version) invalid('Artifact version does not match manifest');
  const metadataDigest = sha256Bytes(Buffer.from(stableStringify(metadata), 'utf8'));
  if (metadataDigest !== bundle.manifest.metadataDigest) invalid('Artifact metadata digest mismatch');

  const dependencyFindings = validateSkillDependencies(metadata);
  if (dependencyFindings.some((finding) => finding.severity === 'high' || finding.severity === 'critical')) invalid('Artifact dependency validation failed', { findings: dependencyFindings });
  const inference = inferCapabilities(sourceFiles);
  const capabilityFindings = capabilityMismatchFindings(metadata.capabilities, inference.capabilities);
  if (capabilityFindings.some((finding) => finding.severity === 'high' || finding.severity === 'critical')) invalid('Artifact capability validation failed', { findings: capabilityFindings });

  return {
    artifactValid: true,
    sha256: artifactSha256,
    packageId: metadata.id,
    runtimeName: deriveRuntimeName(metadata.id),
    version: metadata.version,
    trust: 'unknown',
    findings: [...dependencyFindings, ...capabilityFindings],
  };
}
