import type {
  LockfileV1,
  LockedSkillV1,
  ProjectManifestV1,
  ProjectPolicyV1,
  RegistryIndexV1,
  RegistryVersionV1,
  TrustLevel,
} from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';
import { detectPermissionEscalation } from '../../security/src/index.ts';
import { compareVersions, satisfies } from './semver.ts';

export interface ResolutionResult {
  skills: Record<string, LockedSkillV1>;
}

const TRUST_ORDER: Record<TrustLevel, number> = { untrusted: 0, community: 1, verified: 2 };

function lowerTrust(a: TrustLevel, b: TrustLevel): TrustLevel {
  return TRUST_ORDER[a] <= TRUST_ORDER[b] ? a : b;
}

function splitId(id: string): [string, string] {
  const colon = id.indexOf(':');
  return colon === -1 ? ['auno', id] : [id.slice(0, colon), id.slice(colon + 1)];
}

function acceptableTrust(trust: TrustLevel, policy: ProjectPolicyV1): boolean {
  if (trust === 'untrusted' && policy.allowUntrusted === false) return false;
  const min = policy.minimumTrust ?? 'untrusted';
  return TRUST_ORDER[trust] >= TRUST_ORDER[min];
}

function chooseVersion(
  skillId: string,
  constraint: string,
  registries: Record<string, RegistryIndexV1>,
  policy: ProjectPolicyV1,
): { registry: string; version: string; record: RegistryVersionV1 } {
  const [registryName, localId] = splitId(skillId);
  const registry = registries[registryName];
  if (!registry) throw new AunoError({ code: 'AUNO_REGISTRY_NOT_FOUND', message: `AUNO_REGISTRY_NOT_FOUND ${registryName}`, category: 'resolution' });
  const skill = registry.skills[localId];
  if (!skill) throw new AunoError({ code: 'AUNO_SKILL_NOT_FOUND', message: `AUNO_SKILL_NOT_FOUND ${skillId}`, category: 'resolution' });
  const versions = Object.entries(skill.versions)
    .filter(([version, record]) => satisfies(version, constraint) && acceptableTrust(record.trust, policy))
    .sort(([a], [b]) => compareVersions(b, a));
  const selected = versions[0];
  if (!selected) throw new AunoError({ code: 'AUNO_RESOLUTION_NO_MATCH', message: `AUNO_RESOLUTION_NO_MATCH ${skillId}@${constraint}`, category: 'resolution' });
  return { registry: registryName, version: selected[0], record: selected[1] };
}

export function resolveManifest(
  manifest: ProjectManifestV1,
  registries: Record<string, RegistryIndexV1>,
  policy: ProjectPolicyV1 = manifest.policy ?? {},
  previousLock?: LockfileV1,
): ResolutionResult {
  const skills: Record<string, LockedSkillV1> = {};
  const resolving: string[] = [];

  const resolveOne = (skillId: string, constraint: string, depth: number): LockedSkillV1 => {
    if (depth > 5) throw new AunoError({ code: 'AUNO_RESOLUTION_DEPTH', message: `AUNO_RESOLUTION_DEPTH ${skillId}`, category: 'resolution' });
    if (resolving.includes(skillId)) {
      throw new AunoError({
        code: 'AUNO_RESOLUTION_CYCLE',
        message: `AUNO_RESOLUTION_CYCLE ${[...resolving, skillId].join(' -> ')}`,
        category: 'resolution',
      });
    }
    const existing = skills[skillId];
    if (existing) {
      if (!satisfies(existing.resolved, constraint)) throw new AunoError({ code: 'AUNO_RESOLUTION_CONFLICT', message: `AUNO_RESOLUTION_CONFLICT ${skillId}`, category: 'resolution' });
      return existing;
    }

    resolving.push(skillId);
    const selected = chooseVersion(skillId, constraint, registries, policy);
    let effectiveTrust = selected.record.trust;
    const dependencies: Record<string, string> = {};
    for (const [dependencyId, dependencyConstraint] of Object.entries(selected.record.dependencies ?? {})) {
      const dependency = resolveOne(dependencyId, dependencyConstraint, depth + 1);
      dependencies[dependencyId] = dependency.resolved;
      effectiveTrust = lowerTrust(effectiveTrust, dependency.effectiveTrust);
    }

    const previous = previousLock?.skills[skillId];
    const escalation = detectPermissionEscalation(previous?.capabilities ?? {}, selected.record.capabilities ?? {});
    const locked: LockedSkillV1 = {
      requested: constraint,
      resolved: selected.version,
      registry: selected.registry,
      publisher: selected.record.publisher,
      manifestIntegrity: selected.record.manifest,
      bundleIntegrity: selected.record.bundle,
      trust: selected.record.trust,
      effectiveTrust,
      provenance: selected.record.provenance,
      dependencies,
      capabilities: selected.record.capabilities,
      resolution: {
        selectedBy: 'constraint+policy',
        ...(escalation.length ? { permissionEscalation: escalation } : {}),
      },
    };
    skills[skillId] = locked;
    resolving.pop();
    return locked;
  };

  for (const [skillId, intent] of Object.entries(manifest.skills)) resolveOne(skillId, intent.version, 0);
  return { skills: Object.fromEntries(Object.entries(skills).sort(([a], [b]) => a.localeCompare(b))) };
}
