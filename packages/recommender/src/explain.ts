import type { ProjectIntelligence } from '../../detector/src/index.ts';
import { recommendationScopes, scoreCandidate, type SkillCandidateMetadata } from './recommend.ts';

export interface RecommendationExplanation {
  skillId: string;
  scope: string;
  relevance: number;
  recommended: boolean;
  matched: string[];
  whyNot: string[];
}

export function explainRecommendation(project: ProjectIntelligence, candidate: SkillCandidateMetadata): RecommendationExplanation {
  const result = recommendationScopes(project)
    .map((scope) => scoreCandidate(scope, candidate))
    .sort((a, b) => b.relevance - a.relevance || a.scope.localeCompare(b.scope))[0];
  return {
    skillId: result.skillId,
    scope: result.scope,
    relevance: result.relevance,
    recommended: result.tier !== 'hidden',
    matched: result.matched,
    whyNot: result.missing.map((signal) => `Missing evidence for ${signal}`),
  };
}
