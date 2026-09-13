import { mkdir, rename, rm, writeFile, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MaterializationPlan } from '../../adapters/src/index.ts';
import { renderPlanIntegrity } from '../../adapters/src/index.ts';
import { validateArchiveEntryPath } from '../../security/src/index.ts';
import { AunoError, pathExists, writeJsonAtomic } from '../../shared/src/index.ts';
import { readOwnership, writeOwnership, stateDir } from './state.ts';
import { rollbackJournal, type TransactionJournal } from './transactions.ts';

export interface MaterializeOptions {
  beforePublish?: (plan: MaterializationPlan, index: number) => Promise<void>;
  lockfileSnapshot?: string | null;
}

export interface MaterializationResult { transactionDir: string }

async function writePlan(root: string, plan: MaterializationPlan): Promise<void> {
  for (const [relative, bytes] of Object.entries(plan.files)) {
    const safe = validateArchiveEntryPath(relative);
    const target = join(root, safe);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

export async function applyMaterializationPlans(projectRoot: string, plans: MaterializationPlan[], options: MaterializeOptions = {}): Promise<MaterializationResult> {
  const ownership = await readOwnership(projectRoot);
  const ownershipBefore = structuredClone(ownership);
  for (const plan of plans) {
    if (await pathExists(plan.target) && !ownership[plan.target]) throw new AunoError({ code: 'AUNO_TARGET_COLLISION', message: `AUNO_TARGET_COLLISION ${plan.target}`, category: 'materialization' });
  }

  const txRoot = join(stateDir(projectRoot), 'transactions', `tx-${Date.now()}-${randomUUID()}`);
  const stageRoot = join(txRoot, 'stage');
  const backupRoot = join(txRoot, 'backup');
  await mkdir(stageRoot, { recursive: true });
  await mkdir(backupRoot, { recursive: true });
  const journal: TransactionJournal = { state: 'PREPARED', operation: 'materialize', entries: [] };
  const journalPath = join(txRoot, 'journal.json');
  await writeJsonAtomic(join(txRoot, 'snapshot.json'), { lockfileText: options.lockfileSnapshot ?? null, ownership: ownershipBefore });

  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index];
    const staged = join(stageRoot, String(index));
    await mkdir(staged, { recursive: true });
    await writePlan(staged, plan);
    const exists = await pathExists(plan.target);
    let backup: string | undefined;
    if (exists) {
      backup = join(backupRoot, String(index));
      await cp(plan.target, backup, { recursive: true, force: true });
    }
    journal.entries.push({ target: plan.target, backup, created: !exists });
  }
  await writeJsonAtomic(journalPath, journal);
  journal.state = 'COMMITTING';
  await writeJsonAtomic(journalPath, journal);

  try {
    for (let index = 0; index < plans.length; index++) {
      const plan = plans[index];
      await options.beforePublish?.(plan, index);
      await rm(plan.target, { recursive: true, force: true });
      await mkdir(dirname(plan.target), { recursive: true });
      await rename(join(stageRoot, String(index)), plan.target);
    }
    for (const plan of plans) ownership[plan.target] = { skillId: plan.skillId, integrity: renderPlanIntegrity(plan), renderer: plan.renderer, rendererVersion: plan.rendererVersion, agents: plan.agents };
    await writeOwnership(projectRoot, ownership);
    journal.state = 'COMMITTED';
    await writeJsonAtomic(journalPath, journal);
    return { transactionDir: txRoot };
  } catch (error) {
    await rollbackJournal(journal);
    await writeOwnership(projectRoot, ownershipBefore);
    journal.state = 'ROLLED_BACK';
    await writeJsonAtomic(journalPath, journal);
    throw error;
  }
}
