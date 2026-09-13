import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { MaterializationPlan } from '../../adapters/src/index.ts';
import { renderPlanIntegrity } from '../../adapters/src/index.ts';
import { pathExists } from '../../shared/src/index.ts';
import { readOwnership } from './state.ts';

export interface DoctorIssue { code: string; message: string; target?: string }
export interface DoctorReport { issues: DoctorIssue[] }

async function collectFiles(root: string, current = root): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(files, await collectFiles(root, path));
    else if (entry.isFile()) files[relative(root, path).replaceAll('\\', '/')] = await readFile(path);
  }
  return files;
}

export async function inspectMaterializations(projectRoot: string): Promise<DoctorReport> {
  const ownership = await readOwnership(projectRoot);
  const issues: DoctorIssue[] = [];
  for (const [target, owner] of Object.entries(ownership)) {
    if (!await pathExists(target)) {
      issues.push({ code: 'AUNO_MATERIALIZATION_DRIFT', message: `Managed target is missing: ${target}`, target });
      continue;
    }
    const files = await collectFiles(target);
    const plan: MaterializationPlan = {
      skillId: owner.skillId,
      target,
      agents: owner.agents,
      renderer: owner.renderer,
      rendererVersion: owner.rendererVersion,
      files,
    };
    if (renderPlanIntegrity(plan) !== owner.integrity) issues.push({ code: 'AUNO_MATERIALIZATION_DRIFT', message: `Managed target has changed: ${target}`, target });
  }
  return { issues };
}
