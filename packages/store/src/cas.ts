import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256Bytes } from '../../shared/src/index.ts';
import { verifyIntegrity } from '../../security/src/index.ts';

export class ContentAddressedStore {
  constructor(readonly root: string) {}

  pathFor(hash: string): string {
    const digest = hash.replace(/^sha256:/, '');
    return join(this.root, 'sha256', digest);
  }

  async has(hash: string): Promise<boolean> {
    try { await stat(this.pathFor(hash)); return true; } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async put(bytes: Uint8Array, expectedHash?: string): Promise<string> {
    if (expectedHash) verifyIntegrity(bytes, expectedHash);
    const digest = sha256Bytes(bytes);
    const hash = `sha256:${digest}`;
    const target = this.pathFor(hash);
    if (await this.has(hash)) {
      if (!await this.verify(hash)) throw new Error(`AUNO_CAS_CORRUPT ${hash}`);
      return hash;
    }
    await mkdir(join(this.root, 'sha256'), { recursive: true });
    const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, bytes);
    try {
      await rename(temp, target);
    } catch (error) {
      if (await this.has(hash)) await rm(temp, { force: true });
      else throw error;
    }
    return hash;
  }

  async get(hash: string): Promise<Buffer> {
    return readFile(this.pathFor(hash));
  }

  async verify(hash: string): Promise<boolean> {
    try {
      const bytes = await this.get(hash);
      return `sha256:${sha256Bytes(bytes)}` === (hash.startsWith('sha256:') ? hash : `sha256:${hash}`);
    } catch {
      return false;
    }
  }
}
