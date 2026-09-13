import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RELEASE_VERSION = '0.4.0';

test('packaged bin entry reports the release version and matches package metadata', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as { version: string };
  const result = spawnSync(process.execPath, [resolve(root, 'bin/aunoskills.mjs'), '--version'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(pkg.version, RELEASE_VERSION);
  assert.equal(result.stdout.trim(), RELEASE_VERSION);
  assert.equal(result.stdout.trim(), pkg.version);
  assert.equal(result.stderr, '');
});

test('compiled CLI resolves the bundled registry from the package root', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const project = await mkdtemp(join(tmpdir(), 'auno-package-project-'));
  await writeFile(join(project, 'package.json'), JSON.stringify({ devDependencies: { typescript: '5.8.3' } }));
  const result = spawnSync(process.execPath, [resolve(root, 'bin/aunoskills.mjs'), 'recommend', '--json', '--project', project], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.command, 'recommend');
});

test('build cleanup is cross-platform and does not depend on POSIX rm', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as { scripts: { build: string } };
  assert.equal(pkg.scripts.build, 'node scripts/clean-dist.mjs && tsc -p tsconfig.build.json');
});

test('release verification builds compiled output before package entry tests', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as { scripts: { verify: string } };
  assert.equal(pkg.scripts.verify, 'npm run format:check && npm run typecheck && npm run build && npm test');
});
