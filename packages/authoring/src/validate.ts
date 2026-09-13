import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateSkillMetadata, type SkillMetadataV1 } from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';
import { capabilityMismatchFindings, inferCapabilities } from './capabilities.ts';
import { validateSkillDependencies } from './dependencies.ts';
import { deriveRuntimeName, validatePackageId } from './identity.ts';
import { collectSkillInventory } from './inventory.ts';
import type { AuthoringFinding, SkillSourceFile, SkillValidationResult } from './types.ts';

const STRICT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
const AUTHORITATIVE_FIELDS = ['trust', 'verified', 'signature', 'integrity', 'attestation'] as const;

function high(code: string, category: string, message: string, path?: string): AuthoringFinding {
  return { code, severity: 'high', category, message, ...(path ? { path } : {}) };
}

async function readMetadata(root: string): Promise<{ raw: Record<string, unknown>; metadata?: SkillMetadataV1; findings: AuthoringFinding[] }> {
  const findings: AuthoringFinding[] = [];
  let rawText: string;
  try {
    rawText = await readFile(join(root, 'auno.json'), 'utf8');
  } catch {
    return { raw: {}, findings: [high('AUNO_SKILL_SOURCE_INVALID', 'schema', 'Missing auno.json', 'auno.json')] };
  }
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('auno.json must contain an object');
    raw = parsed as Record<string, unknown>;
  } catch (cause) {
    return { raw: {}, findings: [high('AUNO_SKILL_SOURCE_INVALID', 'schema', `Invalid auno.json: ${cause instanceof Error ? cause.message : String(cause)}`, 'auno.json')] };
  }
  for (const field of AUTHORITATIVE_FIELDS) {
    if (field in raw) findings.push(high('AUNO_SKILL_SOURCE_INVALID', 'security', `Author metadata cannot declare authoritative field: ${field}`, 'auno.json'));
  }
  try {
    const metadata = validateSkillMetadata(raw);
    return { raw, metadata, findings };
  } catch (cause) {
    findings.push(high('AUNO_SKILL_SOURCE_INVALID', 'schema', cause instanceof Error ? cause.message : String(cause), 'auno.json'));
    return { raw, findings };
  }
}

export async function validateSkillSource(root: string): Promise<SkillValidationResult> {
  const findings: AuthoringFinding[] = [];
  const loaded = await readMetadata(root);
  findings.push(...loaded.findings);
  let runtimeName: string | undefined;
  if (loaded.metadata) {
    try {
      validatePackageId(loaded.metadata.id);
      runtimeName = deriveRuntimeName(loaded.metadata.id);
    } catch (cause) {
      findings.push(high('AUNO_SKILL_ID_INVALID', 'identity', cause instanceof Error ? cause.message : String(cause), 'auno.json'));
    }
    if (!STRICT_SEMVER.test(loaded.metadata.version)) {
      findings.push(high('AUNO_SKILL_VERSION_INVALID', 'version', `Skill version must be strict semantic versioning: ${loaded.metadata.version}`, 'auno.json'));
    }
    findings.push(...validateSkillDependencies(loaded.metadata));
  }

  let files: SkillSourceFile[] = [];
  try {
    files = await collectSkillInventory(root);
  } catch (cause) {
    if (cause instanceof AunoError) findings.push(high(cause.code, cause.category, cause.message));
    else findings.push(high('AUNO_SKILL_SOURCE_INVALID', 'filesystem', cause instanceof Error ? cause.message : String(cause)));
  }
  if (!files.some((file) => file.path === 'SKILL.md')) findings.push(high('AUNO_SKILL_SOURCE_INVALID', 'skill-content', 'Missing SKILL.md', 'SKILL.md'));

  const inference = inferCapabilities(files);
  if (loaded.metadata) findings.push(...capabilityMismatchFindings(loaded.metadata.capabilities, inference.capabilities));
  const valid = !findings.some((finding) => finding.severity === 'high' || finding.severity === 'critical');
  return {
    valid,
    ...(loaded.metadata ? { metadata: loaded.metadata } : {}),
    ...(runtimeName ? { runtimeName } : {}),
    inferredCapabilities: inference.capabilities,
    capabilityEvidence: inference.evidence,
    findings,
    files,
  };
}
