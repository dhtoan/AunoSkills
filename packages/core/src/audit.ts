import type { LockfileV1 } from '../../schema/src/index.ts';

export type AuditSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type SigningKeyAuditState = 'active' | 'revoked' | 'expired' | 'unknown';
export type RegistrySignerStates = Record<string, Record<string, SigningKeyAuditState>>;
export interface AuditFinding { severity: AuditSeverity; code: string; skillId: string; message: string }
export interface AuditReport { findings: AuditFinding[] }
const SEVERITY: Record<AuditSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function auditLockfile(lock: LockfileV1, signerStates: RegistrySignerStates = {}): AuditReport {
  const findings: AuditFinding[] = [];
  for (const [skillId, skill] of Object.entries(lock.skills)) {
    if (skill.effectiveTrust === 'untrusted') {
      findings.push({ severity: 'high', code: 'AUNO_UNTRUSTED_SKILL', skillId, message: 'Skill effective trust is untrusted' });
    } else if (skill.effectiveTrust === 'community') {
      findings.push({ severity: 'low', code: 'AUNO_COMMUNITY_SKILL', skillId, message: 'Skill effective trust is community' });
      if (!skill.signing) findings.push({ severity: 'medium', code: 'AUNO_UNSIGNED_COMMUNITY', skillId, message: 'Community skill has no cryptographic signer proof in the lockfile' });
    } else if (!skill.signing) {
      findings.push({ severity: 'high', code: 'AUNO_SIGNING_PROOF_MISSING', skillId, message: 'Verified skill has no cryptographic signer proof in the lockfile' });
    }

    if (skill.signing) {
      const keyIds = [...new Set([skill.signing.registryKeyId, skill.signing.manifestKeyId])];
      for (const keyId of keyIds) {
        const state = signerStates[skill.registry]?.[keyId];
        if (state === 'revoked') findings.push({ severity: 'critical', code: 'AUNO_SIGNING_KEY_REVOKED', skillId, message: `Signing key ${keyId} has been revoked` });
        else if (state === 'expired') findings.push({ severity: 'high', code: 'AUNO_SIGNING_KEY_EXPIRED', skillId, message: `Signing key ${keyId} is expired or outside its validity window` });
        else if (state === 'unknown') findings.push({ severity: 'high', code: 'AUNO_SIGNING_KEY_UNKNOWN', skillId, message: `Signing key ${keyId} is not trusted by the current registry state` });
      }
    }

    const commands = skill.capabilities?.shell?.commands ?? [];
    if (commands.includes('*')) findings.push({ severity: 'high', code: 'AUNO_UNRESTRICTED_SHELL', skillId, message: 'Skill requests unrestricted shell execution' });
  }
  return { findings };
}

export function meetsAuditThreshold(report: AuditReport, threshold: AuditSeverity): boolean {
  return report.findings.some((finding) => SEVERITY[finding.severity] >= SEVERITY[threshold]);
}
