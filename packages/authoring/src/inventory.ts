import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { validateArchiveEntryPaths } from '../../security/src/index.ts';
import { AunoError, sha256Bytes } from '../../shared/src/index.ts';
import type { SkillSourceFile } from './types.ts';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.tmp', 'tmp', 'dist-skills']);
const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db']);
const SECRET_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /^credentials.*\.json$/i,
  /^service-account.*\.json$/i,
];

function posixRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function isSecretPath(path: string): boolean {
  const name = path.split('/').at(-1) ?? path;
  return SECRET_PATTERNS.some((pattern) => pattern.test(name));
}

function matchesSegment(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*');
  return new RegExp(`^${escaped}$`).test(value);
}

function ignoredByPattern(path: string, patterns: string[]): boolean {
  return patterns.some((raw) => {
    const pattern = raw.trim().replaceAll('\\', '/').replace(/^\.\//, '');
    if (!pattern || pattern.startsWith('#') || pattern.startsWith('!')) return false;
    if (pattern.endsWith('/')) return path === pattern.slice(0, -1) || path.startsWith(pattern);
    if (!pattern.includes('/')) return path.split('/').some((segment) => matchesSegment(pattern, segment));
    return matchesSegment(pattern, path);
  });
}

async function readIgnorePatterns(root: string): Promise<string[]> {
  try {
    const content = await readFile(join(root, '.aunoignore'), 'utf8');
    return content.split(/\r?\n/);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];
    throw error;
  }
}

export async function collectSkillInventory(root: string): Promise<SkillSourceFile[]> {
  const patterns = await readIgnorePatterns(root);
  const paths: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      const path = posixRelative(root, absolute);
      if (!path) continue;
      if (path === '.aunoskills/state' || path.startsWith('.aunoskills/state/')) continue;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || ignoredByPattern(`${path}/`, patterns)) continue;
        await walk(absolute);
        continue;
      }
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) {
        throw new AunoError({ code: 'AUNO_SKILL_PATH_UNSAFE', message: `Symlinks are not publishable skill files: ${path}`, category: 'security' });
      }
      if (!stat.isFile() || IGNORED_FILES.has(entry.name)) continue;
      if (isSecretPath(path)) {
        throw new AunoError({ code: 'AUNO_SKILL_SECRET_BLOCKED', message: `Credential-like file is blocked from skill publication: ${path}`, category: 'security' });
      }
      if (ignoredByPattern(path, patterns)) continue;
      paths.push(path);
    }
  }

  await walk(root);
  let normalized: string[];
  try {
    normalized = validateArchiveEntryPaths(paths);
  } catch (cause) {
    throw new AunoError({ code: 'AUNO_SKILL_PATH_UNSAFE', message: cause instanceof Error ? cause.message : String(cause), category: 'security', cause });
  }
  normalized.sort((a, b) => a.localeCompare(b, 'en'));
  const files: SkillSourceFile[] = [];
  for (const path of normalized) {
    const bytes = await readFile(join(root, ...path.split('/')));
    files.push({ path, bytes, sha256: sha256Bytes(bytes), size: bytes.byteLength });
  }
  return files;
}
