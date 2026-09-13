import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanProject } from '../src/index.ts';

async function project(prefix: string): Promise<string> { return mkdtemp(join(tmpdir(), prefix)); }
async function json(path: string, value: unknown): Promise<void> { await writeFile(path, JSON.stringify(value, null, 2)); }

test('detects Next.js React TypeScript and Playwright without reading secrets', async () => {
  const root = await project('auno-next-');
  await json(join(root, 'package.json'), { dependencies: { next: '15.0.0', react: '19.0.0' }, devDependencies: { typescript: '5.8.0', '@playwright/test': '1.50.0' } });
  await writeFile(join(root, 'next.config.ts'), 'export default {}');
  await writeFile(join(root, 'playwright.config.ts'), 'export default {}');
  await writeFile(join(root, '.env'), 'SUPER_SECRET=never-read');
  const result = await scanProject(root);
  assert.ok(result.technologies.nextjs >= 0.9);
  assert.ok(result.technologies.react >= 0.8);
  assert.ok(result.technologies.typescript >= 0.7);
  assert.ok(result.technologies.playwright >= 0.7);
  assert.equal(result.sensitiveFiles.includes('.env'), true);
  assert.equal(JSON.stringify(result).includes('never-read'), false);
});

test('detects a WordPress WooCommerce plugin trait from topology and bootstrap header', async () => {
  const root = await project('auno-wp-');
  await mkdir(join(root, 'wp-content/plugins/aunopress'), { recursive: true });
  await writeFile(join(root, 'wp-content/plugins/aunopress/aunopress.php'), `<?php\n/*\nPlugin Name: AunoPress\n*/\n`);
  await json(join(root, 'composer.json'), { require: { 'automattic/woocommerce': '^9.0' } });
  const result = await scanProject(root);
  assert.ok(result.technologies.wordpress >= 0.8);
  assert.ok(result.technologies.woocommerce >= 0.6);
  assert.ok(result.traits.includes('wordpress-plugin'));
  assert.ok(result.traits.includes('e-commerce'));
});

test('detects Python FastAPI and Rust CLI manifests', async () => {
  const py = await project('auno-py-');
  await writeFile(join(py, 'pyproject.toml'), '[project]\ndependencies = ["fastapi"]\n');
  const pyResult = await scanProject(py);
  assert.ok(pyResult.technologies.python >= 0.8);
  assert.ok(pyResult.technologies.fastapi >= 0.6);
  const rust = await project('auno-rust-');
  await writeFile(join(rust, 'Cargo.toml'), '[package]\nname="demo"\nversion="0.1.0"\n');
  await mkdir(join(rust, 'src'));
  await writeFile(join(rust, 'src/main.rs'), 'fn main() {}');
  const rustResult = await scanProject(rust);
  assert.ok(rustResult.technologies.rust >= 0.8);
  assert.ok(rustResult.traits.includes('cli'));
});

test('discovers pnpm workspaces and scopes child technologies', async () => {
  const root = await project('auno-mono-');
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
  await mkdir(join(root, 'apps/web'), { recursive: true });
  await json(join(root, 'apps/web/package.json'), { dependencies: { next: '15.0.0', react: '19.0.0' } });
  const result = await scanProject(root);
  assert.ok(result.workspaces.some((workspace) => workspace.path === 'apps/web'));
  assert.ok(result.workspaces.find((workspace) => workspace.path === 'apps/web')!.technologies.nextjs >= 0.7);
});
