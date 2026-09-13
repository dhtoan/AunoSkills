import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AunoError } from '../../shared/src/index.ts';
import { publishSkill } from '../src/index.ts';

async function sourceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-publish-source-'));
  await writeFile(join(root, 'SKILL.md'), '# Publish Skill\n\n## Purpose\nStable publication fixture.\n');
  await writeFile(join(root, 'auno.json'), JSON.stringify({ schemaVersion: 1, id: 'demo/publish-skill', version: '1.0.0', publisher: 'demo', capabilities: { network: { connect: ['api.example.test'] } } }));
  return root;
}

test('submission output is deterministic and cannot claim registry trust', async () => {
  const root = await sourceFixture();
  const out = await mkdtemp(join(tmpdir(), 'auno-submission-'));
  const first = await publishSkill(root, { output: join(out, 'one.json'), sourceRepository: 'https://github.com/example/skills', sourceCommit: 'abc123' });
  const second = await publishSkill(root, { output: join(out, 'two.json'), sourceRepository: 'https://github.com/example/skills', sourceCommit: 'abc123' });
  const one = JSON.parse(await readFile(first.submissionPath, 'utf8')) as Record<string, unknown>;
  const two = JSON.parse(await readFile(second.submissionPath, 'utf8')) as Record<string, unknown>;
  assert.deepEqual(one, two);
  assert.equal('trust' in one, false);
  assert.equal('signature' in one, false);
  assert.equal(first.submission.artifact.sha256, second.submission.artifact.sha256);
});

test('registry workspace allows exact idempotent republish', async () => {
  const root = await sourceFixture();
  const workspace = await mkdtemp(join(tmpdir(), 'auno-workspace-'));
  const first = await publishSkill(root, { registryWorkspace: workspace });
  const second = await publishSkill(root, { registryWorkspace: workspace });
  assert.equal(first.submission.artifact.sha256, second.submission.artifact.sha256);
  assert.equal(first.submissionPath, second.submissionPath);
});

test('registry workspace rejects replacing an immutable version with different bytes', async () => {
  const root = await sourceFixture();
  const workspace = await mkdtemp(join(tmpdir(), 'auno-workspace-conflict-'));
  await publishSkill(root, { registryWorkspace: workspace });
  await writeFile(join(root, 'SKILL.md'), '# Publish Skill\n\n## Purpose\nChanged bytes for same version.\n');
  await assert.rejects(
    () => publishSkill(root, { registryWorkspace: workspace }),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_SKILL_VERSION_EXISTS',
  );
});
