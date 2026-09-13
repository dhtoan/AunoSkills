import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendSkills, explainRecommendation } from '../src/index.ts';
import type { SkillCandidateMetadata } from '../src/index.ts';
import type { ProjectIntelligence } from '../../detector/src/index.ts';

const project: ProjectIntelligence = {
  root: '/repo',
  path: '.',
  technologies: { nextjs: 0.99, react: 0.98, playwright: 0.85 },
  traits: ['frontend', 'application'],
  capabilities: ['uses-tests'],
  evidence: [
    { subject: 'nextjs', signal: 'dependency:next', weight: 0.8, source: 'package.json', scope: '.' },
    { subject: 'playwright', signal: 'config:playwright.config.ts', weight: 0.35, source: 'playwright.config.ts', scope: '.' },
  ],
  workspaces: [],
  sensitiveFiles: [],
};

const candidates: SkillCandidateMetadata[] = [
  { id: 'nextjs-best-practices', trust: 'verified' as const, recommendation: { boosts: { 'tech:nextjs': 100 } }, topics: ['nextjs', 'architecture'], quality: 0.95, freshness: 0.9 },
  { id: 'react-overlap', trust: 'community' as const, recommendation: { boosts: { 'tech:react': 98 } }, topics: ['nextjs', 'architecture'], quality: 0.5, freshness: 0.8 },
  { id: 'playwright-testing', trust: 'community' as const, recommendation: { boosts: { 'tech:playwright': 85, 'cap:uses-tests': 10 } }, topics: ['testing'], quality: 0.9, freshness: 0.9 },
  { id: 'cloudflare-worker', trust: 'verified' as const, recommendation: { boosts: { 'tech:cloudflare': 100 } }, topics: ['cloudflare'], quality: 1, freshness: 1 },
];

test('assigns confidence tiers while keeping trust separate', () => {
  const result = recommendSkills(project, candidates);
  const next = result.find((item) => item.skillId === 'nextjs-best-practices')!;
  const pw = result.find((item) => item.skillId === 'playwright-testing')!;
  assert.equal(next.tier, 'auto');
  assert.equal(next.trust, 'verified');
  assert.ok(pw.relevance >= 80);
  assert.equal(pw.trust, 'community');
});

test('suppresses strongly overlapping lower-quality recommendation', () => {
  const result = recommendSkills(project, candidates);
  assert.equal(result.some((item) => item.skillId === 'react-overlap'), false);
  assert.equal(result.some((item) => item.skillId === 'nextjs-best-practices'), true);
});

test('why-not explanation reports missing evidence below hidden threshold', () => {
  const explanation = explainRecommendation(project, candidates[3]);
  assert.equal(explanation.recommended, false);
  assert.match(explanation.whyNot.join(' '), /cloudflare/i);
});

test('recommends skills for technologies detected only inside a monorepo workspace', () => {
  const monorepo: ProjectIntelligence = {
    ...project,
    technologies: {},
    traits: ['monorepo'],
    capabilities: [],
    evidence: [],
    workspaces: [{
      path: 'apps/storefront',
      technologies: { nextjs: 1, react: 1 },
      traits: ['application'],
      capabilities: [],
      evidence: [{ subject: 'nextjs', signal: 'dependency:next', weight: 0.8, source: 'package.json', scope: 'apps/storefront' }],
    }],
  };
  const result = recommendSkills(monorepo, candidates);
  const next = result.find((item) => item.skillId === 'nextjs-best-practices');
  assert.equal(next?.scope, 'apps/storefront');
  assert.equal(next?.tier, 'auto');
});
