import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stableStringify, type SkillBundleV1 } from '../../packages/schema/src/index.ts';
import { AunoError, sha256Bytes } from '../../packages/shared/src/index.ts';
import { collectSkillInventory, verifySkillArtifact } from '../../packages/authoring/src/index.ts';

function artifactWith(extraFiles: Array<{ path: string; bytes: Buffer; contentBase64?: string }> = []): Buffer {
  const skill = Buffer.from('# Fixture\n\n## Purpose\nSecurity fixture.\n', 'utf8');
  const metadata = Buffer.from('{"schemaVersion":1,"id":"fixtures/security-skill","version":"1.0.0","publisher":"fixtures"}', 'utf8');
  const base = [
    { path: 'SKILL.md', bytes: skill },
    { path: 'auno.json', bytes: metadata },
    ...extraFiles,
  ];
  const files = base.map((item) => ({
    path: item.path,
    sha256: sha256Bytes(item.bytes),
    size: item.bytes.byteLength,
    contentBase64: item.contentBase64 ?? item.bytes.toString('base64'),
  }));
  const bundle: SkillBundleV1 = {
    schemaVersion: 1,
    manifest: {
      schemaVersion: 1,
      packageId: 'fixtures/security-skill',
      runtimeName: 'security-skill',
      version: '1.0.0',
      metadataDigest: sha256Bytes(Buffer.from(stableStringify(JSON.parse(metadata.toString('utf8'))), 'utf8')),
      files: files.map(({ path, sha256, size }) => ({ path, sha256, size })),
    },
    files,
  };
  return Buffer.from(stableStringify(bundle), 'utf8');
}

async function expectArtifactInvalid(bytes: Buffer): Promise<void> {
  await assert.rejects(
    () => verifySkillArtifact(bytes),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_SKILL_ARTIFACT_INVALID',
  );
}

test('authoring inventory blocks secret-like source files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-secret-source-'));
  await writeFile(join(root, 'SKILL.md'), '# Fixture');
  await writeFile(join(root, 'auno.json'), '{"schemaVersion":1,"id":"fixtures/secret-skill","version":"1.0.0"}');
  await writeFile(join(root, '.env.production'), 'TOKEN=secret');
  await assert.rejects(
    () => collectSkillInventory(root),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_SKILL_SECRET_BLOCKED',
  );
});

test('authoring inventory rejects symlinks instead of following them', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-symlink-source-'));
  const outside = join(await mkdtemp(join(tmpdir(), 'auno-symlink-outside-')), 'secret.txt');
  await writeFile(join(root, 'SKILL.md'), '# Fixture');
  await writeFile(join(root, 'auno.json'), '{"schemaVersion":1,"id":"fixtures/link-skill","version":"1.0.0"}');
  await writeFile(outside, 'outside');
  await symlink(outside, join(root, 'linked.txt'));
  await assert.rejects(
    () => collectSkillInventory(root),
    (error: unknown) => error instanceof AunoError && error.code === 'AUNO_SKILL_PATH_UNSAFE',
  );
});

test('artifact verification rejects traversal and platform absolute paths', async () => {
  for (const path of ['../escape.txt', 'C:/Windows/system.ini', '//server/share/file.txt']) {
    await expectArtifactInvalid(artifactWith([{ path, bytes: Buffer.from('x') }]));
  }
});

test('artifact verification rejects case-insensitive path collisions', async () => {
  await expectArtifactInvalid(artifactWith([
    { path: 'references/Guide.md', bytes: Buffer.from('A') },
    { path: 'references/guide.md', bytes: Buffer.from('B') },
  ]));
});

test('artifact verification rejects secret-like embedded paths', async () => {
  await expectArtifactInvalid(artifactWith([{ path: '.env', bytes: Buffer.from('TOKEN=x') }]));
});

test('artifact verification rejects malformed base64 and tampered bytes', async () => {
  await expectArtifactInvalid(artifactWith([{ path: 'references/bad.txt', bytes: Buffer.from('expected'), contentBase64: 'not-base64!' }]));
  const bytes = artifactWith([{ path: 'references/tampered.txt', bytes: Buffer.from('expected') }]);
  const parsed = JSON.parse(bytes.toString('utf8')) as { files: Array<{ path: string; contentBase64: string }> };
  const target = parsed.files.find((file) => file.path === 'references/tampered.txt');
  assert.ok(target);
  target.contentBase64 = Buffer.from('changed').toString('base64');
  await expectArtifactInvalid(Buffer.from(JSON.stringify(parsed), 'utf8'));
});
