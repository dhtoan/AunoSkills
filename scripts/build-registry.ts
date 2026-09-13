import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildStaticRegistry } from '../packages/registry/src/index.ts';

const root = resolve(process.cwd());
let commit = process.env.REGISTRY_SOURCE_COMMIT;
if (!commit) {
  try { commit = (await readFile(resolve(root, 'registry/source-revision.txt'), 'utf8')).trim(); } catch {}
}
if (!commit) {
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { commit = 'development'; }
}

await buildStaticRegistry({
  sourceDir: resolve(root, 'registry/skills'),
  outputDir: resolve(root, 'registry'),
  registry: 'auno',
  repository: 'github:dhtoan/AunoSkills',
  commit,
});
console.log(`Built registry at ${resolve(root, 'registry')} from ${commit}`);
