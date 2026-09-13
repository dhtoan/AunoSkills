import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSkillBundle, validateRegistryIndex } from '../src/index.ts';

const HASH = `sha256:${'a'.repeat(64)}`;
function validIndex() { return { schemaVersion: 1, registry: 'auno', skills: { demo: { latest: '1.0.0', versions: { '1.0.0': { manifest: HASH, bundle: HASH, trust: 'verified', publisher: 'auno', provenance: { repository: 'github:dhtoan/AunoSkills', commit: 'abc123' }, metadata: { schemaVersion: 1, id: 'demo', version: '1.0.0' } } } } } }; }

test('registry validation requires immutable sha256 references and matching latest version', () => {
  assert.equal(validateRegistryIndex(validIndex()).registry, 'auno');
  const missing = validIndex() as any; delete missing.skills.demo.versions['1.0.0'].bundle;
  assert.throws(() => validateRegistryIndex(missing), /AUNO_REGISTRY_HASH_INVALID/);
  const mutable = validIndex() as any; mutable.skills.demo.versions['1.0.0'].bundle = 'https://example.test/latest.zip';
  assert.throws(() => validateRegistryIndex(mutable), /AUNO_REGISTRY_HASH_INVALID/);
  const absentLatest = validIndex() as any; absentLatest.skills.demo.latest = '2.0.0';
  assert.throws(() => validateRegistryIndex(absentLatest), /AUNO_REGISTRY_LATEST_INVALID/);
});

test('bundle validation requires SKILL.md', () => {
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, metadata: { schemaVersion: 1, id: 'demo', version: '1.0.0' }, files: { 'references/readme.md': Buffer.from('hello').toString('base64') } }));
  assert.throws(() => decodeSkillBundle(bytes), /AUNO_BUNDLE_SKILL_MISSING/);
});
