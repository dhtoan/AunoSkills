import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import type { RegistryTrustDocumentV1, SigningKeyV1 } from '../../schema/src/index.ts';
import type { Ed25519PrivateKey } from '../../security/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';
import { RegistryTrustStore } from './trust.ts';

export interface DelegatedReleaseSigner {
  trust: RegistryTrustDocumentV1;
  key: SigningKeyV1;
}

function releaseError(code: string, message: string): AunoError {
  return new AunoError({ code, message: `${code} ${message}`, category: 'integrity' });
}

function isKeyObject(value: Ed25519PrivateKey): value is KeyObject {
  return typeof value === 'object' && !Buffer.isBuffer(value) && 'export' in value && typeof value.export === 'function';
}

function privateKeyObject(value: Ed25519PrivateKey): KeyObject {
  return isKeyObject(value) ? value : createPrivateKey(value);
}

function publicKeyBase64FromPrivate(value: Ed25519PrivateKey): string {
  try {
    return createPublicKey(privateKeyObject(value)).export({ type: 'spki', format: 'der' }).toString('base64');
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_RELEASE_KEY_MISMATCH',
      message: 'AUNO_RELEASE_KEY_MISMATCH release private key is invalid',
      category: 'integrity',
      cause,
    });
  }
}

export function validateDelegatedReleaseSigner(
  trust: RegistryTrustDocumentV1,
  rootAnchor: SigningKeyV1,
  releaseKeyId: string,
  releasePrivateKey: Ed25519PrivateKey,
  now = new Date(),
): DelegatedReleaseSigner {
  const store = new RegistryTrustStore([rootAnchor]);
  const verifiedTrust = store.verifyAndApply(trust, now);
  const delegated = store.getKey(releaseKeyId);
  if (!delegated || delegated.keyId === rootAnchor.keyId) {
    throw releaseError('AUNO_RELEASE_KEY_NOT_DELEGATED', releaseKeyId);
  }
  const active = store.requireActiveKey(releaseKeyId, now);
  const derivedPublicKey = publicKeyBase64FromPrivate(releasePrivateKey);
  if (derivedPublicKey !== active.publicKey) {
    throw releaseError('AUNO_RELEASE_KEY_MISMATCH', releaseKeyId);
  }
  return { trust: verifiedTrust, key: active };
}
