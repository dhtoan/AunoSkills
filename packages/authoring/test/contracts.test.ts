import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRuntimeName, validatePackageId } from '../src/index.ts';
import { validateSkillBundleManifest, validateSkillSubmission } from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';

test('runtimeName is derived from the final package id segment', () => {
  validatePackageId('auno/wordpress-security');
  assert.equal(deriveRuntimeName('auno/wordpress-security'), 'wordpress-security');
  assert.equal(deriveRuntimeName('security-review'), 'security-review');
});

test('package ids reject traversal and non-portable path syntax', () => {
  for (const value of ['../escape', '/absolute', 'C:/drive', '\\\\server\\share', 'auno\\skill', 'auno//skill', 'auno/.']) {
    assert.throws(
      () => validatePackageId(value),
      (error: unknown) => error instanceof AunoError && error.code === 'AUNO_SKILL_ID_INVALID',
    );
  }
});

test('bundle manifest validator accepts the v1 authoring contract', () => {
  const manifest = validateSkillBundleManifest({
    schemaVersion: 1,
    packageId: 'demo/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    metadataDigest: 'a'.repeat(64),
    files: [{ path: 'SKILL.md', sha256: 'b'.repeat(64), size: 12 }],
  });
  assert.equal(manifest.runtimeName, 'example-skill');
});

test('bundle manifest validator rejects incomplete contracts', () => {
  assert.throws(() => validateSkillBundleManifest({ schemaVersion: 1 }), /AUNO_SKILL_ARTIFACT_INVALID/);
});

test('submission validator accepts author claims without registry trust fields', () => {
  const submission = validateSkillSubmission({
    schemaVersion: 1,
    packageId: 'demo/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    publisher: 'demo',
    artifact: { sha256: 'c'.repeat(64), file: 'example-skill-1.0.0.aunoskill' },
  });
  assert.equal(submission.packageId, 'demo/example-skill');
});

test('submission validator rejects incomplete contracts', () => {
  assert.throws(() => validateSkillSubmission({ schemaVersion: 1 }), /AUNO_SKILL_PUBLISH_FAILED/);
});
