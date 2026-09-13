import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  RegistryIndexV2,
  RegistryTrustDocumentV1,
  RegistryVersionV2,
  SigningKeyV1,
} from '../../schema/src/index.ts';
import { stableStringify, validateRegistryIndexV2 } from '../../schema/src/index.ts';
import {
  canonicalSignedPayload,
  signEd25519,
  type Ed25519PrivateKey,
} from '../../security/src/index.ts';
import { AunoError, sha256Bytes, writeTextAtomic } from '../../shared/src/index.ts';
import { RegistryTrustStore } from './trust.ts';
import { buildUnsignedRegistryPayload } from './unsigned-build.ts';

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

  const payload = await buildUnsignedRegistryPayload({
    sourceDir: options.sourceDir,
    registry: options.registry,
    repository: options.repository,
    commit: options.commit,
  });
  const blobs = join(options.outputDir, 'blobs', 'sha256');
  const manifests = join(options.outputDir, 'manifests', 'sha256');
  await rm(join(options.outputDir, 'blobs'), { recursive: true, force: true });
  await rm(join(options.outputDir, 'manifests'), { recursive: true, force: true });
  await mkdir(blobs, { recursive: true });
  await mkdir(manifests, { recursive: true });

  const trustBytes = Buffer.from(stableStringify(signer.trust), 'utf8');
  await writeFile(join(options.outputDir, 'trust.json'), trustBytes);
  for (const [digest, bytes] of Object.entries(payload.manifests)) await writeFile(join(manifests, digest), bytes);
  for (const [digest, bytes] of Object.entries(payload.bundles)) await writeFile(join(blobs, digest), bytes);

  const skills: RegistryIndexV2['skills'] = {};
  for (const [skillId, entry] of Object.entries(payload.skills)) {
    const versions: Record<string, RegistryVersionV2> = {};
    for (const [versionId, version] of Object.entries(entry.versions)) {
      const manifestDigest = version.manifest.slice('sha256:'.length);
      const manifestBytes = payload.manifests[manifestDigest];
      if (!manifestBytes) throw releaseError('AUNO_REGISTRY_VERIFY_FAILED', `missing manifest bytes ${version.manifest}`);
      versions[versionId] = {
        ...version,
        provenance: version.provenance ? { ...version.provenance, build: 'aunoskills-delegated-registry-builder' } : undefined,
        manifestSignature: signEd25519(manifestBytes, signer.key.keyId, options.releasePrivateKey),
      };
    }
    skills[skillId] = { latest: entry.latest, versions };
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
