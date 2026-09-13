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

export interface SkillValidationResult {
  valid: boolean;
  metadata?: SkillMetadataV1;
  runtimeName?: string;
  findings: AuthoringFinding[];
  files: SkillSourceFile[];
}

export interface SkillInspection {
  packageId: string;
  runtimeName: string;
  version: string;
  publisher?: string;
  files: Array<{ path: string; sha256: string; size: number }>;
  declaredCapabilities?: CapabilitySet;
  inferredCapabilities?: CapabilitySet;
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
