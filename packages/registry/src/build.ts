import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CanonicalSkill } from '../../adapters/src/index.ts';
import type {
  RegistryIndexV1,
  RegistryIndexV2,
  RegistryTrustDocumentV1,
  RegistryVersionV1,
  RegistryVersionV2,
  SigningKeyV1,
  SkillMetadataV1,
} from '../../schema/src/index.ts';
import { stableStringify, validateRegistryIndexV2, validateSkillMetadata } from '../../schema/src/index.ts';
import { canonicalSignedPayload, signEd25519, type Ed25519PrivateKey } from '../../security/src/index.ts';
import { sha256Bytes, writeTextAtomic } from '../../shared/src/index.ts';
import { encodeSkillBundle } from './bundle.ts';
import { validateRegistryIndex } from './validate.ts';

export interface BuildStaticRegistryOptions { sourceDir: string; outputDir: string; registry: string; repository: string; commit: string }
export interface BuildSignedStaticRegistryOptions extends BuildStaticRegistryOptions {
  signing: { key: SigningKeyV1; privateKey: Ed25519PrivateKey };
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

async function skillDirectories(sourceDir: string) {
  return (await readdir(sourceDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
}

async function canonicalSkill(sourceDir: string, entryName: string): Promise<{ metadata: SkillMetadataV1; skill: CanonicalSkill }> {
  const dir = join(sourceDir, entryName);
  const metadata = validateSkillMetadata(JSON.parse(await readFile(join(dir, 'auno.json'), 'utf8'))) as SkillMetadataV1;
  if (metadata.id !== entryName) throw new TypeError(`AUNO_REGISTRY_METADATA_MISMATCH ${entryName}`);
  const files = await collectFiles(dir);
  if (!files['SKILL.md']) throw new TypeError(`AUNO_BUNDLE_SKILL_MISSING ${entryName}`);
  return { metadata, skill: { id: metadata.id, metadata, files } };
}

export async function buildStaticRegistry(options: BuildStaticRegistryOptions): Promise<RegistryIndexV1> {
  const blobs = join(options.outputDir, 'blobs', 'sha256');
  await rm(join(options.outputDir, 'blobs'), { recursive: true, force: true });
  await mkdir(blobs, { recursive: true });
  const index: RegistryIndexV1 = { schemaVersion: 1, registry: options.registry, skills: {} };
  for (const entry of await skillDirectories(options.sourceDir)) {
    const { metadata, skill } = await canonicalSkill(options.sourceDir, entry.name);
    const bundle = encodeSkillBundle(skill);
    const bundleDigest = sha256Bytes(bundle);
    const manifestDigest = sha256Bytes(Buffer.from(stableStringify(metadata)));
    await writeFile(join(blobs, bundleDigest), bundle);
    const version: RegistryVersionV1 = {
      manifest: `sha256:${manifestDigest}`,
      bundle: `sha256:${bundleDigest}`,
      trust: 'verified',
      publisher: metadata.publisher ?? options.registry,
      provenance: { repository: options.repository, commit: options.commit, publisher: metadata.publisher ?? options.registry, build: 'aunoskills-registry-builder' },
      metadata,
      dependencies: metadata.dependencies,
      capabilities: metadata.capabilities,
    };
    index.skills[metadata.id] = { latest: metadata.version, versions: { [metadata.version]: version } };
  }
  validateRegistryIndex(index);
  await writeTextAtomic(join(options.outputDir, 'index.json'), stableStringify(index));
  return index;
}

export async function buildSignedStaticRegistry(options: BuildSignedStaticRegistryOptions): Promise<RegistryIndexV2> {
  const blobs = join(options.outputDir, 'blobs', 'sha256');
  const manifests = join(options.outputDir, 'manifests', 'sha256');
  await rm(join(options.outputDir, 'blobs'), { recursive: true, force: true });
  await rm(join(options.outputDir, 'manifests'), { recursive: true, force: true });
  await mkdir(blobs, { recursive: true });
  await mkdir(manifests, { recursive: true });

  const trustUnsigned = { schemaVersion: 1 as const, registry: options.registry, keys: [options.signing.key] };
  const trust: RegistryTrustDocumentV1 = {
    ...trustUnsigned,
    signature: signEd25519(canonicalSignedPayload(trustUnsigned), options.signing.key.keyId, options.signing.privateKey),
  };
  const trustBytes = Buffer.from(stableStringify(trust), 'utf8');
  await writeFile(join(options.outputDir, 'trust.json'), trustBytes);

  const skills: RegistryIndexV2['skills'] = {};
  for (const entry of await skillDirectories(options.sourceDir)) {
    const { metadata, skill } = await canonicalSkill(options.sourceDir, entry.name);
    const manifestBytes = Buffer.from(stableStringify(metadata), 'utf8');
    const manifestDigest = sha256Bytes(manifestBytes);
    const bundle = encodeSkillBundle(skill);
    const bundleDigest = sha256Bytes(bundle);
    await writeFile(join(manifests, manifestDigest), manifestBytes);
    await writeFile(join(blobs, bundleDigest), bundle);
    const version: RegistryVersionV2 = {
      manifest: `sha256:${manifestDigest}`,
      manifestSignature: signEd25519(manifestBytes, options.signing.key.keyId, options.signing.privateKey),
      bundle: `sha256:${bundleDigest}`,
      trust: 'verified',
      publisher: metadata.publisher ?? options.registry,
      provenance: { repository: options.repository, commit: options.commit, publisher: metadata.publisher ?? options.registry, build: 'aunoskills-signed-registry-builder' },
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
    signature: signEd25519(canonicalSignedPayload(unsignedIndex), options.signing.key.keyId, options.signing.privateKey),
  };
  validateRegistryIndexV2(index);
  await writeTextAtomic(join(options.outputDir, 'index.json'), stableStringify(index));
  return index;
}
