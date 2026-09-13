import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildUnsignedRegistryPayload } from '../packages/registry/src/index.ts';
import { stableStringify } from '../packages/schema/src/index.ts';

const root = resolve(process.cwd());

async function sourceCommit() {
  if (process.env.REGISTRY_SOURCE_COMMIT) return process.env.REGISTRY_SOURCE_COMMIT;
  try { return (await readFile(resolve(root, 'registry/source-revision.txt'), 'utf8')).trim(); } catch {}
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return 'development'; }
}

const payload = await buildUnsignedRegistryPayload({
  sourceDir: resolve(root, process.env.AUNOSKILLS_REGISTRY_SOURCE_DIR ?? 'registry/skills'),
  registry: process.env.AUNOSKILLS_REGISTRY_ID ?? 'auno',
  repository: process.env.AUNOSKILLS_REGISTRY_REPOSITORY ?? 'github:dhtoan/AunoSkills',
  commit: await sourceCommit(),
});

const summary = {
  registry: payload.registry,
  skills: Object.keys(payload.skills).sort(),
  manifests: Object.keys(payload.manifests).sort(),
  bundles: Object.keys(payload.bundles).sort(),
};

process.stdout.write(stableStringify(summary));
