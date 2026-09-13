import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentAddressedStore } from '../src/index.ts';

test('CAS deduplicates identical content and verifies immutable objects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-cas-'));
  const store = new ContentAddressedStore(root);
  const first = await store.put(Buffer.from('same'));
  const second = await store.put(Buffer.from('same'));
  assert.equal(first, second);
  assert.equal(await store.has(first), true);
  assert.equal((await store.get(first)).toString(), 'same');
  assert.equal(await store.verify(first), true);
});

test('CAS rejects bytes that do not match an expected digest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-cas-'));
  const store = new ContentAddressedStore(root);
  await assert.rejects(() => store.put(Buffer.from('bad'), 'sha256:deadbeef'), /AUNO_HASH_MISMATCH/);
});
