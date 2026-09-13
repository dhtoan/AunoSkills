import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSkillBundle,
  validateSkillBundleManifest,
  validateSkillSubmission,
} from '../src/index.ts';

test('validates a deterministic skill bundle manifest', () => {
  const manifest = validateSkillBundleManifest({
    schemaVersion: 1,
    packageId: 'auno/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    metadataDigest: 'a'.repeat(64),
    files: [{ path: 'SKILL.md', sha256: 'b'.repeat(64), size: 10 }],
    capabilities: {},
    dependencies: {},
  });
  assert.equal(manifest.runtimeName, 'example-skill');
});

test('rejects a bundle whose file inventory is malformed', () => {
  assert.throws(() => validateSkillBundle({
    schemaVersion: 1,
    manifest: {},
    files: [{ path: '../secret', contentBase64: 'eA==' }],
  }));
});

test('validates a publication submission without trust assertions', () => {
  const submission = validateSkillSubmission({
    schemaVersion: 1,
    packageId: 'auno/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    publisher: 'auno',
    artifact: { sha256: 'c'.repeat(64), file: 'example-skill-1.0.0.aunoskill' },
    capabilities: {},
    dependencies: {},
  });
  assert.equal(submission.packageId, 'auno/example-skill');
});

test('rejects trust elevation inside an author submission', () => {
  assert.throws(() => validateSkillSubmission({
    schemaVersion: 1,
    packageId: 'auno/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    artifact: { sha256: 'd'.repeat(64), file: 'example-skill-1.0.0.aunoskill' },
    capabilities: {},
    dependencies: {},
    trust: 'verified',
  }));
});
