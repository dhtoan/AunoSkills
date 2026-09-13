import type { SkillBundleV1 } from './types.ts';
import { validateSkillBundleManifest } from './validate.ts';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`AUNO_SKILL_ARTIFACT_INVALID: ${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertOnly(obj: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) throw new TypeError(`AUNO_SKILL_ARTIFACT_INVALID: Unknown ${label} field: ${key}`);
  }
}

function normalizedRelativePath(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new TypeError('AUNO_SKILL_ARTIFACT_INVALID: file path is required');
  if (value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.startsWith('//')) {
    throw new TypeError(`AUNO_SKILL_ARTIFACT_INVALID: unsafe file path: ${value}`);
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new TypeError(`AUNO_SKILL_ARTIFACT_INVALID: unsafe file path: ${value}`);
  }
  return value;
}

function canonicalBase64(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new TypeError('AUNO_SKILL_ARTIFACT_INVALID: file contentBase64 must be canonical base64');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) throw new TypeError('AUNO_SKILL_ARTIFACT_INVALID: file contentBase64 must be canonical base64');
  return value;
}

export function validateSkillBundle(value: unknown): SkillBundleV1 {
  const obj = record(value, 'skill bundle');
  assertOnly(obj, new Set(['schemaVersion', 'manifest', 'files']), 'skill bundle');
  if (obj.schemaVersion !== 1) throw new TypeError('AUNO_SKILL_ARTIFACT_INVALID: unsupported schemaVersion');

  const manifest = validateSkillBundleManifest(obj.manifest);
  if (!Array.isArray(obj.files)) throw new TypeError('AUNO_SKILL_ARTIFACT_INVALID: files are required');

  const seen = new Set<string>();
  const seenFolded = new Set<string>();
  const files = obj.files.map((value) => {
    const file = record(value, 'bundle file');
    assertOnly(file, new Set(['path', 'sha256', 'size', 'contentBase64']), 'bundle file');
    const path = normalizedRelativePath(file.path);
    const folded = path.toLowerCase();
    if (seen.has(path) || seenFolded.has(folded)) throw new TypeError(`AUNO_SKILL_ARTIFACT_INVALID: duplicate or case-colliding file path: ${path}`);
    seen.add(path);
    seenFolded.add(folded);
    if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new TypeError(`AUNO_SKILL_ARTIFACT_INVALID: invalid file sha256: ${path}`);
    if (!Number.isSafeInteger(file.size) || Number(file.size) < 0) throw new TypeError(`AUNO_SKILL_ARTIFACT_INVALID: invalid file size: ${path}`);
    return {
      path,
      sha256: file.sha256,
      size: Number(file.size),
      contentBase64: canonicalBase64(file.contentBase64),
    };
  });

  const manifestPaths = manifest.files.map((file) => normalizedRelativePath(file.path));
  if (manifestPaths.length !== files.length) throw new TypeError('AUNO_SKILL_ARTIFACT_INVALID: manifest/file inventory length mismatch');
  for (let i = 0; i < files.length; i += 1) {
    const manifestFile = manifest.files[i];
    const bundleFile = files[i];
    if (manifestFile.path !== bundleFile.path || manifestFile.sha256 !== bundleFile.sha256 || manifestFile.size !== bundleFile.size) {
      throw new TypeError(`AUNO_SKILL_ARTIFACT_INVALID: manifest/file inventory mismatch at ${bundleFile.path}`);
    }
  }

  return { schemaVersion: 1, manifest, files };
}
