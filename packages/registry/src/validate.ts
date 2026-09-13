import type { RegistryIndexV1, TrustLevel } from '../../schema/src/index.ts';
import { validateSkillMetadata } from '../../schema/src/index.ts';

const HASH = /^sha256:[0-9a-f]{64}$/;
const TRUST = new Set<TrustLevel>(['verified', 'community', 'untrusted']);
function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value as Record<string, unknown>;
}
export function validateRegistryIndex(value: unknown): RegistryIndexV1 {
  const root = object(value, 'AUNO_REGISTRY_INVALID');
  if (root.schemaVersion !== 1 || typeof root.registry !== 'string' || !root.registry) throw new TypeError('AUNO_REGISTRY_INVALID');
  const skills = object(root.skills, 'AUNO_REGISTRY_SKILLS_INVALID');
  for (const [skillId, rawSkill] of Object.entries(skills)) {
    const skill = object(rawSkill, `AUNO_REGISTRY_SKILL_INVALID ${skillId}`);
    if (typeof skill.latest !== 'string') throw new TypeError(`AUNO_REGISTRY_LATEST_INVALID ${skillId}`);
    const versions = object(skill.versions, `AUNO_REGISTRY_VERSIONS_INVALID ${skillId}`);
    if (!(skill.latest in versions)) throw new TypeError(`AUNO_REGISTRY_LATEST_INVALID ${skillId}@${skill.latest}`);
    for (const [version, rawVersion] of Object.entries(versions)) {
      const entry = object(rawVersion, `AUNO_REGISTRY_VERSION_INVALID ${skillId}@${version}`);
      if (typeof entry.manifest !== 'string' || !HASH.test(entry.manifest) || typeof entry.bundle !== 'string' || !HASH.test(entry.bundle)) throw new TypeError(`AUNO_REGISTRY_HASH_INVALID ${skillId}@${version}`);
      if (typeof entry.trust !== 'string' || !TRUST.has(entry.trust as TrustLevel)) throw new TypeError(`AUNO_REGISTRY_TRUST_INVALID ${skillId}@${version}`);
      if (entry.metadata !== undefined) {
        const metadata = validateSkillMetadata(entry.metadata);
        if (metadata.id !== skillId || metadata.version !== version) throw new TypeError(`AUNO_REGISTRY_METADATA_MISMATCH ${skillId}@${version}`);
      }
    }
  }
  return value as RegistryIndexV1;
}
