import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { stableStringify, validateSkillMetadata, validateSkillSubmission, type SkillMetadataV1, type SkillSubmissionV1 } from '../../schema/src/index.ts';
import { AunoError, pathExists } from '../../shared/src/index.ts';
import { packSkill } from './pack.ts';
import type { PackedSkillResult, PublishSkillResult } from './types.ts';
import { validateSkillSource } from './validate.ts';
import { verifySkillArtifact } from './verify.ts';

export interface PublishSkillOptions {
  output?: string;
  registryWorkspace?: string;
  sourceRepository?: string;
  sourceCommit?: string;
}

interface PublicationArtifact {
  packed: PackedSkillResult;
  metadata: SkillMetadataV1;
}

async function writeBytesAtomic(path: string, bytes: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temp, bytes);
  try {
    await rename(temp, path);
  } catch (cause) {
    await rm(temp, { force: true });
    throw cause;
  }
}

async function writeIfAbsentOrEqual(path: string, bytes: Buffer): Promise<void> {
  if (await pathExists(path)) {
    const existing = await readFile(path);
    if (!existing.equals(bytes)) {
      throw new AunoError({ code: 'AUNO_SKILL_VERSION_EXISTS', message: `Immutable skill publication already exists with different bytes: ${path}`, category: 'config' });
    }
    return;
  }
  await writeBytesAtomic(path, bytes);
}

async function artifactFromSource(root: string): Promise<PublicationArtifact> {
  const validation = await validateSkillSource(root);
  if (!validation.valid || !validation.metadata || !validation.runtimeName) {
    throw new AunoError({ code: 'AUNO_SKILL_PUBLISH_FAILED', message: 'Skill source must pass validation before publication', category: 'config', details: { findings: validation.findings } });
  }
  const packed = await packSkill(root);
  return { packed, metadata: validation.metadata };
}

async function artifactFromFile(path: string): Promise<PublicationArtifact> {
  const bytes = await readFile(path);
  const verified = await verifySkillArtifact(bytes);
  const bundle = JSON.parse(bytes.toString('utf8')) as { files: Array<{ path: string; contentBase64: string }> };
  const metadataFile = bundle.files.find((file) => file.path === 'auno.json');
  if (!metadataFile) throw new AunoError({ code: 'AUNO_SKILL_ARTIFACT_INVALID', message: 'Artifact is missing auno.json', category: 'integrity' });
  const metadata = validateSkillMetadata(JSON.parse(Buffer.from(metadataFile.contentBase64, 'base64').toString('utf8')));
  return { packed: { path: resolve(path), fileName: basename(path), sha256: verified.sha256, bytes }, metadata };
}

async function loadPublicationArtifact(input: string): Promise<PublicationArtifact> {
  let inputStat;
  try {
    inputStat = await stat(input);
  } catch (cause) {
    throw new AunoError({ code: 'AUNO_SKILL_PUBLISH_FAILED', message: `Skill source or artifact does not exist: ${input}`, category: 'filesystem', cause });
  }
  if (inputStat.isDirectory()) return artifactFromSource(input);
  if (inputStat.isFile()) return artifactFromFile(input);
  throw new AunoError({ code: 'AUNO_SKILL_PUBLISH_FAILED', message: `Unsupported publication input: ${input}`, category: 'filesystem' });
}

export function createSkillSubmission(packed: PackedSkillResult, metadata: SkillMetadataV1, provenance: { sourceRepository?: string; sourceCommit?: string } = {}): SkillSubmissionV1 {
  const runtimeName = metadata.id.split('/').at(-1)!;
  const submission: SkillSubmissionV1 = {
    schemaVersion: 1,
    packageId: metadata.id,
    runtimeName,
    version: metadata.version,
    ...(metadata.publisher ? { publisher: metadata.publisher } : {}),
    artifact: { sha256: packed.sha256, file: packed.fileName },
    ...(provenance.sourceRepository || provenance.sourceCommit ? { provenance: { ...(provenance.sourceRepository ? { sourceRepository: provenance.sourceRepository } : {}), ...(provenance.sourceCommit ? { sourceCommit: provenance.sourceCommit } : {}) } } : {}),
    ...(metadata.capabilities ? { capabilities: metadata.capabilities } : {}),
    ...(metadata.dependencies ? { dependencies: metadata.dependencies } : {}),
  };
  return validateSkillSubmission(submission);
}

export async function publishSkill(input: string, options: PublishSkillOptions = {}): Promise<PublishSkillResult> {
  if (options.output && options.registryWorkspace) {
    throw new AunoError({ code: 'AUNO_SKILL_PUBLISH_FAILED', message: 'Use either submission output or registry workspace mode, not both', category: 'config' });
  }
  const publication = await loadPublicationArtifact(input);
  const submission = createSkillSubmission(publication.packed, publication.metadata, { sourceRepository: options.sourceRepository, sourceCommit: options.sourceCommit });
  const submissionBytes = Buffer.from(`${stableStringify(submission)}\n`, 'utf8');

  if (options.registryWorkspace) {
    const packageParts = submission.packageId.split('/');
    const publisher = submission.publisher ?? (packageParts.length === 2 ? packageParts[0] : 'local');
    const targetDir = join(resolve(options.registryWorkspace), 'submissions', publisher, submission.runtimeName, submission.version);
    const artifactPath = join(targetDir, 'artifact.aunoskill');
    const submissionPath = join(targetDir, 'submission.json');
    await writeIfAbsentOrEqual(artifactPath, publication.packed.bytes);
    await writeIfAbsentOrEqual(submissionPath, submissionBytes);
    return { submission, submissionPath, artifactPath };
  }

  const submissionPath = resolve(options.output ?? join(dirname(publication.packed.path), `${submission.runtimeName}-${submission.version}.submission.json`));
  await writeBytesAtomic(submissionPath, submissionBytes);
  return { submission, submissionPath, artifactPath: publication.packed.path };
}
