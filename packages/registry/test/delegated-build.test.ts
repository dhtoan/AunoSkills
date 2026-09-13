import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import type { RegistryTrustDocumentV1, SigningKeyV1 } from '../../schema/src/index.ts';
import { canonicalSignedPayload, signEd25519 } from '../../security/src/index.ts';
import { validateDelegatedReleaseSigner } from '../src/index.ts';

function publicDescriptor(keyId: string, publicKey: ReturnType<typeof generateKeyPairSync>['publicKey'], extra: Partial<SigningKeyV1> = {}): SigningKeyV1 {
  return {
    keyId,
    algorithm: 'ed25519',
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    ...extra,
  };
}

function trustDocument(rootPrivateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], root: SigningKeyV1, release: SigningKeyV1): RegistryTrustDocumentV1 {
  const unsigned = { schemaVersion: 1 as const, registry: 'auno', keys: [root, release] };
  return {
    ...unsigned,
    signature: signEd25519(canonicalSignedPayload(unsigned), root.keyId, rootPrivateKey),
  };
}

test('root-signed trust delegates an active release private key', () => {
  const rootPair = generateKeyPairSync('ed25519');
  const releasePair = generateKeyPairSync('ed25519');
  const root = publicDescriptor('auno-root-1', rootPair.publicKey);
  const release = publicDescriptor('auno-release-1', releasePair.publicKey);
  const trust = trustDocument(rootPair.privateKey, root, release);

  const result = validateDelegatedReleaseSigner(trust, root, release.keyId, releasePair.privateKey, new Date('2026-09-13T00:00:00Z'));

  assert.equal(result.key.keyId, release.keyId);
  assert.equal(result.trust.signature.keyId, root.keyId);
});

test('undelegated release key is rejected', () => {
  const rootPair = generateKeyPairSync('ed25519');
  const releasePair = generateKeyPairSync('ed25519');
  const otherPair = generateKeyPairSync('ed25519');
  const root = publicDescriptor('auno-root-1', rootPair.publicKey);
  const release = publicDescriptor('auno-release-1', releasePair.publicKey);
  const trust = trustDocument(rootPair.privateKey, root, release);

  assert.throws(
    () => validateDelegatedReleaseSigner(trust, root, 'not-delegated', otherPair.privateKey),
    /AUNO_RELEASE_KEY_NOT_DELEGATED/,
  );
});

test('release private key must match delegated public key', () => {
  const rootPair = generateKeyPairSync('ed25519');
  const releasePair = generateKeyPairSync('ed25519');
  const wrongPair = generateKeyPairSync('ed25519');
  const root = publicDescriptor('auno-root-1', rootPair.publicKey);
  const release = publicDescriptor('auno-release-1', releasePair.publicKey);
  const trust = trustDocument(rootPair.privateKey, root, release);

  assert.throws(
    () => validateDelegatedReleaseSigner(trust, root, release.keyId, wrongPair.privateKey),
    /AUNO_RELEASE_KEY_MISMATCH/,
  );
});

test('revoked or expired delegated release key cannot sign', () => {
  const rootPair = generateKeyPairSync('ed25519');
  const releasePair = generateKeyPairSync('ed25519');
  const root = publicDescriptor('auno-root-1', rootPair.publicKey);
  const revoked = publicDescriptor('auno-release-revoked', releasePair.publicKey, { revokedAt: '2026-09-01T00:00:00Z' });
  const expired = publicDescriptor('auno-release-expired', releasePair.publicKey, { validUntil: '2026-09-01T00:00:00Z' });

  assert.throws(
    () => validateDelegatedReleaseSigner(trustDocument(rootPair.privateKey, root, revoked), root, revoked.keyId, releasePair.privateKey, new Date('2026-09-13T00:00:00Z')),
    /AUNO_SIGNING_KEY_REVOKED/,
  );
  assert.throws(
    () => validateDelegatedReleaseSigner(trustDocument(rootPair.privateKey, root, expired), root, expired.keyId, releasePair.privateKey, new Date('2026-09-13T00:00:00Z')),
    /AUNO_SIGNING_KEY_EXPIRED/,
  );
});

test('tampered root-signed trust fails before release-key validation', () => {
  const rootPair = generateKeyPairSync('ed25519');
  const releasePair = generateKeyPairSync('ed25519');
  const root = publicDescriptor('auno-root-1', rootPair.publicKey);
  const release = publicDescriptor('auno-release-1', releasePair.publicKey);
  const trust = trustDocument(rootPair.privateKey, root, release);
  const tampered = { ...trust, registry: 'evil' };

  assert.throws(
    () => validateDelegatedReleaseSigner(tampered, root, release.keyId, releasePair.privateKey),
    /AUNO_SIGNATURE_INVALID/,
  );
});
