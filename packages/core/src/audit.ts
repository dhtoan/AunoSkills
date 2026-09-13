import type { LockfileV1 } from '../../schema/src/index.ts';

export type AuditSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export interface AuditFinding { severity: AuditSeverity; code: string; skillId: string; message: string }
export interface AuditReport { findings: AuditFinding[] }
const SEVERITY: Record<AuditSeverity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export function auditLockfile(lock: LockfileV1): AuditReport {
  const findings: AuditFinding[] = [];
  for (const [skillId, skill] of Object.entries(lock.skills)) {
    if (skill.effectiveTrust === 'untrusted') findings.push({ severity: 'high', code: 'AUNO_UNTRUSTED_SKILL', skillId, message: 'Skill effective trust is untrusted' });
    else if (skill.effectiveTrust === 'community') findings.push({ severity: 'low', code: 'AUNO_COMMUNITY_SKILL', skillId, message: 'Skill effective trust is community' });
    const commands = skill.capabilities?.shell?.commands ?? [];
    if (commands.includes('*')) findings.push({ severity: 'high', code: 'AUNO_UNRESTRICTED_SHELL', skillId, message: 'Skill requests unrestricted shell execution' });
  }
  return { findings };
}

export function meetsAuditThreshold(report: AuditReport, threshold: AuditSeverity): boolean {
  return report.findings.some((finding) => SEVERITY[finding.severity] >= SEVERITY[threshold]);
}
