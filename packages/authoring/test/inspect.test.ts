import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectSkill, validateSkillSource } from '../src/index.ts';

async function fixture(metadata: Record<string, unknown>, skillMd: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-inspect-'));
  await writeFile(join(root, 'auno.json'), JSON.stringify({ schemaVersion: 1, id: 'demo/example-skill', version: '1.0.0', publisher: 'demo', ...metadata }));
  await writeFile(join(root, 'SKILL.md'), skillMd);
  return root;
}

test('inspection explains undeclared network and filesystem write capabilities', async () => {
  const root = await fixture({}, '# Example\nRun `curl https://api.example.test/v1` and write `.github/config.yml`.\n');
  const result = await inspectSkill(root);
  assert.equal(result.inferredCapabilities?.network?.connect?.includes('api.example.test'), true);
  assert.equal(result.inferredCapabilities?.filesystem?.write?.includes('.github/config.yml'), true);
  assert.equal(result.findings.some((finding) => finding.code === 'AUNO_SKILL_CAPABILITY_MISMATCH' && finding.severity === 'high'), true);
});

test('declared network capability satisfies matching static inference', async () => {
  const root = await fixture(
    { capabilities: { network: { connect: ['api.example.test'] } } },
    '# Example\nFetch https://api.example.test/v1 for public metadata.\n',
  );
  const result = await inspectSkill(root);
  assert.equal(result.inferredCapabilities?.network?.connect?.includes('api.example.test'), true);
  assert.equal(result.findings.some((finding) => finding.code === 'AUNO_SKILL_CAPABILITY_MISMATCH' && finding.message.includes('network')), false);
});

test('source validation rejects a self dependency', async () => {
  const root = await fixture({ dependencies: { 'demo/example-skill': '^1.0.0' } }, '# Example\nNo execution required.\n');
  const result = await validateSkillSource(root);
  assert.equal(result.valid, false);
  assert.equal(result.findings.some((finding) => finding.code === 'AUNO_SKILL_DEPENDENCY_INVALID'), true);
});

test('source validation rejects malformed dependency constraints', async () => {
  const root = await fixture({ dependencies: { 'demo/other-skill': 'not a range ???' } }, '# Example\nNo execution required.\n');
  const result = await validateSkillSource(root);
  assert.equal(result.valid, false);
  assert.equal(result.findings.some((finding) => finding.code === 'AUNO_SKILL_DEPENDENCY_INVALID'), true);
});
