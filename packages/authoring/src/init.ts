import { mkdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { AgentId, CapabilitySet, SkillMetadataV1 } from '../../schema/src/index.ts';
import { stableStringify } from '../../schema/src/index.ts';
import { AunoError } from '../../shared/src/index.ts';
import { deriveRuntimeName, validatePackageId } from './identity.ts';

export interface InitSkillOptions {
  packageId: string;
  version?: string;
  publisher?: string;
  displayName?: string;
  description?: string;
  license?: string;
  agents?: AgentId[];
  topics?: string[];
  capabilities?: CapabilitySet;
  dependencies?: Record<string, string>;
}

function titleFromRuntimeName(runtimeName: string): string {
  return runtimeName.split(/[-_.]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export async function initSkill(targetDir: string, options: InitSkillOptions): Promise<{ root: string; metadata: SkillMetadataV1 }> {
  validatePackageId(options.packageId);
  const runtimeName = deriveRuntimeName(options.packageId);
  const version = options.version ?? '0.1.0';
  const displayName = options.displayName ?? titleFromRuntimeName(runtimeName) || basename(targetDir);
  const metadata: SkillMetadataV1 = {
    schemaVersion: 1,
    id: options.packageId,
    version,
    ...(options.publisher ? { publisher: options.publisher } : {}),
    ...(displayName ? { displayName } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.license ? { license: options.license } : {}),
    ...(options.agents?.length ? { compatibility: { agents: options.agents } } : {}),
    ...(options.topics?.length ? { topics: [...options.topics] } : {}),
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    ...(options.dependencies ? { dependencies: { ...options.dependencies } } : {}),
  };

  try {
    await mkdir(targetDir, { recursive: false });
  } catch (cause) {
    throw new AunoError({ code: 'AUNO_SKILL_SOURCE_INVALID', message: `Cannot create skill directory: ${targetDir}`, category: 'filesystem', cause });
  }

  const skillMd = `# ${displayName}\n\n## Purpose\n\nDescribe what this skill helps an AI coding agent accomplish.\n\n## When to use\n\nDescribe the project signals or tasks that should trigger this skill.\n\n## Workflow\n\n1. Inspect the relevant project context.\n2. Apply the skill instructions within the declared constraints.\n3. Verify the result before reporting completion.\n\n## Constraints\n\n- Keep changes scoped to the requested task.\n- Do not assume permissions or capabilities that are not declared.\n- Do not expose credentials, secrets, or private data.\n\n## Verification\n\nDescribe the checks that demonstrate the work is correct.\n`;
  await writeFile(`${targetDir}/SKILL.md`, skillMd, 'utf8');
  await writeFile(`${targetDir}/auno.json`, `${stableStringify(metadata)}\n`, 'utf8');
  return { root: targetDir, metadata };
}
