import { join } from 'node:path';
import { scanScope } from './detectors.ts';
import { discoverWorkspaces } from './workspaces.ts';
import type { Evidence } from '../../evidence/src/index.ts';

export interface WorkspaceIntelligence {
  path: string;
  technologies: Record<string, number>;
  traits: string[];
  capabilities: string[];
  evidence: Evidence[];
}

export interface ProjectIntelligence extends WorkspaceIntelligence {
  root: string;
  workspaces: WorkspaceIntelligence[];
  sensitiveFiles: string[];
}

export interface ScanOptions { maxWorkspaces?: number }

function projectView(path: string, scanned: Awaited<ReturnType<typeof scanScope>>): WorkspaceIntelligence {
  return { path, technologies: scanned.graph.subjects(path), traits: [...scanned.traits].sort(), capabilities: [...scanned.capabilities].sort(), evidence: scanned.graph.list() };
}

export async function scanProject(root: string, options: ScanOptions = {}): Promise<ProjectIntelligence> {
  const rootScan = await scanScope(root, '.');
  const workspacePaths = (await discoverWorkspaces(root)).slice(0, options.maxWorkspaces ?? 100);
  const workspaces: WorkspaceIntelligence[] = [];
  for (const path of workspacePaths) workspaces.push(projectView(path, await scanScope(join(root, path), path)));
  return { root, ...projectView('.', rootScan), workspaces, sensitiveFiles: [...rootScan.sensitiveFiles].sort() };
}
