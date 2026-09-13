import type {
  AgentId,
  LockfileV1,
  ProjectManifestV1,
  RegistryIndexV2,
  RegistryTrustDocumentV1,
  SignatureEnvelopeV1,
  SigningKeyV1,
  SkillBundleManifestV1,
  SkillIntent,
  SkillMetadataV1,
  SkillScope,
  SkillSubmissionV1,
} from './types.ts';

const AGENTS = new Set<AgentId>(['codex', 'claude-code', 'cursor', 'windsurf', 'copilot', 'opencode']);
const PROJECT_KEYS = new Set([
  '$schema', 'schemaVersion', 'agents', 'skills', 'recommendation', 'materialization', 'policy', 'workspaces', 'extensions',
]);
const SKILL_KEYS = new Set([
  '$schema', 'schemaVersion', 'id', 'version', 'publisher', 'displayName', 'description', 'license', 'compatibility', 'topics',
  'requirements', 'recommendation', 'capabilities', 'dependencies', 'optionalDependencies', 'platforms', 'extensions',
]);
const SIGNATURE_KEYS = new Set(['keyId', 'algorithm', 'signature']);
const SIGNING_KEY_KEYS = new Set(['keyId', 'algorithm', 'publicKey', 'validFrom', 'validUntil', 'revokedAt', 'revocationReason']);
const TRUST_DOCUMENT_KEYS = new Set(['schemaVersion', 'registry', 'keys', 'signature', 'extensions']);
const REGISTRY_V2_KEYS = new Set(['schemaVersion', 'registry', 'trustDigest', 'skills', 'mirrors', 'extensions', 'signature']);
const REGISTRY_VERSION_V2_KEYS = new Set([
  'manifest', 'manifestSignature', 'bundle', 'trust', 'publisher', 'provenance', 'metadata', 'dependencies', 'capabilities',
]);
const LOCK_SIGNING_KEYS = new Set(['registryKeyId', 'manifestKeyId', 'registrySignatureDigest', 'manifestSignatureDigest']);
const BUNDLE_MANIFEST_KEYS = new Set(['schemaVersion', 'packageId', 'runtimeName', 'version', 'metadataDigest', 'capabilities', 'dependencies', 'files']);
const SUBMISSION_KEYS = new Set(['schemaVersion', 'packageId', 'runtimeName', 'version', 'publisher', 'artifact', 'provenance', 'capabilities', 'dependencies']);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function assertUnknown(obj: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(obj)) if (!allowed.has(key)) throw new TypeError(`Unknown ${label} field: ${key}`);
}
function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new TypeError(`${label} is required`);
  return value;
}
function optionalIsoTimestamp(value: unknown, label: string): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`);
}
function normalizeAgents(value: unknown): AgentId[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('agents must be an array');
  return value.map((agent) => {
    if (typeof agent !== 'string' || !AGENTS.has(agent as AgentId)) throw new TypeError(`Unsupported agent: ${String(agent)}`);
    return agent as AgentId;
  });
}
function normalizeIntent(value: unknown): SkillIntent {
  if (typeof value === 'string') return { version: value, scope: 'project' };
  const obj = record(value, 'skill intent');
  const scope = (obj.scope ?? 'project') as SkillScope;
  if (!['project', 'workspace', 'user'].includes(scope)) throw new TypeError(`Invalid skill scope: ${scope}`);
  if (typeof obj.version !== 'string') throw new TypeError('skill intent version must be a string');
  const intent: SkillIntent = { version: obj.version, scope };
  if (obj.agents !== undefined) intent.agents = normalizeAgents(obj.agents);
  if (obj.publisher !== undefined) {
    if (typeof obj.publisher !== 'string') throw new TypeError('publisher must be a string');
    intent.publisher = obj.publisher;
  }
  return intent;
}
function validateSignatureEnvelope(value: unknown): SignatureEnvelopeV1 {
  const obj = record(value, 'signature');
  assertUnknown(obj, SIGNATURE_KEYS, 'signature');
  const keyId = nonEmptyString(obj.keyId, 'signature keyId');
  if (obj.algorithm !== 'ed25519') throw new TypeError(`Unsupported signing algorithm: ${String(obj.algorithm)}`);
  const signature = nonEmptyString(obj.signature, 'signature value');
  return { keyId, algorithm: 'ed25519', signature };
}
function validateRegistryVersionV2(value: unknown): RegistryIndexV2['skills'][string]['versions'][string] {
  const obj = record(value, 'registry v2 version');
  assertUnknown(obj, REGISTRY_VERSION_V2_KEYS, 'registry v2 version');
  const trust = obj.trust;
  if (!['verified', 'community', 'untrusted'].includes(String(trust))) throw new TypeError(`Invalid registry trust: ${String(trust)}`);
  return {
    manifest: nonEmptyString(obj.manifest, 'manifest digest'),
    manifestSignature: validateSignatureEnvelope(obj.manifestSignature),
    bundle: nonEmptyString(obj.bundle, 'bundle digest'),
    trust: trust as RegistryIndexV2['skills'][string]['versions'][string]['trust'],
    ...(typeof obj.publisher === 'string' ? { publisher: obj.publisher } : {}),
    ...(obj.provenance ? { provenance: record(obj.provenance, 'provenance') as Record<string, string> } : {}),
    ...(obj.metadata ? { metadata: validateSkillMetadata(obj.metadata) } : {}),
    ...(obj.dependencies ? { dependencies: record(obj.dependencies, 'dependencies') as Record<string, string> } : {}),
    ...(obj.capabilities ? { capabilities: obj.capabilities as RegistryIndexV2['skills'][string]['versions'][string]['capabilities'] } : {}),
  };
}

export function normalizeProjectManifest(value: unknown): ProjectManifestV1 {
  const obj = record(value, 'project manifest');
  assertUnknown(obj, PROJECT_KEYS, 'project manifest');
  if (obj.schemaVersion !== undefined && obj.schemaVersion !== 1) throw new TypeError('Unsupported project schemaVersion');
  const rawSkills = obj.skills === undefined ? {} : record(obj.skills, 'skills');
  const skills = Object.fromEntries(Object.entries(rawSkills).map(([id, intent]) => [id, normalizeIntent(intent)]));
  return {
    ...(typeof obj.$schema === 'string' ? { $schema: obj.$schema } : {}),
    schemaVersion: 1,
    agents: normalizeAgents(obj.agents),
    skills,
    ...(obj.recommendation ? { recommendation: obj.recommendation as ProjectManifestV1['recommendation'] } : {}),
    ...(obj.materialization ? { materialization: obj.materialization as ProjectManifestV1['materialization'] } : {}),
    ...(obj.policy ? { policy: obj.policy as ProjectManifestV1['policy'] } : {}),
    ...(obj.workspaces ? { workspaces: obj.workspaces as ProjectManifestV1['workspaces'] } : {}),
    ...(obj.extensions ? { extensions: obj.extensions as Record<string, unknown> } : {}),
  };
}
export function validateSkillMetadata(value: unknown): SkillMetadataV1 {
  const obj = record(value, 'skill metadata');
  if ('trust' in obj) throw new TypeError('Skill metadata cannot declare trust');
  assertUnknown(obj, SKILL_KEYS, 'skill metadata');
  if (obj.schemaVersion !== 1) throw new TypeError('Unsupported skill schemaVersion');
  if (typeof obj.id !== 'string' || !obj.id) throw new TypeError('skill id is required');
  if (typeof obj.version !== 'string' || !obj.version) throw new TypeError('skill version is required');
  return obj as unknown as SkillMetadataV1;
}
export function validateSigningKey(value: unknown): SigningKeyV1 {
  const obj = record(value, 'signing key');
  assertUnknown(obj, SIGNING_KEY_KEYS, 'signing key');
  const keyId = nonEmptyString(obj.keyId, 'signing key keyId');
  if (obj.algorithm !== 'ed25519') throw new TypeError(`Unsupported signing algorithm: ${String(obj.algorithm)}`);
  const publicKey = nonEmptyString(obj.publicKey, 'signing key publicKey');
  optionalIsoTimestamp(obj.validFrom, 'validFrom'); optionalIsoTimestamp(obj.validUntil, 'validUntil'); optionalIsoTimestamp(obj.revokedAt, 'revokedAt');
  return { keyId, algorithm: 'ed25519', publicKey,
    ...(typeof obj.validFrom === 'string' ? { validFrom: obj.validFrom } : {}),
    ...(typeof obj.validUntil === 'string' ? { validUntil: obj.validUntil } : {}),
    ...(typeof obj.revokedAt === 'string' ? { revokedAt: obj.revokedAt } : {}),
    ...(typeof obj.revocationReason === 'string' ? { revocationReason: obj.revocationReason } : {}),
  };
}
export function validateRegistryTrustDocument(value: unknown): RegistryTrustDocumentV1 {
  const obj = record(value, 'registry trust document');
  assertUnknown(obj, TRUST_DOCUMENT_KEYS, 'registry trust document');
  if (obj.schemaVersion !== 1) throw new TypeError('Unsupported trust schemaVersion');
  if (!Array.isArray(obj.keys) || obj.keys.length === 0) throw new TypeError('trust keys are required');
  return { schemaVersion: 1, registry: nonEmptyString(obj.registry, 'registry'), keys: obj.keys.map(validateSigningKey), signature: validateSignatureEnvelope(obj.signature), ...(obj.extensions ? { extensions: record(obj.extensions, 'trust extensions') } : {}) };
}
export function validateRegistryIndexV2(value: unknown): RegistryIndexV2 {
  const obj = record(value, 'registry v2 index');
  assertUnknown(obj, REGISTRY_V2_KEYS, 'registry v2 index');
  if (obj.schemaVersion !== 2) throw new TypeError('Unsupported registry v2 schemaVersion');
  const rawSkills = record(obj.skills, 'registry skills');
  const skills: RegistryIndexV2['skills'] = {};
  for (const [skillId, skillValue] of Object.entries(rawSkills)) {
    const skill = record(skillValue, 'registry skill');
    const latest = nonEmptyString(skill.latest, 'registry latest');
    const rawVersions = record(skill.versions, 'registry versions');
    const versions = Object.fromEntries(Object.entries(rawVersions).map(([version, item]) => [version, validateRegistryVersionV2(item)]));
    if (!versions[latest]) throw new TypeError(`registry latest version missing: ${skillId}@${latest}`);
    skills[skillId] = { latest, versions };
  }
  return { schemaVersion: 2, registry: nonEmptyString(obj.registry, 'registry'), trustDigest: nonEmptyString(obj.trustDigest, 'trustDigest'), skills,
    ...(Array.isArray(obj.mirrors) ? { mirrors: obj.mirrors.map((item) => nonEmptyString(item, 'mirror')) } : {}),
    ...(obj.extensions ? { extensions: record(obj.extensions, 'registry extensions') } : {}), signature: validateSignatureEnvelope(obj.signature) };
}
export function validateLockfile(value: unknown): LockfileV1 {
  const obj = record(value, 'lockfile');
  if (obj.lockfileVersion !== 1) throw new TypeError('Unsupported lockfileVersion');
  if (typeof obj.generatedBy !== 'string') throw new TypeError('generatedBy is required');
  const project = record(obj.project, 'lockfile project');
  if (typeof project.manifestDigest !== 'string') throw new TypeError('manifestDigest is required');
  const skills = record(obj.skills, 'lockfile skills');
  for (const [id, value] of Object.entries(skills)) {
    const skill = record(value, `locked skill ${id}`);
    if (skill.signing !== undefined) {
      const signing = record(skill.signing, 'lock signing metadata');
      assertUnknown(signing, LOCK_SIGNING_KEYS, 'lock signing metadata');
      for (const key of LOCK_SIGNING_KEYS) nonEmptyString(signing[key], `lock signing ${key}`);
    }
  }
  return obj as unknown as LockfileV1;
}

function sha256Hex(value: unknown, label: string, errorCode: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError(`${errorCode}: ${label} must be a sha256 hex digest`);
  return value;
}

export function validateSkillBundleManifest(value: unknown): SkillBundleManifestV1 {
  try {
    const obj = record(value, 'skill bundle manifest');
    assertUnknown(obj, BUNDLE_MANIFEST_KEYS, 'skill bundle manifest');
    if (obj.schemaVersion !== 1) throw new TypeError('unsupported schemaVersion');
    if (!Array.isArray(obj.files)) throw new TypeError('files are required');
    const files = obj.files.map((value) => {
      const file = record(value, 'bundle file');
      assertUnknown(file, new Set(['path', 'sha256', 'size']), 'bundle file');
      if (!Number.isSafeInteger(file.size) || Number(file.size) < 0) throw new TypeError('file size must be a non-negative integer');
      return { path: nonEmptyString(file.path, 'file path'), sha256: sha256Hex(file.sha256, 'file sha256', 'AUNO_SKILL_ARTIFACT_INVALID'), size: Number(file.size) };
    });
    return {
      schemaVersion: 1,
      packageId: nonEmptyString(obj.packageId, 'packageId'),
      runtimeName: nonEmptyString(obj.runtimeName, 'runtimeName'),
      version: nonEmptyString(obj.version, 'version'),
      metadataDigest: sha256Hex(obj.metadataDigest, 'metadataDigest', 'AUNO_SKILL_ARTIFACT_INVALID'),
      ...(obj.capabilities ? { capabilities: obj.capabilities as SkillBundleManifestV1['capabilities'] } : {}),
      ...(obj.dependencies ? { dependencies: record(obj.dependencies, 'dependencies') as Record<string, string> } : {}),
      files,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes('AUNO_SKILL_ARTIFACT_INVALID')) throw cause;
    throw new TypeError(`AUNO_SKILL_ARTIFACT_INVALID: ${message}`);
  }
}

export function validateSkillSubmission(value: unknown): SkillSubmissionV1 {
  try {
    const obj = record(value, 'skill submission');
    assertUnknown(obj, SUBMISSION_KEYS, 'skill submission');
    if (obj.schemaVersion !== 1) throw new TypeError('unsupported schemaVersion');
    const artifact = record(obj.artifact, 'artifact');
    assertUnknown(artifact, new Set(['sha256', 'file']), 'artifact');
    const provenance = obj.provenance === undefined ? undefined : record(obj.provenance, 'provenance');
    if (provenance) assertUnknown(provenance, new Set(['sourceRepository', 'sourceCommit']), 'provenance');
    return {
      schemaVersion: 1,
      packageId: nonEmptyString(obj.packageId, 'packageId'),
      runtimeName: nonEmptyString(obj.runtimeName, 'runtimeName'),
      version: nonEmptyString(obj.version, 'version'),
      ...(typeof obj.publisher === 'string' ? { publisher: obj.publisher } : {}),
      artifact: { sha256: sha256Hex(artifact.sha256, 'artifact sha256', 'AUNO_SKILL_PUBLISH_FAILED'), file: nonEmptyString(artifact.file, 'artifact file') },
      ...(provenance ? { provenance: { ...(typeof provenance.sourceRepository === 'string' ? { sourceRepository: provenance.sourceRepository } : {}), ...(typeof provenance.sourceCommit === 'string' ? { sourceCommit: provenance.sourceCommit } : {}) } } : {}),
      ...(obj.capabilities ? { capabilities: obj.capabilities as SkillSubmissionV1['capabilities'] } : {}),
      ...(obj.dependencies ? { dependencies: record(obj.dependencies, 'dependencies') as Record<string, string> } : {}),
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes('AUNO_SKILL_PUBLISH_FAILED')) throw cause;
    throw new TypeError(`AUNO_SKILL_PUBLISH_FAILED: ${message}`);
  }
}
