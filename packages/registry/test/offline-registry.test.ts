import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSignedStaticRegistry, VerifiedRegistryClient } from '../src/index.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'auno-offline-reg-'));
  const source = join(root, 'skills');
  const output = join(root, 'registry');
  const cache = join(root, 'cache');
  const skill = join(source, 'demo');
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: Offline signed skill.\n---\n# Offline\n');
  await writeFile(join(skill, 'auno.json'), JSON.stringify({ schemaVersion: 1, id: 'demo', version: '1.0.0', publisher: 'auno' }));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const anchor = {
    keyId: 'root-1',
    algorithm: 'ed25519' as const,
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
  await buildSignedStaticRegistry({ sourceDir: source, outputDir: output, registry: 'auno', repository: 'github:dhtoan/AunoSkills', commit: 'abc', signing: { key: anchor, privateKey } });
  return { root, output, cache, anchor };
}

test('verified registry reuses only previously verified metadata while offline', async () => {
  const item = await fixture();
  const online = new VerifiedRegistryClient(item.output, [item.anchor], { cacheDir: item.cache });
  assert.equal((await online.getVersion('demo', '1.0.0')).metadata?.id, 'demo');
  await rm(item.output, { recursive: true, force: true });
  const offline = new VerifiedRegistryClient(item.output, [item.anchor], { cacheDir: item.cache, offline: true });
  assert.equal((await offline.getVersion('demo', '1.0.0')).metadata?.id, 'demo');
});

test('offline verified registry fails clearly when trusted metadata cache is missing', async () => {
  const item = await fixture();
  const missingCache = join(item.root, 'missing-cache');
  const offline = new VerifiedRegistryClient(item.output, [item.anchor], { cacheDir: missingCache, offline: true });
  await assert.rejects(() => offline.loadIndex(), /AUNO_OFFLINE_REGISTRY_METADATA_MISSING/);
});
