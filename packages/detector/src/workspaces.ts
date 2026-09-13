import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathExists } from '../../shared/src/index.ts';

export async function discoverWorkspaces(root: string): Promise<string[]> {
  const found = new Set<string>();
  const pnpm = join(root, 'pnpm-workspace.yaml');
  if (await pathExists(pnpm)) {
    const text = await readFile(pnpm, 'utf8');
    const patterns = [...text.matchAll(/^\s*-\s+([^#\s]+)\s*$/gm)].map((match) => match[1].replace(/^['"]|['"]$/g, ''));
    for (const pattern of patterns) {
      if (pattern.endsWith('/*')) {
        const parent = join(root, pattern.slice(0, -2));
        if (await pathExists(parent)) {
          for (const entry of await readdir(parent, { withFileTypes: true })) if (entry.isDirectory()) found.add(relative(root, join(parent, entry.name)).replaceAll('\\', '/'));
        }
      } else if (!pattern.includes('*') && await pathExists(join(root, pattern))) found.add(pattern.replaceAll('\\', '/'));
    }
  }

  const packageJson = join(root, 'package.json');
  if (await pathExists(packageJson)) {
    try {
      const pkg = JSON.parse(await readFile(packageJson, 'utf8')) as { workspaces?: string[] | { packages?: string[] } };
      const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages ?? [];
      for (const pattern of patterns) {
        if (pattern.endsWith('/*')) {
          const parent = join(root, pattern.slice(0, -2));
          if (await pathExists(parent)) for (const entry of await readdir(parent, { withFileTypes: true })) if (entry.isDirectory()) found.add(relative(root, join(parent, entry.name)).replaceAll('\\', '/'));
        } else if (!pattern.includes('*') && await pathExists(join(root, pattern))) found.add(pattern.replaceAll('\\', '/'));
      }
    } catch {}
  }
  return [...found].sort();
}
