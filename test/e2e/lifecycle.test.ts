import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Bytes } from '../../packages/shared/src/index.ts';
import { runCli } from '../../apps/cli/src/main.ts';

async function fixtureRegistry(versions: Array<{ id: string; version: string; text: string; recommendation?: any }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-e2e-reg-'));
  await mkdir(join(root, 'blobs/sha256'), { recursive: true });
  const index: any = { schemaVersion: 1, registry: 'auno', skills: {} };
  for (const item of versions) {
    const metadata = { schemaVersion: 1, id: item.id, version: item.version, recommendation: item.recommendation };
    const bundle = Buffer.from(JSON.stringify({ schemaVersion: 1, metadata, files: { 'SKILL.md': Buffer.from(item.text).toString('base64') } }));
    const digest = sha256Bytes(bundle);
    await writeFile(join(root, 'blobs/sha256', digest), bundle);
    index.skills[item.id] ??= { latest: item.version, versions: {} };
    index.skills[item.id].latest = item.version;
    index.skills[item.id].versions[item.version] = { manifest: `sha256:${digest}`, bundle: `sha256:${digest}`, trust: 'verified', publisher: 'auno', metadata };
  }
  await writeFile(join(root, 'index.json'), JSON.stringify(index));
  return root;
}

function capture() {
  let stdout = '';
  let stderr = '';
  return { io: { stdout: (text: string) => { stdout += text; }, stderr: (text: string) => { stderr += text; } }, stdout: () => stdout, stderr: () => stderr };
}

test('fresh init auto-selects a recommendation and materializes it for all six agents using two portable trees', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-e2e-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-e2e-home-'));
  await writeFile(join(project, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' } }));
  await writeFile(join(project, 'next.config.ts'), 'export default {}');
  const registry = await fixtureRegistry([{ id: 'next-guide', version: '1.0.0', text: '# Next\n', recommendation: { boosts: { 'tech:nextjs': 100 } } }]);
  const out = capture();
  assert.equal(await runCli(['--yes', '--json'], { cwd: project, homeDir: home, registryBase: registry, io: out.io }), 0, out.stderr());
  assert.equal(await readFile(join(project, '.agents/skills/next-guide/SKILL.md'), 'utf8'), '# Next\n');
  assert.equal(await readFile(join(project, '.claude/skills/next-guide/SKILL.md'), 'utf8'), '# Next\n');
  const lock = JSON.parse(await readFile(join(project, 'skills-lock.json'), 'utf8'));
  assert.equal(lock.skills['auno:next-guide'].materializations.length, 2);
  assert.equal(new Set(lock.skills['auno:next-guide'].materializations.flatMap((item: any) => item.agents)).size, 6);
});

test('clone plus offline restore reconstructs exact lock state from shared CAS without registry access', async () => {
  const original = await mkdtemp(join(tmpdir(), 'auno-e2e-original-'));
  const clone = await mkdtemp(join(tmpdir(), 'auno-e2e-clone-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-e2e-home-'));
  const registry = await fixtureRegistry([{ id: 'demo', version: '1.0.0', text: '# Offline exact\n' }]);
  await writeFile(join(original, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex', 'claude-code'], skills: { 'auno:demo': '1.0.0' } }));
  assert.equal(await runCli(['install', '--quiet'], { cwd: original, homeDir: home, registryBase: registry }), 0);
  await writeFile(join(clone, 'aunoskills.json'), await readFile(join(original, 'aunoskills.json')));
  await writeFile(join(clone, 'skills-lock.json'), await readFile(join(original, 'skills-lock.json')));
  assert.equal(await runCli(['restore', '--offline', '--quiet'], { cwd: clone, homeDir: home, registryBase: join(clone, 'does-not-exist') }), 0);
  assert.equal(await readFile(join(clone, '.agents/skills/demo/SKILL.md'), 'utf8'), '# Offline exact\n');
});

test('update followed by rollback restores prior version end to end', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-e2e-update-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-e2e-home-'));
  const registry = await fixtureRegistry([{ id: 'demo', version: '1.0.0', text: '# Old\n' }, { id: 'demo', version: '1.1.0', text: '# New\n' }]);
  await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } }));
  assert.equal(await runCli(['install', '--quiet'], { cwd: project, homeDir: home, registryBase: registry }), 0);
  await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '^1.0.0' } }));
  assert.equal(await runCli(['update', '--quiet'], { cwd: project, homeDir: home, registryBase: registry }), 0);
  assert.equal(await readFile(join(project, '.agents/skills/demo/SKILL.md'), 'utf8'), '# New\n');
  assert.equal(await runCli(['rollback', '--quiet'], { cwd: project, homeDir: home, registryBase: registry }), 0);
  assert.equal(await readFile(join(project, '.agents/skills/demo/SKILL.md'), 'utf8'), '# Old\n');
});

test('monorepo recommendation retains workspace scope', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-e2e-monorepo-'));
  await mkdir(join(project, 'apps/storefront'), { recursive: true });
  await writeFile(join(project, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
  await writeFile(join(project, 'package.json'), JSON.stringify({ private: true }));
  await writeFile(join(project, 'apps/storefront/package.json'), JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' } }));
  await writeFile(join(project, 'apps/storefront/next.config.ts'), 'export default {}');
  const registry = await fixtureRegistry([{ id: 'next-guide', version: '1.0.0', text: '# Next\n', recommendation: { boosts: { 'tech:nextjs': 100 } } }]);
  const out = capture();
  assert.equal(await runCli(['recommend', '--json'], { cwd: project, registryBase: registry, io: out.io }), 0);
  const rec = JSON.parse(out.stdout()).data.find((item: any) => item.skillId === 'auno:next-guide');
  assert.equal(rec.scope, 'apps/storefront');
  assert.equal(rec.tier, 'auto');
});
