import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const roots = ['apps', 'packages', 'scripts', 'test'];
const checked = /\.(?:ts|mjs|json|md|ya?ml)$/;
const ignored = new Set(['node_modules', '.git', '.worktrees', '.aunoskills']);
const failures = [];

async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) await walk(child);
    else if (entry.isFile() && checked.test(entry.name)) {
      const text = await readFile(child, 'utf8');
      const name = relative(process.cwd(), child).replaceAll('\\', '/');
      if (!text.endsWith('\n')) failures.push(`${name}: missing final newline`);
      if (/\r/.test(text)) failures.push(`${name}: CRLF/CR characters are not allowed`);
      const lines = text.split('\n');
      lines.forEach((line, index) => { if (/[ \t]+$/.test(line)) failures.push(`${name}:${index + 1}: trailing whitespace`); });
    }
  }
}
for (const root of roots) { try { if ((await stat(root)).isDirectory()) await walk(root); } catch {} }
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('format check passed');
