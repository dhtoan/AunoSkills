import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  attestSkillSubmission,
  deriveRuntimeName,
  initSkill,
  inspectSkill,
  packSkill,
  publishSkill,
  validateSkillSource,
  verifySkillArtifact,
} from '../../../packages/authoring/src/index.ts';
import {
  submitToRegistryIntake,
  type RegistryAuthConfig,
  type RegistryFetch,
  type RegistryIntakeConfig,
} from '../../../packages/registry/src/index.ts';
import type { PublisherAttestationV1, SkillSubmissionV1 } from '../../../packages/schema/src/index.ts';
import { AunoError, readJsonFile } from '../../../packages/shared/src/index.ts';
import type { CliArgs } from './args.ts';

function required(args: CliArgs, index: number, usage: string): string {
  const value = args.positionals[index];
  if (!value) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: usage, category: 'config' });
  return value;
}

function requiredFlag(value: string | undefined, usage: string): string {
  if (!value) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: usage, category: 'config' });
  return value;
}

export interface SkillRegistryConfig {
  auth?: RegistryAuthConfig;
  intake?: RegistryIntakeConfig;
}

export interface SkillCommandContext {
  offline?: boolean;
  registryConfigs?: Record<string, SkillRegistryConfig>;
  registryFetch?: RegistryFetch;
}

export function skillCommandName(args: CliArgs): string {
  return `skill ${args.positionals[0] ?? 'help'}`;
}

export async function skillCommand(
  args: CliArgs,
  projectRoot: string,
  context: SkillCommandContext = {},
): Promise<unknown> {
  const action = args.positionals[0];
  if (!action) return { actions: ['init', 'validate', 'inspect', 'pack', 'verify', 'publish', 'attest', 'submit'] };

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
  if (action === 'attest') {
    const submissionPath = resolve(required(args, 1, 'skill attest requires a submission descriptor path'));
    const keyId = requiredFlag(args.publisherKeyId, 'skill attest requires --publisher-key-id <id>');
    return attestSkillSubmission(submissionPath, {
      keyId,
      ...(args.publisherKeyEnv ? { privateKeyEnv: args.publisherKeyEnv } : {}),
      ...(args.output ? { output: resolve(args.output) } : {}),
    });
  }
  if (action === 'submit') {
    const artifactPath = resolve(required(args, 1, 'skill submit requires an artifact path'));
    const submissionPath = resolve(requiredFlag(args.submission, 'skill submit requires --submission <path>'));
    const registryName = requiredFlag(args.publishRegistry, 'skill submit requires --publish-registry <name>');
    if (context.offline || args.offline) {
      throw new AunoError({
        code: 'AUNO_INVALID_USAGE',
        message: 'skill submit cannot run with --offline',
        category: 'config',
      });
    }
    if (registryName === 'auno') {
      throw new AunoError({
        code: 'AUNO_REGISTRY_INTAKE_INVALID',
        message: 'The reserved auno registry does not advertise a writable intake endpoint',
        category: 'registry',
      });
    }
    const registry = context.registryConfigs?.[registryName];
    if (!registry) {
      throw new AunoError({
        code: 'AUNO_REGISTRY_NOT_FOUND',
        message: `Registry not configured: ${registryName}`,
        category: 'registry',
      });
    }
    if (!registry.intake?.url) {
      throw new AunoError({
        code: 'AUNO_REGISTRY_INTAKE_INVALID',
        message: `Registry does not configure an intake endpoint: ${registryName}`,
        category: 'registry',
      });
    }
    const artifact = await readFile(artifactPath);
    const submission = await readJsonFile(submissionPath) as SkillSubmissionV1;
    const attestation = args.attestation
      ? await readJsonFile(resolve(args.attestation)) as PublisherAttestationV1
      : undefined;
    return submitToRegistryIntake({
      intakeUrl: registry.intake.url,
      auth: registry.auth ?? { type: 'none' },
      artifact,
      submission,
      ...(attestation ? { attestation } : {}),
      ...(context.registryFetch ? { fetchImpl: context.registryFetch } : {}),
    });
  }
  throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `Unknown skill action: ${action}`, category: 'config' });
}
