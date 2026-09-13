import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { stableStringify, type SignatureEnvelopeV1 } from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';

export type Ed25519PrivateKey = KeyObject | string | Buffer;
export type Ed25519PublicKey = KeyObject | string | Buffer;

function isKeyObject(value: Ed25519PrivateKey | Ed25519PublicKey): value is KeyObject {
  return typeof value === 'object' && !Buffer.isBuffer(value) && 'export' in value && typeof value.export === 'function';
}

function privateKeyObject(key: Ed25519PrivateKey): KeyObject {
  return isKeyObject(key) ? key : createPrivateKey(key);
}

function publicKeyObject(key: Ed25519PublicKey): KeyObject {
  return isKeyObject(key) ? key : createPublicKey(key);
}

export function canonicalSignedPayload(value: unknown, excludedKeys: string[] = ['signature']): Buffer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Buffer.from(stableStringify(value), 'utf8');
  }
  const copy = { ...(value as Record<string, unknown>) };
  for (const key of excludedKeys) delete copy[key];
  return Buffer.from(stableStringify(copy), 'utf8');
}

export function signEd25519(payload: Buffer | Uint8Array | string, keyId: string, privateKey: Ed25519PrivateKey): SignatureEnvelopeV1 {
  const bytes = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
  const signature = sign(null, bytes, privateKeyObject(privateKey)).toString('base64');
  return { keyId, algorithm: 'ed25519', signature };
}

export function verifyEd25519(payload: Buffer | Uint8Array | string, envelope: SignatureEnvelopeV1, publicKey: Ed25519PublicKey): void {
  if (envelope.algorithm !== 'ed25519') {
    throw new AunoError({
      code: 'AUNO_SIGNATURE_INVALID',
      message: `AUNO_SIGNATURE_INVALID unsupported algorithm ${envelope.algorithm}`,
      category: 'integrity',
    });
  }
  const bytes = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload);
  let valid = false;
  try {
    valid = verify(null, bytes, publicKeyObject(publicKey), Buffer.from(envelope.signature, 'base64'));
  } catch (cause) {
    throw new AunoError({
      code: 'AUNO_SIGNATURE_INVALID',
      message: 'AUNO_SIGNATURE_INVALID signature verification failed',
      category: 'integrity',
      cause,
    });
  }
  if (!valid) {
    throw new AunoError({
      code: 'AUNO_SIGNATURE_INVALID',
      message: 'AUNO_SIGNATURE_INVALID signature verification failed',
      category: 'integrity',
    });
  }
}
