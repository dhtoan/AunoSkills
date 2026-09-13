import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProjectManifest,
  stableStringify,
  validateLockfile,
  validateRegistryIndexV2,
  validateRegistryTrustDocument,
  validateSigningKey,
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

test('validates an ed25519 signing key and rejects unsupported algorithms', () => {
  const key = validateSigningKey({ keyId: 'root-1', algorithm: 'ed25519', publicKey: 'MCowBQYDK2VwAyEAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=' });
  assert.equal(key.keyId, 'root-1');
  assert.throws(() => validateSigningKey({ keyId: 'root-1', algorithm: 'rsa', publicKey: 'abc' }), /Unsupported signing algorithm/);
});

test('validates signed registry trust metadata', () => {
  const trust = validateRegistryTrustDocument({
    schemaVersion: 1,
    registry: 'auno',
    keys: [{ keyId: 'root-1', algorithm: 'ed25519', publicKey: 'MCowBQYDK2VwAyEAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=' }],
    signature: { keyId: 'root-1', algorithm: 'ed25519', signature: 'c2ln' },
  });
  assert.equal(trust.registry, 'auno');
  assert.equal(trust.keys.length, 1);
});

test('validates registry v2 index and requires signature metadata', () => {
  const index = validateRegistryIndexV2({
    schemaVersion: 2,
    registry: 'auno',
    trustDigest: 'sha256:trust',
    skills: {
      'security-review': {
        latest: '1.0.0',
        versions: {
          '1.0.0': {
            manifest: 'sha256:manifest',
            manifestSignature: { keyId: 'root-1', algorithm: 'ed25519', signature: 'c2ln' },
            bundle: 'sha256:bundle',
            trust: 'verified',
          },
        },
      },
    },
    signature: { keyId: 'root-1', algorithm: 'ed25519', signature: 'c2ln' },
  });
  assert.equal(index.schemaVersion, 2);
  assert.throws(() => validateRegistryIndexV2({ schemaVersion: 2, registry: 'auno', trustDigest: 'sha256:trust', skills: {} }), /signature/);
});

test('lockfile accepts deterministic signer identifiers without verification timestamps', () => {
  const lock = validateLockfile({
    lockfileVersion: 1,
    generatedBy: 'aunoskills@0.2.0',
    project: { manifestDigest: 'sha256:abc' },
    skills: {
      'auno:security-review': {
        requested: '^1',
        resolved: '1.0.0',
        registry: 'auno',
        bundleIntegrity: 'sha256:bundle',
        trust: 'verified',
        effectiveTrust: 'verified',
        signing: {
          registryKeyId: 'root-1',
          manifestKeyId: 'root-1',
          registrySignatureDigest: 'sha256:regsig',
          manifestSignatureDigest: 'sha256:mansig',
        },
      },
    },
  });
  assert.equal(lock.skills['auno:security-review'].signing?.registryKeyId, 'root-1');
  assert.equal('verifiedAt' in (lock.skills['auno:security-review'].signing ?? {}), false);
});
