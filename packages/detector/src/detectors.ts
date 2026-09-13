import { readFile, readdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { EvidenceGraph } from '../../evidence/src/index.ts';
import { pathExists } from '../../shared/src/index.ts';

const SENSITIVE = [/^\.env(?:\.|$)/, /\.pem$/i, /\.key$/i, /^credentials/i, /^secrets/i, /^wp-config\.php$/i, /^service-account.*\.json$/i];

export interface ScanResult {
  graph: EvidenceGraph;
  traits: Set<string>;
  capabilities: Set<string>;
  sensitiveFiles: string[];
}

async function readJson(path: string): Promise<Record<string, any> | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>; } catch { return undefined; }
}

async function detectPackageJson(root: string, scope: string, result: ScanResult): Promise<void> {
  const pkgPath = join(root, 'package.json');
  if (!await pathExists(pkgPath)) return;
  const pkg = await readJson(pkgPath);
  if (!pkg) return;
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) } as Record<string, string>;
  const add = (subject: string, dependency: string, weight: number) => {
    if (dependency in deps) result.graph.add({ subject, signal: `dependency:${dependency}`, weight, source: relative(root, pkgPath) || 'package.json', scope });
  };
  add('nextjs', 'next', 0.8);
  add('react', 'react', 0.8);
  add('typescript', 'typescript', 0.75);
  add('playwright', '@playwright/test', 0.55);
  add('vite', 'vite', 0.55);
  add('astro', 'astro', 0.55);
  add('vue', 'vue', 0.55);
  add('svelte', 'svelte', 0.55);
  add('express', 'express', 0.55);
  add('nestjs', '@nestjs/core', 0.55);
  add('tailwind', 'tailwindcss', 0.55);
  add('prisma', '@prisma/client', 0.55);
  add('stripe', 'stripe', 0.55);
  if ('stripe' in deps) result.capabilities.add('uses-payments');
}

async function detectConfigs(root: string, scope: string, result: ScanResult): Promise<void> {
  const configs: Array<[string, string, number]> = [
    ['next.config.ts', 'nextjs', 0.4], ['next.config.js', 'nextjs', 0.4], ['next.config.mjs', 'nextjs', 0.4],
    ['playwright.config.ts', 'playwright', 0.35], ['playwright.config.js', 'playwright', 0.35],
    ['vite.config.ts', 'vite', 0.35], ['astro.config.mjs', 'astro', 0.35], ['tailwind.config.js', 'tailwind', 0.35],
  ];
  for (const [file, subject, weight] of configs) if (await pathExists(join(root, file))) result.graph.add({ subject, signal: `config:${file}`, weight, source: file, scope });
}

async function detectOtherManifests(root: string, scope: string, result: ScanResult): Promise<void> {
  const pyproject = join(root, 'pyproject.toml');
  if (await pathExists(pyproject)) {
    result.graph.add({ subject: 'python', signal: 'manifest:pyproject.toml', weight: 0.85, source: 'pyproject.toml', scope });
    const text = await readFile(pyproject, 'utf8');
    if (/\bfastapi\b/i.test(text)) result.graph.add({ subject: 'fastapi', signal: 'dependency:fastapi', weight: 0.75, source: 'pyproject.toml', scope });
  }
  const requirements = join(root, 'requirements.txt');
  if (await pathExists(requirements)) {
    result.graph.add({ subject: 'python', signal: 'manifest:requirements.txt', weight: 0.8, source: 'requirements.txt', scope });
    const text = await readFile(requirements, 'utf8');
    if (/^fastapi(?:[=<>~!]|$)/im.test(text)) result.graph.add({ subject: 'fastapi', signal: 'dependency:fastapi', weight: 0.75, source: 'requirements.txt', scope });
  }
  if (await pathExists(join(root, 'Cargo.toml'))) {
    result.graph.add({ subject: 'rust', signal: 'manifest:Cargo.toml', weight: 0.9, source: 'Cargo.toml', scope });
    if (await pathExists(join(root, 'src/main.rs'))) result.traits.add('cli');
  }
  if (await pathExists(join(root, 'go.mod'))) result.graph.add({ subject: 'go', signal: 'manifest:go.mod', weight: 0.9, source: 'go.mod', scope });
  const composer = join(root, 'composer.json');
  if (await pathExists(composer)) {
    result.graph.add({ subject: 'php', signal: 'manifest:composer.json', weight: 0.75, source: 'composer.json', scope });
    const pkg = await readJson(composer);
    const deps = { ...(pkg?.require ?? {}), ...(pkg?.['require-dev'] ?? {}) };
    if (Object.keys(deps).some((name) => name.toLowerCase().includes('woocommerce'))) {
      result.graph.add({ subject: 'woocommerce', signal: 'composer:woocommerce', weight: 0.7, source: 'composer.json', scope });
      result.traits.add('e-commerce');
    }
  }
}

async function detectWordPress(root: string, scope: string, result: ScanResult): Promise<void> {
  const plugins = join(root, 'wp-content/plugins');
  if (!await pathExists(plugins)) return;
  result.graph.add({ subject: 'wordpress', signal: 'topology:wp-content/plugins', weight: 0.5, source: 'wp-content/plugins', scope });
  for (const entry of await readdir(plugins, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(plugins, entry.name);
    for (const child of await readdir(dir, { withFileTypes: true })) {
      if (!child.isFile() || !child.name.endsWith('.php')) continue;
      const path = join(dir, child.name);
      const first = (await readFile(path, 'utf8')).slice(0, 8192);
      if (/Plugin Name\s*:/i.test(first)) {
        result.graph.add({ subject: 'wordpress', signal: 'plugin-header', weight: 0.4, source: relative(root, path).replaceAll('\\', '/'), scope });
        result.traits.add('wordpress-plugin');
        return;
      }
    }
  }
}

export async function scanScope(root: string, scope: string): Promise<ScanResult> {
  const result: ScanResult = { graph: new EvidenceGraph(), traits: new Set(), capabilities: new Set(), sensitiveFiles: [] };
  await detectPackageJson(root, scope, result);
  await detectConfigs(root, scope, result);
  await detectOtherManifests(root, scope, result);
  await detectWordPress(root, scope, result);
  for (const entry of await readdir(root, { withFileTypes: true })) if (entry.isFile() && SENSITIVE.some((rx) => rx.test(basename(entry.name)))) result.sensitiveFiles.push(entry.name);
  if (result.graph.score('playwright', scope) > 0) result.capabilities.add('uses-tests');
  return result;
}
