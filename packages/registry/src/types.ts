import type { RegistryIndexV1, RegistryVersionV1 } from '../../schema/src/index.ts';

export type RegistryFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type RegistryAuthConfig =
  | { type: 'none' }
  | { type: 'bearer-env'; env: string };

export interface RegistryClient {
  loadIndex(): Promise<RegistryIndexV1>;
  listSkills(): Promise<string[]>;
  getVersion(skillId: string, version: string): Promise<RegistryVersionV1>;
  fetchBundle(hash: string): Promise<Buffer>;
}
