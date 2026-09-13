import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { stableStringify, type SkillBundleV1 } from '../../schema/src/index.ts';
import { AunoError, sha256Bytes } from '../../shared/src/index.ts';
import { validateSkillSource } from './validate.ts';
import type { PackedSkillResult } from './types.ts';

export interface PackSkillOptions {
  outputDir?: string;
  outputPath?: string;
}

function pathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !resolve(child).startsWith(`${sep}${sep}`));
}

export async function packSkill(root: string, options: PackSkillOptions = {}): Promise<PackedSkillResult> {
  const validation = await validateSkillSource(root);
  if (!validation.valid || !validation.metadata || !validation.runtimeName) {
    throw new AunoError({
      code: 'AUNO_SKILL_PACK_FAILED',
      message: 'Skill source must pass validation before packing',
      category: 'config',
      details: { findings: validation.findings },
    });
  }

  const defaultOutputDir = join(root, 'dist-skills');
  const outputDir = options.outputPath ? resolve(options.outputPath, '..') : resolve(options.outputDir ?? defaultOutputDir);
  if (pathInside(root, outputDir) && resolve(outputDir) !== resolve(defaultOutputDir)) {
    throw new AunoError({
      code: 'AUNO_SKILL_PACK_FAILED',
      message: 'Pack output inside a skill source is only supported in the managed dist-skills directory',
      category: 'filesystem',
    });
  }

  const metadataDigest = sha256Bytes(Buffer.from(stableStringify(validation.metadata), 'utf8'));
  const manifestFiles = validation.files.map(({ path, sha256, size }) => ({ path, sha256, size }));
  const bundle: SkillBundleV1 = {
    schemaVersion: 1,
    manifest: {
      schemaVersion: 1,
      packageId: validation.metadata.id,
      runtimeName: validation.runtimeName,
      version: validation.metadata.version,
      metadataDigest,
      ...(validation.metadata.capabilities ? { capabilities: validation.metadata.capabilities } : {}),
      ...(validation.metadata.dependencies ? { dependencies: validation.metadata.dependencies } : {}),
      files: manifestFiles,
    },
    files: validation.files.map(({ path, sha256, size, bytes }) => ({ path, sha256, size, contentBase64: bytes.toString('base64') })),
  };
  const bytes = Buffer.from(stableStringify(bundle), 'utf8');
  const sha256 = sha256Bytes(bytes);
  const fileName = `${validation.runtimeName}-${validation.metadata.version}.aunoskill`;
  const outputPath = options.outputPath ? resolve(options.outputPath) : join(outputDir, fileName);
  if (basename(outputPath) !== fileName && !options.outputPath) {
    throw new AunoError({ code: 'AUNO_SKILL_PACK_FAILED', message: 'Unexpected artifact output name', category: 'filesystem' });
  }
  await mkdir(resolve(outputPath, '..'), { recursive: true });
  await writeFile(outputPath, bytes);
  return { path: outputPath, fileName: basename(outputPath), sha256, bytes };
}
