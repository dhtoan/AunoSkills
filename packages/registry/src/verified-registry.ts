import { createPublicKey, type KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  validateRegistryIndexV2,
  validateRegistryTrustDocument,
  validateSkillMetadata,
  type RegistryIndexV2,
  type RegistryVersionV2,
  type SigningKeyV1,
} from '../../schema/src/index.ts';
import { canonicalSignedPayload, verifyEd25519, verifyIntegrity } from '../../security/src/index.ts';
import { AunoError, sha256Bytes } from '../../shared/src/index.ts';
import { registryAuthHeaders } from './auth.ts';
import { RegistryTrustStore } from './trust.ts';
import type { RegistryAuthConfig, RegistryFetch, RegistryVerification } from './types.ts';

export interface VerifiedRegistryOptions {
  fetchFn?: RegistryFetch;
  auth?: RegistryAuthConfig;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

function publicKeyObject(key: SigningKeyV1): KeyObject {
  try {
    return createPublicKey({ key: Buffer.from(key.publicKey, 'base64'), format: 'der', type: 'spki' });
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_TRUST_METADATA_INVALID',
      message: `AUNO_TRUST_METADATA_INVALID invalid public key ${key.keyId}`,
      category: 'integrity',
      cause,
    });
  }
}

export class VerifiedRegistryClient {
  readonly #trust: RegistryTrustStore;
  readonly #fetchFn: RegistryFetch;
  readonly #auth: RegistryAuthConfig;
  readonly #env: Record<string, string | undefined>;
  readonly #now: () => Date;
  #index?: RegistryIndexV2;
  #indexSignatureDigest?: string;
  #verifiedVersions = new Map<string, RegistryVersionV2>();
  #verification = new Map<string, RegistryVerification>();

  constructor(readonly base: string, anchors: SigningKeyV1[], options: VerifiedRegistryOptions = {}) {
    this.#trust = new RegistryTrustStore(anchors);
    this.#fetchFn = options.fetchFn ?? fetch;
    this.#auth = options.auth ?? { type: 'none' };
    this.#env = options.env ?? process.env;
    this.#now = options.now ?? (() => new Date());
  }

  #remote(): boolean { return /^https?:\/\//i.test(this.base); }

  async #read(relativePath: string): Promise<Buffer> {
    if (!this.#remote()) return readFile(join(this.base, relativePath));
    const headers = registryAuthHeaders(this.#auth, this.#env);
    const response = await this.#fetchFn(`${this.base.replace(/\/$/, '')}/${relativePath}`, { headers });
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? 'AUNO_REGISTRY_AUTH_FAILED' : 'AUNO_REGISTRY_UNREACHABLE';
      throw new AunoError({
        code,
        message: `${code} HTTP ${response.status} ${relativePath}`,
        category: 'registry',
        retryable: response.status >= 500,
      });
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async #loadTrust(): Promise<{ bytes: Buffer }> {
    const bytes = await this.#read('trust.json');
    let raw: unknown;
    try { raw = JSON.parse(bytes.toString('utf8')); }
    catch (cause) {
      throw new AunoError({ code: 'AUNO_TRUST_METADATA_INVALID', message: 'AUNO_TRUST_METADATA_INVALID invalid JSON', category: 'integrity', cause });
    }
    const document = validateRegistryTrustDocument(raw);
    this.#trust.verifyAndApply(document, this.#now());
    return { bytes };
  }

  async loadIndex(): Promise<RegistryIndexV2> {
    if (this.#index) return this.#index;
    const trust = await this.#loadTrust();
    const bytes = await this.#read('index.json');
    const index = validateRegistryIndexV2(JSON.parse(bytes.toString('utf8')));
    verifyIntegrity(trust.bytes, index.trustDigest);
    const signer = this.#trust.requireActiveKey(index.signature.keyId, this.#now());
    verifyEd25519(canonicalSignedPayload(index), index.signature, publicKeyObject(signer));
    this.#indexSignatureDigest = `sha256:${sha256Bytes(Buffer.from(index.signature.signature, 'base64'))}`;
    this.#index = index;
    return index;
  }

  async listSkills(): Promise<string[]> {
    return Object.keys((await this.loadIndex()).skills).sort();
  }

  async getVersion(skillId: string, version: string): Promise<RegistryVersionV2> {
    const cacheKey = `${skillId}@${version}`;
    const cached = this.#verifiedVersions.get(cacheKey);
    if (cached) return cached;
    const index = await this.loadIndex();
    const entry = index.skills[skillId]?.versions[version];
    if (!entry) {
      throw new AunoError({ code: 'AUNO_REGISTRY_VERSION_NOT_FOUND', message: `AUNO_REGISTRY_VERSION_NOT_FOUND ${skillId}@${version}`, category: 'registry' });
    }
    const digest = entry.manifest.replace(/^sha256:/, '');
    const bytes = await this.#read(`manifests/sha256/${digest}`);
    verifyIntegrity(bytes, entry.manifest);
    const signer = this.#trust.requireActiveKey(entry.manifestSignature.keyId, this.#now());
    verifyEd25519(bytes, entry.manifestSignature, publicKeyObject(signer));
    const metadata = validateSkillMetadata(JSON.parse(bytes.toString('utf8')));
    if (metadata.id !== skillId || metadata.version !== version) {
      throw new AunoError({
        code: 'AUNO_REGISTRY_METADATA_MISMATCH',
        message: `AUNO_REGISTRY_METADATA_MISMATCH ${skillId}@${version}`,
        category: 'integrity',
      });
    }
    const verified: RegistryVersionV2 = { ...entry, metadata };
    this.#verifiedVersions.set(cacheKey, verified);
    this.#verification.set(cacheKey, {
      registryKeyId: index.signature.keyId,
      manifestKeyId: entry.manifestSignature.keyId,
      registrySignatureDigest: this.#indexSignatureDigest!,
      manifestSignatureDigest: `sha256:${sha256Bytes(Buffer.from(entry.manifestSignature.signature, 'base64'))}`,
    });
    return verified;
  }

  async fetchBundle(hash: string): Promise<Buffer> {
    const digest = hash.replace(/^sha256:/, '');
    const bytes = await this.#read(`blobs/sha256/${digest}`);
    verifyIntegrity(bytes, hash);
    return bytes;
  }

  async getVerification(skillId: string, version: string): Promise<RegistryVerification> {
    const cacheKey = `${skillId}@${version}`;
    if (!this.#verification.has(cacheKey)) await this.getVersion(skillId, version);
    return this.#verification.get(cacheKey)!;
  }

  trustStore(): RegistryTrustStore { return this.#trust; }
}
