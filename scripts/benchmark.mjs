import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { scanProject } from '../packages/detector/src/index.ts';

async function fixture(size) {
  const root = await mkdtemp(join(tmpdir(), `auno-bench-${size}-`));
  await writeFile(join(root, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0', typescript: '5.8.3' } }));
  await writeFile(join(root, 'next.config.ts'), 'export default {}\n');
  await mkdir(join(root, 'src'), { recursive: true });
  for (let index = 0; index < size; index += 1) await writeFile(join(root, 'src', `file-${index}.ts`), `export const value${index} = ${index};\n`);
  return root;
}

async function measure(label, root) {
  const firstStart = performance.now();
  await scanProject(root);
  const firstMs = performance.now() - firstStart;
  const repeatStart = performance.now();
  await scanProject(root);
  const repeatMs = performance.now() - repeatStart;
  return { label, firstMs: Number(firstMs.toFixed(2)), repeatMs: Number(repeatMs.toFixed(2)) };
}

const small = await fixture(100);
const medium = await fixture(3000);
const report = [await measure('small-100', small), await measure('medium-3000', medium)];
console.log(JSON.stringify({ benchmark: 'scanner-smoke', results: report }, null, 2));
