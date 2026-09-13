import type { AgentId, SkillMetadataV1, SkillScope } from '../../schema/src/index.ts';

export interface CanonicalSkill {
  id: string;
  files: Record<string, Uint8Array>;
  metadata: SkillMetadataV1;
}

export interface MaterializationPlan {
  skillId: string;
  target: string;
  agents: AgentId[];
  renderer: string;
  rendererVersion: number;
  files: Record<string, Uint8Array>;
}

export interface MaterializationOptions {
  scope: SkillScope;
  mode: 'portable' | 'native';
  projectRoot: string;
  homeDir?: string;
}
