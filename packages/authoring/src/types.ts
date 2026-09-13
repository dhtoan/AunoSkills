import type { CapabilitySet, SkillMetadataV1 } from '../../schema/src/index.ts';

export type AuthoringSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface AuthoringFinding {
  code: string;
  severity: AuthoringSeverity;
  category: string;
  message: string;
  path?: string;
  details?: unknown;
}

export interface SkillSourceFile {
  path: string;
  bytes: Buffer;
  sha256: string;
  size: number;
}

export interface CapabilityEvidence {
  capability: string;
  value: string | boolean;
  path: string;
  signal: string;
}

export interface CapabilityInferenceResult {
  capabilities: CapabilitySet;
  evidence: CapabilityEvidence[];
}

export interface SkillValidationResult {
  valid: boolean;
  metadata?: SkillMetadataV1;
  runtimeName?: string;
  inferredCapabilities?: CapabilitySet;
  capabilityEvidence?: CapabilityEvidence[];
  findings: AuthoringFinding[];
  files: SkillSourceFile[];
}

export interface SkillInspection {
  packageId: string;
  runtimeName: string;
  version: string;
  publisher?: string;
  files: Array<{ path: string; sha256: string; size: number }>;
  dependencies?: Record<string, string>;
  compatibility?: SkillMetadataV1['compatibility'];
  declaredCapabilities?: CapabilitySet;
  inferredCapabilities?: CapabilitySet;
  capabilityEvidence?: CapabilityEvidence[];
  portability: 'portable' | 'agent-specific';
  findings: AuthoringFinding[];
}

export interface PackedSkillResult {
  path: string;
  fileName: string;
  sha256: string;
  bytes: Buffer;
}

export interface VerifiedSkillArtifact {
  artifactValid: boolean;
  sha256: string;
  packageId: string;
  runtimeName: string;
  version: string;
  trust: 'untrusted' | 'community' | 'verified' | 'unknown';
  findings: AuthoringFinding[];
}
