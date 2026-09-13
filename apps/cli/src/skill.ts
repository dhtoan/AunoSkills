import { join, resolve } from 'node:path';
import {
  deriveRuntimeName,
  initSkill,
  inspectSkill,
  packSkill,
  publishSkill,
  validateSkillSource,
  verifySkillArtifact,
} from '../../../packages/authoring/src/index.ts';
import { AunoError } from '../../../packages/shared/src/index.ts';
import type { CliArgs } from './args.ts';

function required(args: CliArgs, index: number, usage: string): string {
  const value = args.positionals[index];
  if (!value) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: usage, category: 'config' });
  return value;
}

export function skillCommandName(args: CliArgs): string {
  return `skill ${args.positionals[0] ?? 'help'}`;
}

export async function skillCommand(args: CliArgs, projectRoot: string): Promise<unknown> {
  const action = args.positionals[0];
  if (!action) return { actions: ['init', 'validate', 'inspect', 'pack', 'verify', 'publish'] };

  if (action === 'init') {
    const packageId = required(args, 1, 'skill init requires a package id');
    const runtimeName = deriveRuntimeName(packageId);
    const target = resolve(args.output ?? join(projectRoot, runtimeName));
    return initSkill(target, {
      packageId,
      version: args.skillVersion ?? '0.1.0',
      ...(args.publisher ? { publisher: args.publisher } : {}),
    });
  }
  if (action === 'validate') return validateSkillSource(resolve(required(args, 1, 'skill validate requires a source path')));
  if (action === 'inspect') return inspectSkill(resolve(required(args, 1, 'skill inspect requires a source path')));
  if (action === 'pack') {
    const source = resolve(required(args, 1, 'skill pack requires a source path'));
    return packSkill(source, args.output ? { outputPath: resolve(args.output) } : {});
  }
  if (action === 'verify') return verifySkillArtifact(resolve(required(args, 1, 'skill verify requires an artifact path')));
  if (action === 'publish') {
    const input = resolve(required(args, 1, 'skill publish requires a source or artifact path'));
    return publishSkill(input, {
      ...(args.output ? { output: resolve(args.output) } : {}),
      ...(args.registryWorkspace ? { registryWorkspace: resolve(args.registryWorkspace) } : {}),
      ...(args.sourceRepository ? { sourceRepository: args.sourceRepository } : {}),
      ...(args.sourceCommit ? { sourceCommit: args.sourceCommit } : {}),
    });
  }
  throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `Unknown skill action: ${action}`, category: 'config' });
}
