import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateArchiveEntryPaths, evaluatePolicy, verifyIntegrity } from '../../packages/security/src/index.ts';
import { ContentAddressedStore } from '../../packages/store/src/index.ts';
import { acquireProjectWriteLock } from '../../packages/core/src/locks.ts';

test('archive validation rejects traversal, normalized duplicates, and case-collisions', () => {
  assert.throws(() => validateArchiveEntryPaths(['../escape', 'SKILL.md']), /unsafe archive path/i);
  assert.throws(() => validateArchiveEntryPaths(['docs/../SKILL.md', 'SKILL.md']), /archive path collision/i);
  assert.throws(() => validateArchiveEntryPaths(['References/Guide.md', 'references/guide.md']), /archive path collision/i);
});

test('integrity failure cannot be treated as a valid artifact', () => {
  assert.throws(() => verifyIntegrity(Buffer.from('tampered'), `sha256:${'0'.repeat(64)}`), /AUNO_HASH_MISMATCH/);
});

test('untrusted skill cannot gain shell execution under deny policy', () => {
  const decision = evaluatePolicy({ minimumTrust: 'community', allowUntrusted: false, execution: 'deny' }, { trust: 'untrusted', capabilities: { shell: { commands: ['*'] } } });
  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.length >= 1);
});

test('concurrent writes of the same CAS object converge on one immutable blob', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-cas-concurrent-'));
  const store = new ContentAddressedStore(root);
  const bytes = Buffer.from('same-concurrent-object');
  const hashes = await Promise.all(Array.from({ length: 24 }, () => store.put(bytes)));
  assert.equal(new Set(hashes).size, 1);
  assert.equal(await store.verify(hashes[0]), true);
});

test('stale project write lock owned by a dead local pid is recovered', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-stale-lock-'));
  const state = join(project, '.aunoskills/state');
  await mkdir(state, { recursive: true });
  await writeFile(join(state, 'project.lock'), JSON.stringify({ pid: 2147483647, host: hostname(), operation: 'install', startedAt: new Date(0).toISOString() }));
  const release = await acquireProjectWriteLock(project, 'update');
  await release();
});
