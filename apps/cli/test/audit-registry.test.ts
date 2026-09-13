import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
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

test('audit --registry includes official registry activation health without changing skill audit', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-audit-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-audit-home-'));
  const registry = await mkdtemp(join(tmpdir(), 'auno-audit-registry-'));
  await writeFile(join(registry, 'index.json'), JSON.stringify({ schemaVersion: 1, registry: 'auno', skills: {} }));
  const out = capture();

  assert.equal(await runCli(['audit', '--registry', '--json'], { cwd: project, homeDir: home, registryBase: registry, io: out.io }), 0);
  const data = JSON.parse(out.stdout).data;
  assert.ok(Array.isArray(data.findings));
  assert.equal(data.registry.mode, 'legacy-awaiting-production-trust');
  assert.equal(data.registry.verified, false);
});
