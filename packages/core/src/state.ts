import { join } from 'node:path';
import { readJsonFile, pathExists, writeJsonAtomic } from '../../shared/src/index.ts';
import type { AgentId } from '../../schema/src/index.ts';

export interface OwnershipRecord {
  skillId: string;
  integrity: string;
  renderer: string;
  rendererVersion: number;
  agents: AgentId[];
}
export type OwnershipState = Record<string, OwnershipRecord>;

export function stateDir(projectRoot: string): string { return join(projectRoot, '.aunoskills', 'state'); }
export function ownershipPath(projectRoot: string): string { return join(stateDir(projectRoot), 'ownership.json'); }
export async function readOwnership(projectRoot: string): Promise<OwnershipState> {
  const path = ownershipPath(projectRoot);
  if (!await pathExists(path)) return {};
  return readJsonFile<OwnershipState>(path);
}
export async function writeOwnership(projectRoot: string, state: OwnershipState): Promise<void> { await writeJsonAtomic(ownershipPath(projectRoot), state); }
