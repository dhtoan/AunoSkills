import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  validateRegistryIndex,
  validateRegistryTrustDocument,
  validateSigningKey,
  type SigningKeyV1,
} from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';
import { StaticRegistryClient } from './static-registry.ts';
import { VerifiedRegistryClient, type VerifiedRegistryOptions } from './verified-registry.ts';
import type { RegistryClient, RegistryFetch } from './types.ts';

export type OfficialRegistryMode = 'verified-v2' | 'legacy-awaiting-production-trust';

export interface OfficialRegistryStatus {
  mode: OfficialRegistryMode;
  verified: boolean;
  schemaVersion: number;
  rootKeyId?: string;
  releaseKeyIds: string[];
}

export type OfficialRegistryOptions = VerifiedRegistryOptions;

function officialError(message: string, cause?: unknown): AunoError {
  return new AunoError({
    code: 'AUNO_OFFICIAL_TRUST_INVALID',
    message: `AUNO_OFFICIAL_TRUST_INVALID ${message}`,
    category: 'integrity',
    cause,
  });
}

function remote(base: string): boolean {
  return /^https?:\/\//i.test(base);
}

async function readPublicFile(base: string, relativePath: string, fetchFn: RegistryFetch = fetch): Promise<Buffer | undefined> {
  if (!remote(base)) {
    try { return await readFile(join(base, relativePath)); }
    catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw cause;
    }
  }
  const response = await fetchFn(`${base.replace(/\/$/, '')}/${relativePath}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw officialError(`HTTP ${response.status} ${relativePath}`);
  return Buffer.from(await response.arrayBuffer());
}

function parseJson(bytes: Buffer, label: string): unknown {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (cause) { throw officialError(`${label} is not valid JSON`, cause); }
}

export async function loadOfficialRegistryTrust(base: string, options: OfficialRegistryOptions = {}): Promise<SigningKeyV1 | undefined> {
  if ('anchors' in (options as Record<string, unknown>)) {
    throw officialError('official root anchors cannot be replaced by caller configuration');
  }
  const bytes = await readPublicFile(base, 'root.json', options.fetchFn);
  if (!bytes) return undefined;
  try { return validateSigningKey(parseJson(bytes, 'root.json')); }
  catch (cause) {
    if (cause instanceof AunoError && cause.code === 'AUNO_OFFICIAL_TRUST_INVALID') throw cause;
    throw officialError('root.json is invalid', cause);
  }
}

export async function createOfficialRegistryClient(base: string, options: OfficialRegistryOptions = {}): Promise<RegistryClient> {
  if ('anchors' in (options as Record<string, unknown>)) {
    throw officialError('official root anchors cannot be replaced by caller configuration');
  }
  const root = await loadOfficialRegistryTrust(base, options);
  if (!root) return new StaticRegistryClient(base, options.fetchFn);

  const indexBytes = await readPublicFile(base, 'index.json', options.fetchFn);
  if (!indexBytes) throw officialError('index.json is missing');
  const rawIndex = parseJson(indexBytes, 'index.json');
  const schemaVersion = (rawIndex as { schemaVersion?: unknown })?.schemaVersion;
  if (schemaVersion !== 2) throw officialError('root.json requires registry schema v2');

  return new VerifiedRegistryClient(base, [root], options);
}

export async function officialRegistryStatus(base: string, options: OfficialRegistryOptions = {}): Promise<OfficialRegistryStatus> {
  const root = await loadOfficialRegistryTrust(base, options);
  const indexBytes = await readPublicFile(base, 'index.json', options.fetchFn);
  if (!indexBytes) throw officialError('index.json is missing');
  const rawIndex = parseJson(indexBytes, 'index.json');
  const parsed = validateRegistryIndex(rawIndex);

  if (!root) {
    return {
      mode: 'legacy-awaiting-production-trust',
      verified: false,
      schemaVersion: parsed.schemaVersion,
      releaseKeyIds: [],
    };
  }
  if (parsed.schemaVersion !== 2) throw officialError('root.json requires registry schema v2');

  const client = new VerifiedRegistryClient(base, [root], options);
  await client.loadIndex();
  const trustBytes = await readPublicFile(base, 'trust.json', options.fetchFn);
  if (!trustBytes) throw officialError('trust.json is missing');
  const trust = validateRegistryTrustDocument(parseJson(trustBytes, 'trust.json'));
  const releaseKeyIds = trust.keys
    .filter((key) => key.keyId !== root.keyId)
    .map((key) => key.keyId)
    .sort();
  return {
    mode: 'verified-v2',
    verified: true,
    schemaVersion: 2,
    rootKeyId: root.keyId,
    releaseKeyIds,
  };
}
