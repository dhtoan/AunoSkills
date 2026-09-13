import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../../apps/cli/src/main.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('repository dogfood manifest and lock restore all starter skills for six agents', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-dogfood-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-dogfood-home-'));
  await writeFile(join(project, 'aunoskills.json'), await readFile(join(repoRoot, 'aunoskills.json')));
  await writeFile(join(project, 'skills-lock.json'), await readFile(join(repoRoot, 'skills-lock.json')));
  let output = '';
  const code = await runCli(['restore', '--json'], { cwd: project, homeDir: home, registryBase: join(repoRoot, 'registry'), io: { stdout: (text) => { output += text; }, stderr: () => {} } });
  assert.equal(code, 0, output);
  for (const id of ['typescript-quality', 'node-cli-quality', 'security-review']) {
    assert.match(await readFile(join(project, '.agents/skills', id, 'SKILL.md'), 'utf8'), new RegExp(`name: ${id}`));
    assert.match(await readFile(join(project, '.claude/skills', id, 'SKILL.md'), 'utf8'), new RegExp(`name: ${id}`));
  }
});
