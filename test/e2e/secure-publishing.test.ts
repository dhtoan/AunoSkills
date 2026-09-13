import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function runScript(name: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', '--experimental-transform-types', resolve(root, 'scripts', name)],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, REGISTRY_SOURCE_COMMIT: 'secure-publishing-fixture', ...extraEnv },
    },
  );
}

test('package exposes unsigned, sign, and public registry verification commands', async () => {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['registry:unsigned'], 'node --disable-warning=ExperimentalWarning --experimental-transform-types scripts/registry-build-unsigned.mjs');
  assert.equal(pkg.scripts['registry:sign'], 'node --disable-warning=ExperimentalWarning --experimental-transform-types scripts/registry-sign.mjs');
  assert.equal(pkg.scripts['registry:verify'], 'node --disable-warning=ExperimentalWarning --experimental-transform-types scripts/registry-verify.mjs');
});

test('unsigned registry release summary is deterministic and contains no private material', () => {
  const first = runScript('registry-build-unsigned.mjs');
  const second = runScript('registry-build-unsigned.mjs');
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(first.stdout, second.stdout);
  const summary = JSON.parse(first.stdout) as { registry: string; manifests: string[]; bundles: string[]; skills: string[] };
  assert.equal(summary.registry, 'auno');
  assert.ok(summary.manifests.length > 0);
  assert.ok(summary.bundles.length > 0);
  assert.ok(summary.skills.includes('typescript-quality'));
  assert.doesNotMatch(first.stdout, /PRIVATE KEY|AUNOSKILLS_RELEASE_PRIVATE_KEY/);
});

test('registry signing fails safely when release signing material is absent', () => {
  const env = { ...process.env };
  delete env.AUNOSKILLS_RELEASE_PRIVATE_KEY;
  delete env.AUNOSKILLS_RELEASE_KEY_ID;
  const result = spawnSync(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', '--experimental-transform-types', resolve(root, 'scripts/registry-sign.mjs')],
    { cwd: root, encoding: 'utf8', env: { ...env, REGISTRY_SOURCE_COMMIT: 'secure-publishing-fixture' } },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AUNO_RELEASE_KEY_MISSING/);
  assert.doesNotMatch(result.stderr, /BEGIN PRIVATE KEY|AUNOSKILLS_RELEASE_PRIVATE_KEY=/);
});
