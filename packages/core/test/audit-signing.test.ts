import test from 'node:test';
import assert from 'node:assert/strict';
import type { LockfileV1 } from '../../schema/src/index.ts';
import { auditLockfile } from '../src/audit.ts';

function lock(skill: LockfileV1['skills'][string]): LockfileV1 {
  return { lockfileVersion: 1, generatedBy: 'aunoskills@0.2.0', project: { manifestDigest: 'sha256:x' }, skills: { 'auno:demo': skill } };
}

const base = {
  requested: '1.0.0', resolved: '1.0.0', registry: 'auno', bundleIntegrity: 'sha256:bundle', trust: 'verified' as const, effectiveTrust: 'verified' as const,
};

test('verified skill without signer proof is a high severity audit finding', () => {
  const report = auditLockfile(lock({ ...base }));
  assert.ok(report.findings.some((finding) => finding.code === 'AUNO_SIGNING_PROOF_MISSING' && finding.severity === 'high'));
});

test('unsigned community skill is reported as medium in addition to trust context', () => {
  const report = auditLockfile(lock({ ...base, trust: 'community', effectiveTrust: 'community' }));
  assert.ok(report.findings.some((finding) => finding.code === 'AUNO_UNSIGNED_COMMUNITY' && finding.severity === 'medium'));
});

test('revoked installed registry signer is critical', () => {
  const signed = lock({
    ...base,
    signing: { registryKeyId: 'root-1', manifestKeyId: 'root-1', registrySignatureDigest: 'sha256:r', manifestSignatureDigest: 'sha256:m' },
  });
  const report = auditLockfile(signed, { auno: { 'root-1': 'revoked' } });
  assert.ok(report.findings.some((finding) => finding.code === 'AUNO_SIGNING_KEY_REVOKED' && finding.severity === 'critical'));
});
