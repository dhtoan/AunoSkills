import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathExists, writeJsonAtomic, writeTextAtomic } from '../../shared/src/index.ts';
import { stateDir, writeOwnership, type OwnershipState } from './state.ts';

export interface TransactionEntry { target: string; backup?: string; created: boolean }
export interface TransactionJournal { state: 'PREPARED' | 'COMMITTING' | 'COMMITTED' | 'ROLLED_BACK'; operation?: string; entries: TransactionEntry[] }
interface TransactionSnapshot { lockfileText: string | null; ownership: OwnershipState }

export async function rollbackJournal(journal: TransactionJournal): Promise<void> {
  for (const entry of [...journal.entries].reverse()) {
    await rm(entry.target, { recursive: true, force: true });
    if (!entry.created && entry.backup && await pathExists(entry.backup)) await cp(entry.backup, entry.target, { recursive: true, force: true });
  }
}

export async function recoverInterruptedTransactions(projectRoot: string): Promise<number> {
  const transactions = join(stateDir(projectRoot), 'transactions');
  let dirs;
  try { dirs = await readdir(transactions, { withFileTypes: true }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  let recovered = 0;
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const journalPath = join(transactions, dir.name, 'journal.json');
    let journal: TransactionJournal;
    try { journal = JSON.parse(await readFile(journalPath, 'utf8')) as TransactionJournal; } catch { continue; }
    if (journal.state === 'COMMITTED' || journal.state === 'ROLLED_BACK') continue;
    await rollbackJournal(journal);
    const snapshotPath = join(transactions, dir.name, 'snapshot.json');
    if (await pathExists(snapshotPath)) {
      const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as TransactionSnapshot;
      await writeOwnership(projectRoot, snapshot.ownership ?? {});
    }
    journal.state = 'ROLLED_BACK';
    await writeJsonAtomic(journalPath, journal);
    recovered += 1;
  }
  return recovered;
}

export async function rollbackLatestCommittedTransaction(projectRoot: string): Promise<string> {
  const transactions = join(stateDir(projectRoot), 'transactions');
  const dirs = (await readdir(transactions, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  for (const name of dirs) {
    const txRoot = join(transactions, name);
    const journalPath = join(txRoot, 'journal.json');
    let journal: TransactionJournal;
    try { journal = JSON.parse(await readFile(journalPath, 'utf8')) as TransactionJournal; } catch { continue; }
    if (journal.state !== 'COMMITTED') continue;
    const snapshot = JSON.parse(await readFile(join(txRoot, 'snapshot.json'), 'utf8')) as TransactionSnapshot;
    await rollbackJournal(journal);
    await writeOwnership(projectRoot, snapshot.ownership ?? {});
    const lockPath = join(projectRoot, 'skills-lock.json');
    if (snapshot.lockfileText === null) await rm(lockPath, { force: true });
    else await writeTextAtomic(lockPath, snapshot.lockfileText);
    journal.state = 'ROLLED_BACK';
    await writeJsonAtomic(journalPath, journal);
    return basename(txRoot);
  }
  throw new Error('AUNO_ROLLBACK_NOT_FOUND');
}
