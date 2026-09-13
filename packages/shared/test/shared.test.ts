import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AunoError, ExitCode, sha256Bytes, writeJsonAtomic, readJsonFile } from '../src/index.ts';

test('serializes structured errors with stable exit codes', () => {
  const error = new AunoError({ code: 'AUNO_SIGNATURE_INVALID', message: 'Signature invalid', category: 'integrity', retryable: false });
  assert.equal(error.exitCode, ExitCode.IntegrityFailure);
  assert.deepEqual(error.toJSON(), { code: 'AUNO_SIGNATURE_INVALID', message: 'Signature invalid', category: 'integrity', severity: 'error', retryable: false });
});

test('sha256Bytes returns deterministic lowercase digest', () => {
  assert.equal(sha256Bytes(Buffer.from('aunoskills')), 'c742de9bc7c23e6441dab215e2f51b1445fbbc571ecb94a649425298a965987a');
});

test('writeJsonAtomic writes complete readable json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'auno-shared-'));
  const file = join(dir, 'state.json');
  await writeJsonAtomic(file, { z: 1, a: true });
  assert.deepEqual(await readJsonFile(file), { z: 1, a: true });
  assert.match(await readFile(file, 'utf8'), /"z": 1/);
});
