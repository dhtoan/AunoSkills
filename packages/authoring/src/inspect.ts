import { AunoError } from '../../shared/src/index.ts';
import { validateSkillSource } from './validate.ts';
import type { SkillInspection } from './types.ts';

export async function inspectSkill(root: string): Promise<SkillInspection> {
  const result = await validateSkillSource(root);
  if (!result.metadata || !result.runtimeName) {
    throw new AunoError({
      code: 'AUNO_SKILL_SOURCE_INVALID',
      message: 'Skill metadata and portable runtime name are required for inspection',
      category: 'config',
      details: { findings: result.findings },
    });
  }
  const agentSpecific = result.files.some((file) => file.path.startsWith('agents/')) || Boolean(result.metadata.compatibility?.agents && !Array.isArray(result.metadata.compatibility.agents));
  return {
    packageId: result.metadata.id,
    runtimeName: result.runtimeName,
    version: result.metadata.version,
    ...(result.metadata.publisher ? { publisher: result.metadata.publisher } : {}),
    files: result.files.map(({ path, sha256, size }) => ({ path, sha256, size })),
    ...(result.metadata.dependencies ? { dependencies: { ...result.metadata.dependencies } } : {}),
    ...(result.metadata.compatibility ? { compatibility: result.metadata.compatibility } : {}),
    ...(result.metadata.capabilities ? { declaredCapabilities: result.metadata.capabilities } : {}),
    ...(result.inferredCapabilities ? { inferredCapabilities: result.inferredCapabilities } : {}),
    ...(result.capabilityEvidence ? { capabilityEvidence: result.capabilityEvidence } : {}),
    portability: agentSpecific ? 'agent-specific' : 'portable',
    findings: result.findings,
  };
}
