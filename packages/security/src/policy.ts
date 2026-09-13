import type { CapabilitySet, ProjectPolicyV1, TrustLevel } from '../../schema/src/index.ts';

export interface SkillSecurityProfile {
  trust: TrustLevel;
  capabilities?: CapabilitySet;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reasons: string[];
}

const TRUST_ORDER: Record<TrustLevel, number> = { untrusted: 0, community: 1, verified: 2 };

export function evaluatePolicy(policy: ProjectPolicyV1, skill: SkillSecurityProfile): PolicyDecision {
  const reasons: string[] = [];
  let allowed = true;
  let requiresApproval = false;
  const minimum = policy.minimumTrust ?? 'untrusted';
  if (TRUST_ORDER[skill.trust] < TRUST_ORDER[minimum]) {
    allowed = false;
    reasons.push(`trust ${skill.trust} is below minimum ${minimum}`);
  }
  if (skill.trust === 'untrusted' && policy.allowUntrusted === false) {
    allowed = false;
    reasons.push('untrusted skills are disabled');
  }
  const shell = skill.capabilities?.shell?.commands ?? [];
  if (shell.length) {
    if ((policy.execution ?? 'ask') === 'deny') {
      allowed = false;
      reasons.push('execution policy denies shell commands');
    } else if ((policy.execution ?? 'ask') === 'ask') {
      requiresApproval = true;
      reasons.push('shell execution requires approval');
    }
  }
  const network = skill.capabilities?.network?.connect ?? [];
  if (network.length) {
    if ((policy.network ?? 'ask') === 'deny') {
      allowed = false;
      reasons.push('network policy denies connections');
    } else if ((policy.network ?? 'ask') === 'ask') {
      requiresApproval = true;
      reasons.push('network access requires approval');
    }
  }
  return { allowed, requiresApproval, reasons };
}
