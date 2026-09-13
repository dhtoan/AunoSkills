import { posix } from 'node:path';

export function validateArchiveEntryPath(input: string): string {
  const normalizedSlashes = input.replaceAll('\\', '/');
  if (normalizedSlashes.startsWith('/') || /^[A-Za-z]:\//.test(normalizedSlashes)) throw new Error(`unsafe archive path: ${input}`);
  const normalized = posix.normalize(normalizedSlashes);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) throw new Error(`unsafe archive path: ${input}`);
  if (!normalized || normalized === '.') throw new Error(`unsafe archive path: ${input}`);
  return normalized;
}

export function validateArchiveEntryPaths(inputs: string[]): string[] {
  const seen = new Map<string, string>();
  const normalized: string[] = [];
  for (const input of inputs) {
    const safe = validateArchiveEntryPath(input);
    const collisionKey = safe.normalize('NFC').toLocaleLowerCase('en-US');
    const previous = seen.get(collisionKey);
    if (previous !== undefined) throw new Error(`archive path collision: ${previous} conflicts with ${input}`);
    seen.set(collisionKey, input);
    normalized.push(safe);
  }
  return normalized;
}
