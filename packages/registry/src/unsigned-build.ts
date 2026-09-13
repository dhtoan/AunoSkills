import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CanonicalSkill } from '../../adapters/src/index.ts';
import type { RegistryVersionV2, SkillMetadataV1 } from '../../schema/src/index.ts';
import { stableStringify, validateSkillMetadata } from '../../schema/src/index.ts';
import { sha256Bytes } from '../../shared/src/index.ts';
import { encodeSkillBundle } from './bundle.ts';

export type UnsignedRegistryVersion = Omit<RegistryVersionV2, 'manifestSignature'>;

export interface UnsignedRegistryPayload {
  registry: string;
  skills: Record<string, { latest: string; versions: Record<string, UnsignedRegistryVersion> }>;
  manifests: Record<string, Uint8Array>;
  bundles: Record<string, Uint8Array>;
}

export interface BuildUnsignedRegistryPayloadOptions {
  sourceDir: string;
  registry: string;
  repository: string;
  commit: string;
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

export async function buildUnsignedRegistryPayload(options: BuildUnsignedRegistryPayloadOptions): Promise<UnsignedRegistryPayload> {
  const skills: UnsignedRegistryPayload['skills'] = {};
  const manifests: Record<string, Uint8Array> = {};
  const bundles: Record<string, Uint8Array> = {};
  const entries = (await readdir(options.sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const { metadata, skill } = await canonicalSkill(options.sourceDir, entry.name);
    const manifestBytes = Buffer.from(stableStringify(metadata), 'utf8');
    const manifestDigest = sha256Bytes(manifestBytes);
    const bundle = encodeSkillBundle(skill);
    const bundleDigest = sha256Bytes(bundle);
    manifests[manifestDigest] = manifestBytes;
    bundles[bundleDigest] = bundle;

    const version: UnsignedRegistryVersion = {
      manifest: `sha256:${manifestDigest}`,
      bundle: `sha256:${bundleDigest}`,
      trust: 'verified',
      publisher: metadata.publisher ?? options.registry,
      provenance: {
        repository: options.repository,
        commit: options.commit,
        publisher: metadata.publisher ?? options.registry,
        build: 'aunoskills-unsigned-registry-builder',
      },
      metadata,
      dependencies: metadata.dependencies,
      capabilities: metadata.capabilities,
    };
    skills[metadata.id] = { latest: metadata.version, versions: { [metadata.version]: version } };
  }

  return { registry: options.registry, skills, manifests, bundles };
}
