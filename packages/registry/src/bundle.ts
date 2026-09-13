import type { CanonicalSkill } from '../../adapters/src/types.ts';
import { validateSkillMetadata } from '../../schema/src/index.ts';
import { validateArchiveEntryPath } from '../../security/src/index.ts';

interface EncodedSkillBundleV1 { schemaVersion: 1; metadata: unknown; files: Record<string, string> }

export function decodeSkillBundle(bytes: Uint8Array): CanonicalSkill {
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as EncodedSkillBundleV1;
  if (parsed.schemaVersion !== 1 || !parsed.files || typeof parsed.files !== 'object') throw new Error('AUNO_BUNDLE_INVALID');
  const metadata = validateSkillMetadata(parsed.metadata);
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(parsed.files)) {
    const safe = validateArchiveEntryPath(path);
    if (typeof content !== 'string') throw new Error(`AUNO_BUNDLE_INVALID_FILE ${safe}`);
    files[safe] = Buffer.from(content, 'base64');
  }
  if (!files['SKILL.md']) throw new Error('AUNO_BUNDLE_SKILL_MISSING');
  return { id: metadata.id, files, metadata };
}

export function encodeSkillBundle(skill: CanonicalSkill): Buffer {
  const files: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(skill.files).sort(([a], [b]) => a.localeCompare(b))) files[path] = Buffer.from(bytes).toString('base64');
  return Buffer.from(JSON.stringify({ schemaVersion: 1, metadata: skill.metadata, files }));
}
