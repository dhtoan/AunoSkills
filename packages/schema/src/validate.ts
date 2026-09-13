import type {
  AgentId,
  LockfileV1,
  ProjectManifestV1,
  SkillIntent,
  SkillMetadataV1,
  SkillScope,
} from './types.ts';

const AGENTS = new Set<AgentId>(['codex', 'claude-code', 'cursor', 'windsurf', 'copilot', 'opencode']);
const PROJECT_KEYS = new Set([
  '$schema', 'schemaVersion', 'agents', 'skills', 'recommendation', 'materialization', 'policy', 'workspaces', 'extensions',
]);
const SKILL_KEYS = new Set([
  '$schema', 'schemaVersion', 'id', 'version', 'publisher', 'displayName', 'description', 'license', 'compatibility', 'topics',
  'requirements', 'recommendation', 'capabilities', 'dependencies', 'optionalDependencies', 'platforms', 'extensions',
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertUnknown(obj: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(obj)) if (!allowed.has(key)) throw new TypeError(`Unknown ${label} field: ${key}`);
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

export function validateLockfile(value: unknown): LockfileV1 {
  const obj = record(value, 'lockfile');
  if (obj.lockfileVersion !== 1) throw new TypeError('Unsupported lockfileVersion');
  if (typeof obj.generatedBy !== 'string') throw new TypeError('generatedBy is required');
  const project = record(obj.project, 'lockfile project');
  if (typeof project.manifestDigest !== 'string') throw new TypeError('manifestDigest is required');
  record(obj.skills, 'lockfile skills');
  return obj as unknown as LockfileV1;
}
