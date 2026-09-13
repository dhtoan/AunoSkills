import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../apps/cli/src/main.ts';

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    io: { stdout: (text: string) => { stdout += text; }, stderr: (text: string) => { stderr += text; } },
    get stdout() { return stdout; },
    get stderr() { return stderr; },
  };
}

test('skill CLI completes init validate inspect pack verify and publish lifecycle', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-authoring-cli-project-'));
  const home = await mkdtemp(join(tmpdir(), 'auno-authoring-cli-home-'));
  const skillRoot = join(project, 'example-skill');
  const artifactPath = join(project, 'artifacts', 'example-skill-1.0.0.aunoskill');
  const submissionPath = join(project, 'artifacts', 'submission.json');

  let out = capture();
  assert.equal(await runCli(['skill', 'init', 'demo/example-skill', '--skill-version', '1.0.0', '--publisher', 'demo', '--output', skillRoot, '--json'], { cwd: project, homeDir: home, io: out.io }), 0);
  assert.equal(JSON.parse(out.stdout).command, 'skill init');

  out = capture();
  assert.equal(await runCli(['skill', 'validate', skillRoot, '--json'], { cwd: project, homeDir: home, io: out.io }), 0);
  const validated = JSON.parse(out.stdout);
  assert.equal(validated.command, 'skill validate');
  assert.equal(validated.data.valid, true);

  out = capture();
  assert.equal(await runCli(['skill', 'inspect', skillRoot, '--json'], { cwd: project, homeDir: home, io: out.io }), 0);
  assert.equal(JSON.parse(out.stdout).data.runtimeName, 'example-skill');

  out = capture();
  assert.equal(await runCli(['skill', 'pack', skillRoot, '--output', artifactPath, '--json'], { cwd: project, homeDir: home, io: out.io }), 0);
  assert.equal(JSON.parse(out.stdout).command, 'skill pack');

  out = capture();
  assert.equal(await runCli(['skill', 'verify', artifactPath, '--json'], { cwd: project, homeDir: home, io: out.io }), 0);
  assert.equal(JSON.parse(out.stdout).data.artifactValid, true);

  out = capture();
  assert.equal(await runCli(['skill', 'publish', artifactPath, '--output', submissionPath, '--source-repository', 'https://github.com/example/skills', '--source-commit', 'abc123', '--json'], { cwd: project, homeDir: home, io: out.io }), 0);
  const published = JSON.parse(out.stdout);
  assert.equal(published.command, 'skill publish');
  assert.equal(published.data.submission.packageId, 'demo/example-skill');
  assert.equal('trust' in published.data.submission, false);
  assert.match(await readFile(submissionPath, 'utf8'), /demo\/example-skill/);
});

test('help advertises the skill authoring namespace', async () => {
  const out = capture();
  assert.equal(await runCli(['--help'], { io: out.io }), 0);
  assert.match(out.stdout, /skill\s+Author, validate, pack, verify and publish skills/);
});
