export type AgentId = 'codex' | 'claude-code' | 'cursor' | 'windsurf' | 'copilot' | 'opencode';
export type TrustLevel = 'verified' | 'community' | 'untrusted';
export type SkillScope = 'project' | 'workspace' | 'user';
export type PermissionMode = 'allow' | 'ask' | 'deny';

export interface CapabilitySet {
  filesystem?: { read?: string[]; write?: string[] };
  shell?: { commands?: string[] };
  network?: { connect?: string[] };
  env?: { read?: string[] };
  process?: { spawn?: boolean };
  git?: { read?: boolean; write?: boolean };
  agent?: { modifyConfig?: boolean };
  secrets?: { request?: string[] };
}

export interface SkillIntent {
  version: string;
  scope: SkillScope;
  agents?: AgentId[];
  publisher?: string;
}

export interface ProjectPolicyV1 {
  minimumTrust?: TrustLevel;
  allowUntrusted?: boolean;
  execution?: PermissionMode;
  network?: PermissionMode;
  permissionEscalation?: 'allow' | 'require-review' | 'deny';
}

export interface ProjectManifestV1 {
  $schema?: string;
  schemaVersion: 1;
  agents: AgentId[];
  skills: Record<string, SkillIntent>;
  recommendation?: { enabled?: boolean; autoSelect?: number; recommended?: number; optional?: number };
  materialization?: { mode?: 'portable' | 'native'; delivery?: 'generated' | 'vendored' };
  policy?: ProjectPolicyV1;
  workspaces?: Record<string, { skills?: Record<string, string | Partial<SkillIntent>>; policy?: ProjectPolicyV1 }>;
  extensions?: Record<string, unknown>;
}

export interface SkillMetadataV1 {
  $schema?: string;
  schemaVersion: 1;
  id: string;
  version: string;
  publisher?: string;
  displayName?: string;
  description?: string;
  license?: string;
  compatibility?: { agents?: AgentId[] | Partial<Record<AgentId, string>> };
  topics?: string[];
  requirements?: { technologies?: string[] | Record<string, string>; runtime?: Record<string, string> };
  recommendation?: { signals?: string[]; boosts?: Record<string, number>; penalties?: Record<string, number> };
  capabilities?: CapabilitySet;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  platforms?: string[];
  extensions?: Record<string, unknown>;
}

export interface MaterializationRecord {
  target: string;
  agents: AgentId[];
  renderer: string;
  rendererVersion: number;
  integrity: string;
}

export interface LockedSkillV1 {
  requested: string;
  resolved: string;
  registry: string;
  publisher?: string;
  manifestIntegrity?: string;
  bundleIntegrity: string;
  trust: TrustLevel;
  effectiveTrust: TrustLevel;
  provenance?: { repository?: string; commit?: string; publisher?: string; build?: string };
  dependencies?: Record<string, string>;
  capabilities?: CapabilitySet;
  materializations?: MaterializationRecord[];
  resolution?: Record<string, unknown>;
}

export interface LockfileV1 {
  lockfileVersion: 1;
  generatedBy: string;
  project: { manifestDigest: string };
  skills: Record<string, LockedSkillV1>;
}

export interface RegistryVersionV1 {
  manifest: string;
  bundle: string;
  trust: TrustLevel;
  publisher?: string;
  provenance?: Record<string, string>;
  metadata?: SkillMetadataV1;
  dependencies?: Record<string, string>;
  capabilities?: CapabilitySet;
}

export interface RegistryIndexV1 {
  schemaVersion: 1;
  registry: string;
  skills: Record<string, { latest: string; versions: Record<string, RegistryVersionV1> }>;
  mirrors?: string[];
  extensions?: Record<string, unknown>;
}
