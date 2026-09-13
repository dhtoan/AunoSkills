import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { AunoError } from '../../shared/src/index.ts';
import { stateDir } from './state.ts';

interface LockMetadata { pid: number; host: string; operation: string; startedAt: string }

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function acquireProjectWriteLock(projectRoot: string, operation: string, options: { host?: string } = {}): Promise<() => Promise<void>> {
  const dir = stateDir(projectRoot);
  const path = join(dir, 'project.lock');
  await mkdir(dir, { recursive: true });
  const host = options.host ?? hostname();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx');
      const metadata: LockMetadata = { pid: process.pid, host, operation, startedAt: new Date().toISOString() };
      await handle.writeFile(JSON.stringify(metadata));
      await handle.close();
      return async () => { await rm(path, { force: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const current = JSON.parse(await readFile(path, 'utf8')) as Partial<LockMetadata>;
        if (current.host === host && typeof current.pid === 'number' && !pidAlive(current.pid)) {
          await rm(path, { force: true });
          continue;
        }
      } catch {}
      throw new AunoError({ code: 'AUNO_TRANSACTION_CONFLICT', message: `AUNO_TRANSACTION_CONFLICT project is locked for another mutation`, category: 'transaction', retryable: true });
    }
  }
  throw new AunoError({ code: 'AUNO_TRANSACTION_CONFLICT', message: 'AUNO_TRANSACTION_CONFLICT', category: 'transaction', retryable: true });
}

export async function withProjectWriteLock<T>(projectRoot: string, operation: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireProjectWriteLock(projectRoot, operation);
  try { return await fn(); } finally { await release(); }
}
