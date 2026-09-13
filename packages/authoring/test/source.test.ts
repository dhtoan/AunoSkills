import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AunoError } from '../../shared/src/index.ts';
import { collectSkillInventory, initSkill, validateSkillSource } from '../src/index.ts';

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'auno-authoring-'));
}

async function writeMinimalSkill(root: string, id = 'demo/example-skill', version = '1.0.0'): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'SKILL.md'), '# Example Skill\n\n## Purpose\nTest skill.\n');
  await writeFile(join(root, 'auno.json'), JSON.stringify({ schemaVersion: 1, id, version, publisher: 'demo' }));
}

test('init creates a portable original SKILL.md and author-only auno.json', async () => {
  const parent = await tempRoot();
  const target = join(parent, 'example-skill');
  const result = await initSkill(target, {
    packageId: 'demo/example-skill',
    version: '1.2.3',
    publisher: 'demo',
    displayName: 'Example Skill',
  });
  const metadata = JSON.parse(await readFile(join(target, 'auno.json'), 'utf8')) as Record<string, unknown>;
  const skill = await readFile(join(target, 'SKILL.md'), 'utf8');
  assert.equal(result.metadata.id, 'demo/example-skill');
  assert.equal(metadata.version, '1.2.3');
  assert.equal('trust' in metadata, false);
  assert.equal('signature' in metadata, false);
  assert.match(skill, /## When to use/);
  assert.match(skill, /## Verification/);
});

test('inventory honors .aunoignore while preserving deterministic lexical order', async () => {
  const root = await tempRoot();
  await writeMinimalSkill(root);
  await writeFile(join(root, '.aunoignore'), 'notes.txt\nprivate/\n');
  await writeFile(join(root, 'notes.txt'), 'ignore me');
  await mkdir(join(root, 'private'));
  await writeFile(join(root, 'private', 'draft.md'), 'ignore me too');
  await mkdir(join(root, 'references'));
  await writeFile(join(root, 'references', 'z.md'), 'z');
  await writeFile(join(root, 'references', 'a.md'), 'a');
  const inventory = await collectSkillInventory(root);
  assert.deepEqual(inventory.map((file) => file.path), ['.aunoignore', 'SKILL.md', 'auno.json', 'references/a.md', 'references/z.md']);
});

test('inventory blocks credential-like files even when they are not referenced', async () => {
  const root = await tempRoot();
  await writeMinimalSkill(root);
  await writeFile(join(root, '.env'), 'TOKEN=secret');
  await assert.rejects(
    () => collectSkillInventory(root),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_SKILL_SECRET_BLOCKED',
  );
});

test('source validation accepts a minimal valid skill and derives runtime name', async () => {
  const root = await tempRoot();
  await writeMinimalSkill(root);
  const result = await validateSkillSource(root);
  assert.equal(result.valid, true);
  assert.equal(result.metadata?.id, 'demo/example-skill');
  assert.equal(result.runtimeName, 'example-skill');
  assert.deepEqual(result.findings.filter((finding) => finding.severity === 'high' || finding.severity === 'critical'), []);
});

test('source validation reports invalid semver without executing source files', async () => {
  const root = await tempRoot();
  await writeMinimalSkill(root, 'demo/example-skill', 'banana');
  const result = await validateSkillSource(root);
  assert.equal(result.valid, false);
  assert.equal(result.findings.some((finding) => finding.code === 'AUNO_SKILL_VERSION_INVALID'), true);
});
