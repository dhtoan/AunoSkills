import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/main.ts';

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    io: { stdout: (text: string) => { stdout += text; }, stderr: (text: string) => { stderr += text; } },
    get stdout() { return stdout; },
    get stderr() { return stderr; },
  };
}

async function legacyRegistry(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-registry-cli-'));
  await writeFile(join(root, 'index.json'), JSON.stringify({ schemaVersion: 1, registry: 'legacy', skills: {} }));
  return root;
}

test('registry add stores only bearer environment reference, never token value', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-home-'));
  const bundled = await legacyRegistry();
  const out = capture();
  process.env.AUNOSKILLS_COMPANY_TOKEN = 'must-not-be-persisted';
  assert.equal(await runCli(['registry', 'add', 'company', 'https://registry.example.com', '--auth-env', 'AUNOSKILLS_COMPANY_TOKEN', '--json'], { cwd: project, homeDir: home, registryBase: bundled, io: out.io }), 0);
  const configText = await readFile(join(home, '.aunoskills', 'config.json'), 'utf8');
  assert.match(configText, /AUNOSKILLS_COMPANY_TOKEN/);
  assert.equal(configText.includes('must-not-be-persisted'), false);
  const config = JSON.parse(configText);
  assert.deepEqual(config.registries.company.auth, { type: 'bearer-env', env: 'AUNOSKILLS_COMPANY_TOKEN' });
});

test('registry trust stores an explicit ed25519 trust anchor instead of self-declared trust level', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-home-'));
  const bundled = await legacyRegistry();
  let out = capture();
  assert.equal(await runCli(['registry', 'add', 'company', 'https://registry.example.com', '--json'], { cwd: project, homeDir: home, registryBase: bundled, io: out.io }), 0);
  out = capture();
  assert.equal(await runCli(['registry', 'trust', 'company', 'root-1', 'cHVibGljLWtleQ==', '--json'], { cwd: project, homeDir: home, registryBase: bundled, io: out.io }), 0);
  const config = JSON.parse(await readFile(join(home, '.aunoskills', 'config.json'), 'utf8'));
  assert.deepEqual(config.registries.company.anchors, [{ keyId: 'root-1', algorithm: 'ed25519', publicKey: 'cHVibGljLWtleQ==' }]);
});

test('registry show returns safe configuration without resolving credential values', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-home-'));
  const bundled = await legacyRegistry();
  let out = capture();
  process.env.AUNOSKILLS_SHOW_TOKEN = 'do-not-show';
  await runCli(['registry', 'add', 'company', 'https://registry.example.com', '--auth-env', 'AUNOSKILLS_SHOW_TOKEN'], { cwd: project, homeDir: home, registryBase: bundled, io: out.io });
  out = capture();
  assert.equal(await runCli(['registry', 'show', 'company', '--json'], { cwd: project, homeDir: home, registryBase: bundled, io: out.io }), 0);
  assert.equal(out.stdout.includes('do-not-show'), false);
  assert.equal(JSON.parse(out.stdout).data.registry.auth.env, 'AUNOSKILLS_SHOW_TOKEN');
});

test('registry refresh validates and reports a configured legacy registry snapshot', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-home-'));
  const bundled = await legacyRegistry();
  const custom = await legacyRegistry();
  let out = capture();
  await runCli(['registry', 'add', 'legacy', custom], { cwd: project, homeDir: home, registryBase: bundled, io: out.io });
  out = capture();
  assert.equal(await runCli(['registry', 'refresh', 'legacy', '--json'], { cwd: project, homeDir: home, registryBase: bundled, io: out.io }), 0);
  const data = JSON.parse(out.stdout).data;
  assert.equal(data.refreshed[0].name, 'legacy');
  assert.equal(data.refreshed[0].schemaVersion, 1);
});
