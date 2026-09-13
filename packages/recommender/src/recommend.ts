import type { ProjectIntelligence, WorkspaceIntelligence } from '../../detector/src/index.ts';
import type { TrustLevel } from '../../schema/src/index.ts';

export type RecommendationTier = 'auto' | 'recommended' | 'optional' | 'hidden';

export interface SkillCandidateMetadata {
  id: string;
  trust: TrustLevel;
  recommendation?: { boosts?: Record<string, number>; penalties?: Record<string, number> };
  topics?: string[];
  quality?: number;
  freshness?: number;
  conflictsWith?: string[];
}

export interface Recommendation {
  skillId: string;
  scope: string;
  relevance: number;
  tier: RecommendationTier;
  trust: TrustLevel;
  matched: string[];
  missing: string[];
  topics: string[];
  quality: number;
  freshness: number;
}

type ProjectScope = Pick<WorkspaceIntelligence, 'path' | 'technologies' | 'traits' | 'capabilities'>;

function signalValue(project: ProjectScope, key: string): number {
  const [kind, name] = key.split(':', 2);
  if (!name) return 0;
  if (kind === 'tech') return project.technologies[name] ?? 0;
  if (kind === 'trait') return project.traits.includes(name) ? 1 : 0;
  if (kind === 'cap') return project.capabilities.includes(name) ? 1 : 0;
  return 0;
}

function scoreCandidate(project: ProjectScope, candidate: SkillCandidateMetadata): Recommendation {
  let score = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const [key, weight] of Object.entries(candidate.recommendation?.boosts ?? {})) {
    const value = signalValue(project, key);
    if (value > 0) {
      matched.push(key);
      score += value * weight;
    } else missing.push(key);
  }
  for (const [key, weight] of Object.entries(candidate.recommendation?.penalties ?? {})) {
    const value = signalValue(project, key);
    if (value > 0) score -= value * Math.abs(weight);
  }
  const relevance = Math.max(0, Math.min(100, Math.round(score)));
  const tier: RecommendationTier = relevance >= 95 ? 'auto' : relevance >= 80 ? 'recommended' : relevance >= 60 ? 'optional' : 'hidden';
  return {
    skillId: candidate.id,
    scope: project.path,
    relevance,
    tier,
    trust: candidate.trust,
    matched,
    missing,
    topics: [...(candidate.topics ?? [])].sort(),
    quality: candidate.quality ?? 0.5,
    freshness: candidate.freshness ?? 0.5,
  };
}

function overlap(a: Recommendation, b: Recommendation): number {
  if (a.scope !== b.scope || !a.topics.length || !b.topics.length) return 0;
  const left = new Set(a.topics);
  const intersection = b.topics.filter((topic) => left.has(topic)).length;
  return intersection / Math.min(a.topics.length, b.topics.length);
}

export function recommendationScopes(project: ProjectIntelligence): ProjectScope[] {
  return [{ path: project.path, technologies: project.technologies, traits: project.traits, capabilities: project.capabilities }, ...project.workspaces];
}

export function recommendSkills(project: ProjectIntelligence, candidates: SkillCandidateMetadata[]): Recommendation[] {
  const scored = recommendationScopes(project)
    .flatMap((scope) => candidates.map((candidate) => scoreCandidate(scope, candidate)))
    .filter((item) => item.tier !== 'hidden')
    .sort((a, b) => b.relevance - a.relevance || b.quality - a.quality || a.scope.localeCompare(b.scope) || a.skillId.localeCompare(b.skillId));

  const selected: Recommendation[] = [];
  for (const item of scored) {
    const duplicate = selected.find((existing) => overlap(existing, item) >= 0.9);
    if (duplicate && duplicate.quality >= item.quality) continue;
    if (duplicate) selected.splice(selected.indexOf(duplicate), 1);
    selected.push(item);
  }
  return selected.sort((a, b) => b.relevance - a.relevance || a.scope.localeCompare(b.scope) || a.skillId.localeCompare(b.skillId));
}

export { scoreCandidate };
