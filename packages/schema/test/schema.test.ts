import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProjectManifest,
  stableStringify,
  validateLockfile,
  validateSkillMetadata,
} from '../src/index.ts';

test('normalizes a minimal project manifest', () => {
  const manifest = normalizeProjectManifest({ skills: { 'react-performance': '^2.0.0' } });
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.agents, []);
  assert.deepEqual(manifest.skills['react-performance'], { version: '^2.0.0', scope: 'project' });
});

test('rejects unknown critical project fields', () => {
  assert.throws(() => normalizeProjectManifest({ skills: {}, dangerousMode: true }), /Unknown project manifest field: dangerousMode/);
});

test('stableStringify sorts object keys recursively while preserving arrays', () => {
  const value = { z: 1, a: { z: 2, a: 1 }, list: [{ b: 2, a: 1 }, 'x'] };
  assert.equal(stableStringify(value), '{\n  "a": {\n    "a": 1,\n    "z": 2\n  },\n  "list": [\n    {\n      "a": 1,\n      "b": 2\n    },\n    "x"\n  ],\n  "z": 1\n}\n');
});

test('validates skill metadata and rejects self-asserted trust', () => {
  assert.equal(validateSkillMetadata({ schemaVersion: 1, id: 'wordpress-security', version: '1.0.0', publisher: 'auno', description: 'Security guidance', compatibility: { agents: ['codex'] } }).id, 'wordpress-security');
  assert.throws(() => validateSkillMetadata({ schemaVersion: 1, id: 'x', version: '1.0.0', trust: 'verified' }), /Skill metadata cannot declare trust/);
});

test('validates a deterministic v1 lockfile', () => {
  const lock = validateLockfile({ lockfileVersion: 1, generatedBy: 'aunoskills@0.1.0', project: { manifestDigest: 'sha256:abc' }, skills: {} });
  assert.equal(lock.lockfileVersion, 1);
});
