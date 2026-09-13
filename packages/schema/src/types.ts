export type AgentId = 'codex' | 'claude-code' | 'cursor' | 'windsurf' | 'copilot' | 'opencode';
export type TrustLevel = 'verified' | 'community' | 'untrusted';
export type SkillScope = 'project' | 'workspace' | 'user';
export type PermissionMode = 'allow' | 'ask' | 'deny';
export type SigningAlgorithm = 'ed25519';

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

export interface SignatureEnvelopeV1 {
  keyId: string;
  algorithm: SigningAlgorithm;
  signature: string;
}

export interface SigningKeyV1 {
  keyId: string;
  algorithm: SigningAlgorithm;
  publicKey: string;
  validFrom?: string;
  validUntil?: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface RegistryTrustDocumentV1 {
  schemaVersion: 1;
  registry: string;
  keys: SigningKeyV1[];
  signature: SignatureEnvelopeV1;
  extensions?: Record<string, unknown>;
}

export interface MaterializationRecord {
  target: string;
  agents: AgentId[];
  renderer: string;
  rendererVersion: number;
  integrity: string;
}

export interface LockSigningMetadataV1 {
  registryKeyId: string;
  manifestKeyId: string;
  registrySignatureDigest: string;
  manifestSignatureDigest: string;
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
  signing?: LockSigningMetadataV1;
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

export interface RegistryVersionV2 extends Omit<RegistryVersionV1, 'metadata'> {
  manifestSignature: SignatureEnvelopeV1;
  metadata?: SkillMetadataV1;
}

export interface RegistryIndexV2 {
  schemaVersion: 2;
  registry: string;
  trustDigest: string;
  skills: Record<string, { latest: string; versions: Record<string, RegistryVersionV2> }>;
  mirrors?: string[];
  extensions?: Record<string, unknown>;
  signature: SignatureEnvelopeV1;
}

export interface SkillBundleFileV1 {
  path: string;
  sha256: string;
  size: number;
  contentBase64: string;
}

export interface SkillBundleManifestV1 {
  schemaVersion: 1;
  packageId: string;
  runtimeName: string;
  version: string;
  metadataDigest: string;
  capabilities?: CapabilitySet;
  dependencies?: Record<string, string>;
  files: Array<{ path: string; sha256: string; size: number }>;
}

export interface SkillBundleV1 {
  schemaVersion: 1;
  manifest: SkillBundleManifestV1;
  files: SkillBundleFileV1[];
}

export interface SkillSubmissionV1 {
  schemaVersion: 1;
  packageId: string;
  runtimeName: string;
  version: string;
  publisher?: string;
  artifact: { sha256: string; file: string };
  provenance?: { sourceRepository?: string; sourceCommit?: string };
  capabilities?: CapabilitySet;
  dependencies?: Record<string, string>;
}

export interface PublisherAttestationV1 {
  schemaVersion: 1;
  publisher: string;
  packageId: string;
  version: string;
  submissionDigest: string;
  artifactDigest: string;
  signature: SignatureEnvelopeV1;
}

export interface PublisherNamespacePolicyV1 {
  requireSignature: boolean;
  keys: SigningKeyV1[];
}

export interface PublisherPolicyV1 {
  schemaVersion: 1;
  namespaces: Record<string, PublisherNamespacePolicyV1>;
}

export interface RegistryIntakeCandidateV1 {
  schemaVersion: 1;
  packageId: string;
  runtimeName: string;
  version: string;
  publisher: string;
  artifact: { sha256: string; path: string };
  submissionDigest: string;
  publisherVerification: { required: boolean; verified: boolean; keyId?: string };
  provenance?: { sourceRepository?: string; sourceCommit?: string };
  capabilities?: CapabilitySet;
  dependencies?: Record<string, string>;
}

export interface RegistryIntakeEnvelopeV1 {
  schemaVersion: 1;
  submission: SkillSubmissionV1;
  attestation?: PublisherAttestationV1;
}
