export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export function parseVersion(input: string): SemVer {
  const match = input.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) throw new Error(`Invalid version: ${input}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

export function compareVersions(aInput: string, bInput: string): number {
  const a = parseVersion(aInput);
  const b = parseVersion(bInput);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;
    const ln = /^\d+$/.test(left) ? Number(left) : undefined;
    const rn = /^\d+$/.test(right) ? Number(right) : undefined;
    if (ln !== undefined && rn !== undefined) return ln > rn ? 1 : -1;
    if (ln !== undefined) return -1;
    if (rn !== undefined) return 1;
    return left > right ? 1 : -1;
  }
  return 0;
}

function cmp(version: string, operator: string, target: string): boolean {
  const value = compareVersions(version, target);
  if (operator === '>=') return value >= 0;
  if (operator === '<=') return value <= 0;
  if (operator === '>') return value > 0;
  if (operator === '<') return value < 0;
  return value === 0;
}

function caretBounds(base: SemVer): [string, string] {
  const low = `${base.major}.${base.minor}.${base.patch}${base.prerelease.length ? `-${base.prerelease.join('.')}` : ''}`;
  if (base.major > 0) return [low, `${base.major + 1}.0.0`];
  if (base.minor > 0) return [low, `0.${base.minor + 1}.0`];
  return [low, `0.0.${base.patch + 1}`];
}

export function satisfies(version: string, constraint: string): boolean {
  const trimmed = constraint.trim();
  const parsedVersion = parseVersion(version);
  const mentionsPrerelease = trimmed.includes('-');
  if (parsedVersion.prerelease.length && !mentionsPrerelease) return false;
  if (trimmed === '*' || trimmed === 'latest' || trimmed === 'recommended') return !parsedVersion.prerelease.length;
  if (trimmed.startsWith('^')) {
    const base = parseVersion(trimmed.slice(1));
    const [low, high] = caretBounds(base);
    return cmp(version, '>=', low) && cmp(version, '<', high);
  }
  if (trimmed.startsWith('~')) {
    const base = parseVersion(trimmed.slice(1));
    const low = `${base.major}.${base.minor}.${base.patch}${base.prerelease.length ? `-${base.prerelease.join('.')}` : ''}`;
    const high = `${base.major}.${base.minor + 1}.0`;
    return cmp(version, '>=', low) && cmp(version, '<', high);
  }
  if (/^(>=|<=|>|<)/.test(trimmed) || trimmed.includes(' ')) {
    return trimmed.split(/\s+/).filter(Boolean).every((part) => {
      const match = part.match(/^(>=|<=|>|<|=)?(.+)$/)!;
      return cmp(version, match[1] ?? '=', match[2]);
    });
  }
  return compareVersions(version, trimmed) === 0;
}
