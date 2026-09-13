import { join } from 'node:path';
import { sha256Bytes } from '../../shared/src/index.ts';
import type { AgentId } from '../../schema/src/index.ts';
import type { CanonicalSkill, MaterializationOptions, MaterializationPlan } from './types.ts';

const SHARED_AGENTS: AgentId[] = ['codex', 'cursor', 'windsurf', 'copilot', 'opencode'];
const NATIVE_DIR: Record<AgentId, string> = {
  codex: '.agents/skills',
  'claude-code': '.claude/skills',
  cursor: '.cursor/skills',
  windsurf: '.windsurf/skills',
  copilot: '.github/skills',
  opencode: '.opencode/skills',
};

function baseFor(options: MaterializationOptions): string {
  if (options.scope === 'user') {
    if (!options.homeDir) throw new Error('homeDir is required for user scope');
    return options.homeDir;
  }
  return options.projectRoot;
}

function makePlan(skill: CanonicalSkill, agents: AgentId[], renderer: string, targetDir: string, options: MaterializationOptions): MaterializationPlan {
  return {
    skillId: skill.id,
    target: join(baseFor(options), targetDir, skill.id),
    agents,
    renderer,
    rendererVersion: 1,
    files: Object.fromEntries(Object.entries(skill.files).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function hasNativeExtension(skill: CanonicalSkill, agent: AgentId): boolean {
  const extension = skill.metadata.extensions?.[agent];
  return Boolean(extension && typeof extension === 'object' && (extension as Record<string, unknown>).native === true);
}

export function planSkillMaterializations(skill: CanonicalSkill, agents: AgentId[], options: MaterializationOptions): MaterializationPlan[] {
  const selected = [...new Set(agents)];
  const plans: MaterializationPlan[] = [];

  if (options.mode === 'native') {
    for (const agent of selected) plans.push(makePlan(skill, [agent], agent, NATIVE_DIR[agent], options));
    return plans;
  }

  const nativeAgents = selected.filter((agent) => hasNativeExtension(skill, agent));
  const portableAgents = selected.filter((agent) => !nativeAgents.includes(agent));
  const shared = SHARED_AGENTS.filter((agent) => portableAgents.includes(agent));
  if (shared.length) plans.push(makePlan(skill, shared, 'portable', '.agents/skills', options));
  if (portableAgents.includes('claude-code')) plans.push(makePlan(skill, ['claude-code'], 'claude-code', '.claude/skills', options));
  for (const agent of nativeAgents) plans.push(makePlan(skill, [agent], agent, NATIVE_DIR[agent], options));
  return plans;
}

export function renderPlanIntegrity(plan: MaterializationPlan): string {
  const chunks: Buffer[] = [];
  for (const [path, bytes] of Object.entries(plan.files).sort(([a], [b]) => a.localeCompare(b))) {
    chunks.push(Buffer.from(`${path}\0${sha256Bytes(bytes)}\n`, 'utf8'));
  }
  return `sha256:${sha256Bytes(Buffer.concat(chunks))}`;
}
