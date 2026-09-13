import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Bytes } from '../../shared/src/index.ts';
import { StaticRegistryClient } from '../src/index.ts';

async function createRegistry(): Promise<{ root: string; digest: string }> {
  const root = await mkdtemp(join(tmpdir(), 'auno-reg-'));
  const bytes = Buffer.from('bundle-bytes');
  const digest = sha256Bytes(bytes);
  await mkdir(join(root, 'blobs/sha256'), { recursive: true });
  await writeFile(join(root, 'blobs/sha256', digest), bytes);
  await writeFile(join(root, 'index.json'), JSON.stringify({ schemaVersion: 1, registry: 'auno', skills: { 'security-review': { latest: '1.0.0', versions: { '1.0.0': { manifest: `sha256:${digest}`, bundle: `sha256:${digest}`, trust: 'verified', publisher: 'auno', provenance: { repository: 'github:auno/skills', commit: 'abc123' }, metadata: { schemaVersion: 1, id: 'security-review', version: '1.0.0' } } } } } }));
  return { root, digest };
}

test('filesystem static registry lists and fetches immutable versions', async () => {
  const { root, digest } = await createRegistry();
  const registry = new StaticRegistryClient(root);
  assert.deepEqual(await registry.listSkills(), ['security-review']);
  const version = await registry.getVersion('security-review', '1.0.0');
  assert.equal(version.trust, 'verified');
  assert.equal(version.provenance?.commit, 'abc123');
  assert.equal((await registry.fetchBundle(`sha256:${digest}`)).toString(), 'bundle-bytes');
});

test('HTTP registry uses an injected fetch implementation', async () => {
  const index = { schemaVersion: 1, registry: 'community', skills: {} };
  const calls: string[] = [];
  const registry = new StaticRegistryClient('https://registry.example.test', async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify(index), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.deepEqual(await registry.listSkills(), []);
  assert.equal(calls[0], 'https://registry.example.test/index.json');
});

test('missing registry versions fail instead of falling back to another name', async () => {
  const { root } = await createRegistry();
  await assert.rejects(() => new StaticRegistryClient(root).getVersion('security-review', '9.0.0'), /AUNO_REGISTRY_VERSION_NOT_FOUND/);
});
