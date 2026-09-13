import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RegistryIndexV1, RegistryVersionV1 } from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';
import type { RegistryClient, RegistryFetch } from './types.ts';
import { validateRegistryIndex } from './validate.ts';

export class StaticRegistryClient implements RegistryClient {
  #index?: RegistryIndexV1;
  constructor(readonly base: string, readonly fetchFn: RegistryFetch = fetch) {}

  #remote(): boolean { return /^https?:\/\//i.test(this.base); }

  async #read(relativePath: string): Promise<Buffer> {
    if (!this.#remote()) return readFile(join(this.base, relativePath));
    const response = await this.fetchFn(`${this.base.replace(/\/$/, '')}/${relativePath}`);
    if (!response.ok) {
      throw new AunoError({ code: 'AUNO_REGISTRY_UNREACHABLE', message: `AUNO_REGISTRY_UNREACHABLE ${response.status} ${relativePath}`, category: 'registry', retryable: response.status >= 500 });
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async loadIndex(): Promise<RegistryIndexV1> {
    if (!this.#index) this.#index = validateRegistryIndex(JSON.parse((await this.#read('index.json')).toString('utf8')));
    return this.#index;
  }
  async listSkills(): Promise<string[]> { return Object.keys((await this.loadIndex()).skills).sort(); }
  async getVersion(skillId: string, version: string): Promise<RegistryVersionV1> {
    const value = (await this.loadIndex()).skills[skillId]?.versions[version];
    if (!value) throw new AunoError({ code: 'AUNO_REGISTRY_VERSION_NOT_FOUND', message: `AUNO_REGISTRY_VERSION_NOT_FOUND ${skillId}@${version}`, category: 'registry' });
    return value;
  }
  async fetchBundle(hash: string): Promise<Buffer> { return this.#read(`blobs/sha256/${hash.replace(/^sha256:/, '')}`); }
}
