import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('release workflow isolates signing secrets behind protected release environment', async () => {
  const workflow = await readFile(resolve(root, '.github/workflows/release.yml'), 'utf8');
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /environment:\s*release/);
  assert.match(workflow, /secrets\.AUNOSKILLS_RELEASE_PRIVATE_KEY/);
  assert.match(workflow, /(vars|secrets)\.AUNOSKILLS_RELEASE_KEY_ID/);
  assert.doesNotMatch(workflow, /echo[^\n]*AUNOSKILLS_RELEASE_PRIVATE_KEY/i);

  const unsignedAt = workflow.indexOf('npm run registry:unsigned');
  const signAt = workflow.indexOf('npm run registry:sign');
  const verifyAt = workflow.indexOf('npm run registry:verify');
  const packAt = workflow.indexOf('npm pack');
  assert.ok(unsignedAt >= 0, 'release workflow must create unsigned deterministic registry metadata');
  assert.ok(signAt > unsignedAt, 'signing must happen after unsigned build');
  assert.ok(verifyAt > signAt, 'public verification must happen after signing');
  assert.ok(packAt > verifyAt, 'packaging must happen only after public verification');
});

test('normal CI never requests release private-key material', async () => {
  const workflow = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  assert.doesNotMatch(workflow, /AUNOSKILLS_RELEASE_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /AUNOSKILLS_RELEASE_KEY_ID/);
});
