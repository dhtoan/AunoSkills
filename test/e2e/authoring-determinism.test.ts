import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packSkill } from '../../packages/authoring/src/index.ts';

const EXPECTED_ARTIFACT_SHA256 = '47875f44bb64387c6e43525ec1e3fad8c175aff17dfe88060dfeb3a7f516b23e';

test('normalized authoring fixture has one portable artifact digest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-determinism-source-'));
  const out = await mkdtemp(join(tmpdir(), 'auno-determinism-output-'));
  await writeFile(join(root, 'SKILL.md'), Buffer.from('# Deterministic Skill\n\n## Purpose\nPortable authoring fixture.\n', 'utf8'));
  await writeFile(join(root, 'auno.json'), Buffer.from('{"schemaVersion":1,"id":"fixtures/deterministic-skill","version":"1.0.0","publisher":"fixtures"}', 'utf8'));
  const packed = await packSkill(root, { outputDir: out });
  assert.equal(packed.sha256, EXPECTED_ARTIFACT_SHA256);
});
