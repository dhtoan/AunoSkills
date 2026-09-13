import type { RegistryIndexV1, RegistryIndexV2, RegistryVersionV1, RegistryVersionV2 } from '../../schema/src/index.ts';

export type RegistryFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type RegistryIndex = RegistryIndexV1 | RegistryIndexV2;
export type RegistryVersion = RegistryVersionV1 | RegistryVersionV2;

export type RegistryAuthConfig =
  | { type: 'none' }
  | { type: 'bearer-env'; env: string };

export interface RegistryVerification {
  registryKeyId: string;
  manifestKeyId: string;
  registrySignatureDigest: string;
  manifestSignatureDigest: string;
}

export interface RegistryClient {
  loadIndex(): Promise<RegistryIndex>;
  listSkills(): Promise<string[]>;
  getVersion(skillId: string, version: string): Promise<RegistryVersion>;
  fetchBundle(hash: string): Promise<Buffer>;
  getVerification?(skillId: string, version: string): Promise<RegistryVerification>;
}
