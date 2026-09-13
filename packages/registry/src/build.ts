import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CanonicalSkill } from '../../adapters/src/index.ts';
import type { RegistryIndexV1, RegistryVersionV1, SkillMetadataV1 } from '../../schema/src/index.ts';
import { stableStringify, validateSkillMetadata } from '../../schema/src/index.ts';
import { sha256Bytes, writeTextAtomic } from '../../shared/src/index.ts';
import { encodeSkillBundle } from './bundle.ts';
import { validateRegistryIndex } from './validate.ts';

export interface BuildStaticRegistryOptions { sourceDir: string; outputDir: string; registry: string; repository: string; commit: string }
async function collectFiles(root: string, current = root): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(files, await collectFiles(root, path));
    else if (entry.isFile()) files[relative(root, path).replaceAll('\\', '/')] = await readFile(path);
  }
  return files;
}

export async function buildStaticRegistry(options: BuildStaticRegistryOptions): Promise<RegistryIndexV1> {
  const blobs = join(options.outputDir, 'blobs', 'sha256');
  await rm(join(options.outputDir, 'blobs'), { recursive: true, force: true });
  await mkdir(blobs, { recursive: true });
  const index: RegistryIndexV1 = { schemaVersion: 1, registry: options.registry, skills: {} };
  const entries = (await readdir(options.sourceDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const dir = join(options.sourceDir, entry.name);
    const metadata = validateSkillMetadata(JSON.parse(await readFile(join(dir, 'auno.json'), 'utf8'))) as SkillMetadataV1;
    if (metadata.id !== entry.name) throw new TypeError(`AUNO_REGISTRY_METADATA_MISMATCH ${entry.name}`);
    const files = await collectFiles(dir);
    if (!files['SKILL.md']) throw new TypeError(`AUNO_BUNDLE_SKILL_MISSING ${entry.name}`);
    const skill: CanonicalSkill = { id: metadata.id, metadata, files };
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
