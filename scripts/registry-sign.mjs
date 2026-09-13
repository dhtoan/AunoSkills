import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildDelegatedSignedRegistry } from '../packages/registry/src/index.ts';
import { validateRegistryTrustDocument, validateSigningKey } from '../packages/schema/src/index.ts';

const root = resolve(process.cwd());
const releasePrivateKey = process.env.AUNOSKILLS_RELEASE_PRIVATE_KEY;
const releaseKeyId = process.env.AUNOSKILLS_RELEASE_KEY_ID;

if (!releasePrivateKey || !releaseKeyId) {
  process.stderr.write('AUNO_RELEASE_KEY_MISSING release private key and key id are required\n');
  process.exitCode = 1;
} else {
  try {
    const sourceDir = resolve(root, process.env.AUNOSKILLS_REGISTRY_SOURCE_DIR ?? 'registry/skills');
    const outputDir = resolve(root, process.env.AUNOSKILLS_REGISTRY_OUTPUT_DIR ?? 'dist/official-registry');
    const rootPath = resolve(root, process.env.AUNOSKILLS_ROOT_PATH ?? 'registry/root.json');
    const trustPath = resolve(root, process.env.AUNOSKILLS_TRUST_PATH ?? 'registry/trust.json');
    const rootAnchor = validateSigningKey(JSON.parse(await readFile(rootPath, 'utf8')));
    const trust = validateRegistryTrustDocument(JSON.parse(await readFile(trustPath, 'utf8')));
    let commit = process.env.REGISTRY_SOURCE_COMMIT;
    if (!commit) {
      try { commit = (await readFile(resolve(root, 'registry/source-revision.txt'), 'utf8')).trim(); } catch {}
    }
    if (!commit) {
      try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { commit = 'development'; }
    }

    await mkdir(outputDir, { recursive: true });
    await buildDelegatedSignedRegistry({
      sourceDir,
      outputDir,
      registry: process.env.AUNOSKILLS_REGISTRY_ID ?? 'auno',
      repository: process.env.AUNOSKILLS_REGISTRY_REPOSITORY ?? 'github:dhtoan/AunoSkills',
      commit,
      rootAnchor,
      trust,
      releaseKeyId,
      releasePrivateKey,
    });
    await writeFile(resolve(outputDir, 'root.json'), `${JSON.stringify(rootAnchor, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ registry: trust.registry, releaseKeyId, output: process.env.AUNOSKILLS_REGISTRY_OUTPUT_DIR ?? 'dist/official-registry' })}\n`);
  } catch (cause) {
    const code = typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : 'AUNO_REGISTRY_SIGN_FAILED';
    const message = cause instanceof Error ? cause.message.replaceAll(releasePrivateKey, '[REDACTED]') : code;
    process.stderr.write(`${code} ${message}\n`);
    process.exitCode = 1;
  }
}
