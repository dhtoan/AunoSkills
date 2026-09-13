import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CanonicalSkill } from '../../adapters/src/index.ts';
import type {
  RegistryIndexV2,
  RegistryTrustDocumentV1,
  RegistryVersionV2,
  SigningKeyV1,
  SkillMetadataV1,
} from '../../schema/src/index.ts';
import { stableStringify, validateRegistryIndexV2, validateSkillMetadata } from '../../schema/src/index.ts';
import {
  canonicalSignedPayload,
  signEd25519,
  type Ed25519PrivateKey,
} from '../../security/src/index.ts';
import { AunoError, sha256Bytes, writeTextAtomic } from '../../shared/src/index.ts';
import { encodeSkillBundle } from './bundle.ts';
import { RegistryTrustStore } from './trust.ts';

export interface DelegatedReleaseSigner {
  trust: RegistryTrustDocumentV1;
  key: SigningKeyV1;
}

export interface BuildDelegatedSignedRegistryOptions {
  sourceDir: string;
  outputDir: string;
  registry: string;
  repository: string;
  commit: string;
  rootAnchor: SigningKeyV1;
  trust: RegistryTrustDocumentV1;
  releaseKeyId: string;
  releasePrivateKey: Ed25519PrivateKey;
  now?: Date;
}

function releaseError(code: string, message: string): AunoError {
  return new AunoError({ code, message: `${code} ${message}`, category: 'integrity' });
}

function isKeyObject(value: Ed25519PrivateKey): value is KeyObject {
  return typeof value === 'object' && !Buffer.isBuffer(value) && 'export' in value && typeof value.export === 'function';
}

function privateKeyObject(value: Ed25519PrivateKey): KeyObject {
  return isKeyObject(value) ? value : createPrivateKey(value);
}

function publicKeyBase64FromPrivate(value: Ed25519PrivateKey): string {
  try {
    return createPublicKey(privateKeyObject(value)).export({ type: 'spki', format: 'der' }).toString('base64');
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_RELEASE_KEY_MISMATCH',
      message: 'AUNO_RELEASE_KEY_MISMATCH release private key is invalid',
      category: 'integrity',
      cause,
    });
  }
}

async function collectFiles(root: string, current = root): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(files, await collectFiles(root, path));
    else if (entry.isFile()) files[relative(root, path).replaceAll('\\', '/')] = await readFile(path);
  }
  return files;
}

async function canonicalSkill(sourceDir: string, entryName: string): Promise<{ metadata: SkillMetadataV1; skill: CanonicalSkill }> {
  const dir = join(sourceDir, entryName);
  const metadata = validateSkillMetadata(JSON.parse(await readFile(join(dir, 'auno.json'), 'utf8'))) as SkillMetadataV1;
  if (metadata.id !== entryName) throw new TypeError(`AUNO_REGISTRY_METADATA_MISMATCH ${entryName}`);
  const files = await collectFiles(dir);
  if (!files['SKILL.md']) throw new TypeError(`AUNO_BUNDLE_SKILL_MISSING ${entryName}`);
  return { metadata, skill: { id: metadata.id, metadata, files } };
}

export function validateDelegatedReleaseSigner(
  trust: RegistryTrustDocumentV1,
  rootAnchor: SigningKeyV1,
  releaseKeyId: string,
  releasePrivateKey: Ed25519PrivateKey,
  now = new Date(),
): DelegatedReleaseSigner {
  const store = new RegistryTrustStore([rootAnchor]);
  const verifiedTrust = store.verifyAndApply(trust, now);
  const delegated = store.getKey(releaseKeyId);
  if (!delegated || delegated.keyId === rootAnchor.keyId) {
    throw releaseError('AUNO_RELEASE_KEY_NOT_DELEGATED', releaseKeyId);
  }
  const active = store.requireActiveKey(releaseKeyId, now);
  const derivedPublicKey = publicKeyBase64FromPrivate(releasePrivateKey);
  if (derivedPublicKey !== active.publicKey) {
    throw releaseError('AUNO_RELEASE_KEY_MISMATCH', releaseKeyId);
  }
  return { trust: verifiedTrust, key: active };
}

export async function buildDelegatedSignedRegistry(options: BuildDelegatedSignedRegistryOptions): Promise<RegistryIndexV2> {
  const signer = validateDelegatedReleaseSigner(
    options.trust,
    options.rootAnchor,
    options.releaseKeyId,
    options.releasePrivateKey,
    options.now,
  );
  if (signer.trust.registry !== options.registry) {
    throw releaseError('AUNO_OFFICIAL_TRUST_INVALID', `trust registry ${signer.trust.registry} does not match ${options.registry}`);
  }

  const blobs = join(options.outputDir, 'blobs', 'sha256');
  const manifests = join(options.outputDir, 'manifests', 'sha256');
  await rm(join(options.outputDir, 'blobs'), { recursive: true, force: true });
  await rm(join(options.outputDir, 'manifests'), { recursive: true, force: true });
  await mkdir(blobs, { recursive: true });
  await mkdir(manifests, { recursive: true });

  const trustBytes = Buffer.from(stableStringify(signer.trust), 'utf8');
  await writeFile(join(options.outputDir, 'trust.json'), trustBytes);

  const skills: RegistryIndexV2['skills'] = {};
  const entries = (await readdir(options.sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const { metadata, skill } = await canonicalSkill(options.sourceDir, entry.name);
    const manifestBytes = Buffer.from(stableStringify(metadata), 'utf8');
    const manifestDigest = sha256Bytes(manifestBytes);
    const bundle = encodeSkillBundle(skill);
    const bundleDigest = sha256Bytes(bundle);
    await writeFile(join(manifests, manifestDigest), manifestBytes);
    await writeFile(join(blobs, bundleDigest), bundle);

    const version: RegistryVersionV2 = {
      manifest: `sha256:${manifestDigest}`,
      manifestSignature: signEd25519(manifestBytes, signer.key.keyId, options.releasePrivateKey),
      bundle: `sha256:${bundleDigest}`,
      trust: 'verified',
      publisher: metadata.publisher ?? options.registry,
      provenance: {
        repository: options.repository,
        commit: options.commit,
        publisher: metadata.publisher ?? options.registry,
        build: 'aunoskills-delegated-registry-builder',
      },
      metadata,
      dependencies: metadata.dependencies,
      capabilities: metadata.capabilities,
    };
    skills[metadata.id] = { latest: metadata.version, versions: { [metadata.version]: version } };
  }

  const unsignedIndex: Omit<RegistryIndexV2, 'signature'> = {
    schemaVersion: 2,
    registry: options.registry,
    trustDigest: `sha256:${sha256Bytes(trustBytes)}`,
    skills,
  };
  const index: RegistryIndexV2 = {
    ...unsignedIndex,
    signature: signEd25519(canonicalSignedPayload(unsignedIndex), signer.key.keyId, options.releasePrivateKey),
  };
  validateRegistryIndexV2(index);
  await writeTextAtomic(join(options.outputDir, 'index.json'), stableStringify(index));
  return index;
}
