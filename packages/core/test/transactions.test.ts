import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProjectWriteLock, applyMaterializationPlans, readOwnership, recoverInterruptedTransactions } from '../src/index.ts';
import type { MaterializationPlan } from '../../adapters/src/index.ts';

async function root(): Promise<string> { return mkdtemp(join(tmpdir(), 'auno-core-')); }
function plan(target: string, text: string): MaterializationPlan { return { skillId: 'demo', target, agents: ['codex'], renderer: 'portable', rendererVersion: 1, files: { 'SKILL.md': Buffer.from(text) } }; }

test('only one writer can hold the project mutation lock', async () => {
  const project = await root(); const release = await acquireProjectWriteLock(project, 'install');
  await assert.rejects(() => acquireProjectWriteLock(project, 'update'), /AUNO_TRANSACTION_CONFLICT/); await release();
  const release2 = await acquireProjectWriteLock(project, 'update'); await release2();
});

test('stale project lock is recovered when owning pid no longer exists', async () => {
  const project = await root(); const state = join(project, '.aunoskills/state'); await mkdir(state, { recursive: true });
  await writeFile(join(state, 'project.lock'), JSON.stringify({ pid: 99999999, host: process.env.HOSTNAME ?? 'local', operation: 'old' }));
  const release = await acquireProjectWriteLock(project, 'install', { host: process.env.HOSTNAME ?? 'local' }); await release();
});

test('materialization commits staged files and records ownership', async () => {
  const project = await root(); const target = join(project, '.agents/skills/demo');
  await applyMaterializationPlans(project, [plan(target, '# Demo\n')]);
  assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), '# Demo\n');
  const ownership = await readOwnership(project); assert.equal(ownership[target].skillId, 'demo'); assert.match(ownership[target].integrity, /^sha256:/);
});

test('unmanaged existing skill collision is refused', async () => {
  const project = await root(); const target = join(project, '.agents/skills/demo'); await mkdir(target, { recursive: true }); await writeFile(join(target, 'SKILL.md'), 'manual');
  await assert.rejects(() => applyMaterializationPlans(project, [plan(target, 'managed')]), /AUNO_TARGET_COLLISION/);
  assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), 'manual');
});

test('commit failure rolls back previously replaced managed targets', async () => {
  const project = await root(); const first = join(project, '.agents/skills/first'); const second = join(project, '.agents/skills/second');
  await applyMaterializationPlans(project, [{ ...plan(first, 'old-first'), skillId: 'first' }, { ...plan(second, 'old-second'), skillId: 'second' }]);
  let renames = 0;
  await assert.rejects(() => applyMaterializationPlans(project, [{ ...plan(first, 'new-first'), skillId: 'first' }, { ...plan(second, 'new-second'), skillId: 'second' }], { beforePublish: async () => { renames += 1; if (renames === 2) throw new Error('injected publish failure'); } }), /injected publish failure/);
  assert.equal(await readFile(join(first, 'SKILL.md'), 'utf8'), 'old-first'); assert.equal(await readFile(join(second, 'SKILL.md'), 'utf8'), 'old-second');
});

test('recovery rolls back a journal left in COMMITTING state', async () => {
  const project = await root(); const target = join(project, '.agents/skills/demo'); const tx = join(project, '.aunoskills/state/transactions/tx-test'); const backup = join(tx, 'backup/0');
  await mkdir(target, { recursive: true }); await writeFile(join(target, 'SKILL.md'), 'new'); await mkdir(backup, { recursive: true }); await writeFile(join(backup, 'SKILL.md'), 'old');
  await writeFile(join(tx, 'journal.json'), JSON.stringify({ state: 'COMMITTING', entries: [{ target, backup, created: false }] }));
  const recovered = await recoverInterruptedTransactions(project); assert.equal(recovered, 1); assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), 'old');
});
