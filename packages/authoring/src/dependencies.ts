import type { SkillMetadataV1 } from '../../schema/src/index.ts';
import { satisfies } from '../../resolver/src/index.ts';
import { validatePackageId } from './identity.ts';
import type { AuthoringFinding } from './types.ts';

function invalid(message: string, details?: unknown): AuthoringFinding {
  return { code: 'AUNO_SKILL_DEPENDENCY_INVALID', severity: 'high', category: 'dependencies', message, ...(details === undefined ? {} : { details }) };
}

function constraintIsValid(constraint: string): boolean {
  try {
    satisfies('1.0.0', constraint);
    return true;
  } catch {
    return false;
  }
}

export function validateSkillDependencies(metadata: SkillMetadataV1, localMetadata: SkillMetadataV1[] = []): AuthoringFinding[] {
  const findings: AuthoringFinding[] = [];
  const dependencies = metadata.dependencies ?? {};
  for (const [id, constraint] of Object.entries(dependencies)) {
    try {
      validatePackageId(id);
    } catch {
      findings.push(invalid(`Dependency package id is invalid: ${id}`, { dependency: id }));
      continue;
    }
    if (id === metadata.id) findings.push(invalid(`Skill cannot depend on itself: ${id}`, { dependency: id }));
    if (typeof constraint !== 'string' || !constraint.trim() || !constraintIsValid(constraint)) {
      findings.push(invalid(`Dependency constraint is invalid: ${id}@${String(constraint)}`, { dependency: id, constraint }));
    }
  }

  if (localMetadata.length) {
    const graph = new Map<string, string[]>();
    for (const item of [metadata, ...localMetadata]) graph.set(item.id, Object.keys(item.dependencies ?? {}).filter((id) => [metadata, ...localMetadata].some((candidate) => candidate.id === id)));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];
    const visit = (id: string): boolean => {
      if (visiting.has(id)) {
        const start = stack.indexOf(id);
        findings.push(invalid(`Local dependency cycle detected: ${[...stack.slice(start), id].join(' -> ')}`));
        return true;
      }
      if (visited.has(id)) return false;
      visiting.add(id);
      stack.push(id);
      for (const child of graph.get(id) ?? []) if (visit(child)) break;
      stack.pop();
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    visit(metadata.id);
  }
  return findings;
}
