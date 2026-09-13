import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { planSkillMaterializations, renderPlanIntegrity } from '../src/index.ts';
import type { CanonicalSkill } from '../src/index.ts';

const skill: CanonicalSkill = {
  id: 'wordpress-security',
  files: {
    'SKILL.md': Buffer.from('# WordPress Security\n'),
    'references/guide.md': Buffer.from('Guide\n'),
  },
  metadata: { schemaVersion: 1, id: 'wordpress-security', version: '1.0.0' },
};

const six = ['codex', 'claude-code', 'cursor', 'windsurf', 'copilot', 'opencode'] as const;

test('portable materialization serves six agents with two physical outputs', () => {
  const plans = planSkillMaterializations(skill, [...six], { scope: 'project', mode: 'portable', projectRoot: '/repo' });
  assert.equal(plans.length, 2);
  assert.deepEqual(plans[0].agents, ['codex', 'cursor', 'windsurf', 'copilot', 'opencode']);
  assert.equal(plans[0].target, join('/repo', '.agents/skills/wordpress-security'));
  assert.deepEqual(plans[1].agents, ['claude-code']);
  assert.equal(plans[1].target, join('/repo', '.claude/skills/wordpress-security'));
});

test('native mode fans out to each agent native path', () => {
  const plans = planSkillMaterializations(skill, ['cursor', 'opencode'], { scope: 'project', mode: 'native', projectRoot: '/repo' });
  assert.deepEqual(plans.map((plan) => plan.target), [
    join('/repo', '.cursor/skills/wordpress-security'),
    join('/repo', '.opencode/skills/wordpress-security'),
  ]);
});

test('portable mode fans out only an agent with a vendor extension', () => {
  const extended: CanonicalSkill = {
    ...skill,
    metadata: { ...skill.metadata, extensions: { cursor: { native: true } } },
  };
  const plans = planSkillMaterializations(extended, ['codex', 'cursor', 'opencode'], { scope: 'project', mode: 'portable', projectRoot: '/repo' });
  assert.deepEqual(plans.map((plan) => [plan.renderer, plan.agents]), [
    ['portable', ['codex', 'opencode']],
    ['cursor', ['cursor']],
  ]);
});

test('rendered plan integrity is deterministic', () => {
  const plan = planSkillMaterializations(skill, ['codex'], { scope: 'project', mode: 'portable', projectRoot: '/repo' })[0];
  assert.equal(renderPlanIntegrity(plan), renderPlanIntegrity({ ...plan, files: { ...plan.files } }));
  assert.match(renderPlanIntegrity(plan), /^sha256:[0-9a-f]{64}$/);
});

test('user scope uses shared user locations where possible', () => {
  const plans = planSkillMaterializations(skill, ['codex', 'claude-code', 'cursor'], { scope: 'user', mode: 'portable', homeDir: '/home/user', projectRoot: '/repo' });
  assert.equal(plans[0].target, join('/home/user', '.agents/skills/wordpress-security'));
  assert.equal(plans[1].target, join('/home/user', '.claude/skills/wordpress-security'));
});
