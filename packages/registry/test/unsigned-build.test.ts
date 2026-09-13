import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stableStringify } from '../../schema/src/index.ts';
import { buildUnsignedRegistryPayload } from '../src/index.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'auno-unsigned-build-'));
  const sourceDir = join(root, 'skills');
  const skillDir = join(sourceDir, 'demo');
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), '---\nname: demo\ndescription: Deterministic unsigned registry payload.\n---\n# Demo\n');
  await writeFile(join(skillDir, 'auno.json'), JSON.stringify({ schemaVersion: 1, id: 'demo', version: '3.0.0', publisher: 'auno', license: 'Apache-2.0' }));
  return { sourceDir };
}

test('unsigned registry payload is deterministic for identical source and provenance', async () => {
  const { sourceDir } = await fixture();
  const options = {
    sourceDir,
    registry: 'auno',
    repository: 'github:dhtoan/AunoSkills',
    commit: 'abc123',
  };

  const first = await buildUnsignedRegistryPayload(options);
  const second = await buildUnsignedRegistryPayload(options);

  assert.equal(stableStringify(first.skills), stableStringify(second.skills));
  assert.deepEqual(Object.keys(first.manifests), Object.keys(second.manifests));
  assert.deepEqual(Object.keys(first.bundles), Object.keys(second.bundles));
  for (const digest of Object.keys(first.manifests)) assert.deepEqual(first.manifests[digest], second.manifests[digest]);
  for (const digest of Object.keys(first.bundles)) assert.deepEqual(first.bundles[digest], second.bundles[digest]);
});

test('unsigned payload exposes immutable content identities before signatures exist', async () => {
  const { sourceDir } = await fixture();
  const payload = await buildUnsignedRegistryPayload({
    sourceDir,
    registry: 'auno',
    repository: 'github:dhtoan/AunoSkills',
    commit: 'abc123',
  });

  const version = payload.skills.demo.versions['3.0.0'];
  assert.match(version.manifest, /^sha256:[0-9a-f]{64}$/);
  assert.match(version.bundle, /^sha256:[0-9a-f]{64}$/);
  assert.equal('manifestSignature' in version, false);
  assert.equal(Object.keys(payload.manifests).length, 1);
  assert.equal(Object.keys(payload.bundles).length, 1);
});
