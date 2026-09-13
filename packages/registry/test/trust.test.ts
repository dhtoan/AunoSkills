import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import type { RegistryTrustDocumentV1, SigningKeyV1 } from '../../schema/src/index.ts';
import { canonicalSignedPayload, signEd25519 } from '../../security/src/index.ts';
import { RegistryTrustStore } from '../src/index.ts';

function keyFixture(keyId: string, overrides: Partial<SigningKeyV1> = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return {
    privateKey,
    public: { keyId, algorithm: 'ed25519' as const, publicKey: publicKeyBase64, ...overrides },
  };
}

function signedTrust(registry: string, keys: SigningKeyV1[], signer: ReturnType<typeof keyFixture>): RegistryTrustDocumentV1 {
  const unsigned = { schemaVersion: 1 as const, registry, keys };
  return { ...unsigned, signature: signEd25519(canonicalSignedPayload(unsigned), signer.public.keyId, signer.privateKey) };
}

test('trusted root can authorize a replacement signing key', () => {
  const root = keyFixture('root-1');
  const next = keyFixture('root-2');
  const store = new RegistryTrustStore([root.public]);
  store.verifyAndApply(signedTrust('auno', [root.public, next.public], root), new Date('2026-09-13T00:00:00Z'));
  assert.equal(store.requireActiveKey('root-2', new Date('2026-09-13T00:00:00Z')).keyId, 'root-2');
});

test('unknown self-signed key cannot bootstrap registry trust', () => {
  const unknown = keyFixture('unknown');
  const store = new RegistryTrustStore([]);
  assert.throws(
    () => store.verifyAndApply(signedTrust('evil', [unknown.public], unknown), new Date('2026-09-13T00:00:00Z')),
    /AUNO_SIGNING_KEY_UNKNOWN/,
  );
});

test('revoked signing key is rejected after a trusted trust update', () => {
  const root = keyFixture('root-1');
  const replacement = keyFixture('root-2');
  const store = new RegistryTrustStore([root.public]);
  const revokedRoot = { ...root.public, revokedAt: '2026-09-12T00:00:00Z', revocationReason: 'rotation' };
  store.verifyAndApply(signedTrust('auno', [revokedRoot, replacement.public], root), new Date('2026-09-13T00:00:00Z'));
  assert.throws(() => store.requireActiveKey('root-1', new Date('2026-09-13T00:00:00Z')), /AUNO_SIGNING_KEY_REVOKED/);
});

test('expired and not-yet-valid signing keys fail closed', () => {
  const expired = keyFixture('expired', { validUntil: '2026-09-12T00:00:00Z' });
  const future = keyFixture('future', { validFrom: '2026-09-14T00:00:00Z' });
  const store = new RegistryTrustStore([expired.public, future.public]);
  assert.throws(() => store.requireActiveKey('expired', new Date('2026-09-13T00:00:00Z')), /AUNO_SIGNING_KEY_EXPIRED/);
  assert.throws(() => store.requireActiveKey('future', new Date('2026-09-13T00:00:00Z')), /AUNO_SIGNING_KEY_EXPIRED/);
});

test('tampered trust document is rejected before keys are applied', () => {
  const root = keyFixture('root-1');
  const next = keyFixture('root-2');
  const store = new RegistryTrustStore([root.public]);
  const document = signedTrust('auno', [root.public], root);
  document.keys.push(next.public);
  assert.throws(() => store.verifyAndApply(document, new Date('2026-09-13T00:00:00Z')), /AUNO_SIGNATURE_INVALID/);
  assert.throws(() => store.requireActiveKey('root-2', new Date('2026-09-13T00:00:00Z')), /AUNO_SIGNING_KEY_UNKNOWN/);
});
