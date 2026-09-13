import { AunoError, sha256Bytes } from '../../shared/src/index.ts';

export function verifyIntegrity(bytes: Uint8Array, expected: string): void {
  const digest = sha256Bytes(bytes);
  const normalized = expected.replace(/^sha256:/, '');
  if (digest !== normalized) {
    throw new AunoError({
      code: 'AUNO_HASH_MISMATCH',
      message: `AUNO_HASH_MISMATCH expected ${normalized} received ${digest}`,
      category: 'integrity',
      severity: 'critical',
    });
  }
}
