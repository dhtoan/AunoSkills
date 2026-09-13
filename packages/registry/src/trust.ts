import { createPublicKey, type KeyObject } from 'node:crypto';
import {
  validateRegistryTrustDocument,
  type RegistryTrustDocumentV1,
  type SigningKeyV1,
} from '../../schema/src/index.ts';
import { canonicalSignedPayload, verifyEd25519 } from '../../security/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';

function trustError(code: string, message: string): AunoError {
  return new AunoError({ code, message: `${code} ${message}`, category: 'integrity' });
}

function publicKeyObject(key: SigningKeyV1): KeyObject {
  try {
    return createPublicKey({ key: Buffer.from(key.publicKey, 'base64'), format: 'der', type: 'spki' });
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_TRUST_METADATA_INVALID',
      message: `AUNO_TRUST_METADATA_INVALID invalid public key ${key.keyId}`,
      category: 'integrity',
      cause,
    });
  }
}

export class RegistryTrustStore {
  readonly #keys = new Map<string, SigningKeyV1>();

  constructor(anchors: SigningKeyV1[]) {
    for (const key of anchors) this.#keys.set(key.keyId, { ...key });
  }

  getKey(keyId: string): SigningKeyV1 | undefined {
    const key = this.#keys.get(keyId);
    return key ? { ...key } : undefined;
  }

  listKeys(): SigningKeyV1[] {
    return [...this.#keys.values()].map((key) => ({ ...key })).sort((a, b) => a.keyId.localeCompare(b.keyId));
  }

  requireActiveKey(keyId: string, now = new Date()): SigningKeyV1 {
    const key = this.#keys.get(keyId);
    if (!key) throw trustError('AUNO_SIGNING_KEY_UNKNOWN', keyId);
    if (key.revokedAt && Date.parse(key.revokedAt) <= now.getTime()) {
      throw trustError('AUNO_SIGNING_KEY_REVOKED', keyId);
    }
    if (key.validFrom && Date.parse(key.validFrom) > now.getTime()) {
      throw trustError('AUNO_SIGNING_KEY_EXPIRED', `${keyId} is not yet valid`);
    }
    if (key.validUntil && Date.parse(key.validUntil) < now.getTime()) {
      throw trustError('AUNO_SIGNING_KEY_EXPIRED', keyId);
    }
    return { ...key };
  }

  verifyAndApply(value: RegistryTrustDocumentV1, now = new Date()): RegistryTrustDocumentV1 {
    const document = validateRegistryTrustDocument(value);
    const signer = this.requireActiveKey(document.signature.keyId, now);
    verifyEd25519(canonicalSignedPayload(document), document.signature, publicKeyObject(signer));
    for (const key of document.keys) this.#keys.set(key.keyId, { ...key });
    return document;
  }
}
