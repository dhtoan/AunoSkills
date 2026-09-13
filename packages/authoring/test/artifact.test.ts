import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AunoError } from '../../shared/src/index.ts';
import { packSkill, verifySkillArtifact } from '../src/index.ts';

async function sourceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-artifact-source-'));
  await writeFile(join(root, 'SKILL.md'), '# Example Skill\n\n## Purpose\nProvide deterministic guidance.\n');
  await writeFile(join(root, 'auno.json'), JSON.stringify({ schemaVersion: 1, id: 'demo/example-skill', version: '1.0.0', publisher: 'demo' }));
  await mkdir(join(root, 'references'));
  await writeFile(join(root, 'references', 'guide.md'), 'stable bytes\n');
  return root;
}

test('packing identical source twice produces identical bytes and digest', async () => {
  const root = await sourceFixture();
  const outA = await mkdtemp(join(tmpdir(), 'auno-artifact-a-'));
  const outB = await mkdtemp(join(tmpdir(), 'auno-artifact-b-'));
  const first = await packSkill(root, { outputDir: outA });
  const second = await packSkill(root, { outputDir: outB });
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(await readFile(first.path), await readFile(second.path));
  assert.equal(first.fileName, 'example-skill-1.0.0.aunoskill');
});

test('independent verification validates artifact structure without granting trust', async () => {
  const root = await sourceFixture();
  const packed = await packSkill(root, { outputDir: await mkdtemp(join(tmpdir(), 'auno-artifact-verify-')) });
  const verified = await verifySkillArtifact(packed.path);
  assert.equal(verified.artifactValid, true);
  assert.equal(verified.sha256, packed.sha256);
  assert.equal(verified.packageId, 'demo/example-skill');
  assert.equal(verified.runtimeName, 'example-skill');
  assert.equal(verified.trust, 'unknown');
});

test('verification rejects tampered embedded file bytes', async () => {
  const root = await sourceFixture();
  const packed = await packSkill(root, { outputDir: await mkdtemp(join(tmpdir(), 'auno-artifact-tamper-')) });
  const bundle = JSON.parse((await readFile(packed.path)).toString('utf8')) as { files: Array<{ contentBase64: string }> };
  bundle.files[0].contentBase64 = Buffer.from('tampered').toString('base64');
  await assert.rejects(
    () => verifySkillArtifact(Buffer.from(JSON.stringify(bundle))),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_SKILL_ARTIFACT_INVALID',
  );
});

test('artifact bytes contain no volatile timestamp fields', async () => {
  const root = await sourceFixture();
  const packed = await packSkill(root, { outputDir: await mkdtemp(join(tmpdir(), 'auno-artifact-time-')) });
  const text = (await readFile(packed.path)).toString('utf8');
  assert.equal(text.includes('createdAt'), false);
  assert.equal(text.includes('generatedAt'), false);
  assert.equal(text.includes('mtime'), false);
});
