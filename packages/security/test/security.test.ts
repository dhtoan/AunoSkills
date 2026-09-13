import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePolicy,
  verifyIntegrity,
  validateArchiveEntryPath,
  detectPermissionEscalation,
  executeCapabilityCommand,
} from '../src/index.ts';

test('denies shell execution when project policy denies execution', () => {
  const decision = evaluatePolicy(
    { execution: 'deny', allowUntrusted: false, minimumTrust: 'community' },
    { trust: 'verified', capabilities: { shell: { commands: ['npm test'] } } },
  );
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(' '), /execution/i);
});

test('allows scoped filesystem reads without granting writes', () => {
  const decision = evaluatePolicy(
    { execution: 'ask', allowUntrusted: true },
    { trust: 'community', capabilities: { filesystem: { read: ['./src/**'] } } },
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.requiresApproval, false);
});

test('detects new capabilities as permission escalation', () => {
  assert.deepEqual(
    detectPermissionEscalation(
      { filesystem: { read: ['./**'] } },
      { filesystem: { read: ['./**'] }, shell: { commands: ['npm test'] } },
    ),
    ['shell.commands:npm test'],
  );
});

test('verifies sha256 integrity and rejects mismatches', () => {
  const bytes = Buffer.from('skill');
  const digest = 'sha256:9c53c074d7ac6a2728b638ac1f376c5fa9eb8f71603017c3ea638c2fd40548df';
  assert.doesNotThrow(() => verifyIntegrity(bytes, digest));
  assert.throws(() => verifyIntegrity(bytes, 'sha256:deadbeef'), /AUNO_HASH_MISMATCH/);
});

test('rejects archive traversal and absolute Unix or Windows paths', () => {
  for (const path of ['../secret', '/etc/passwd', 'C:\\Users\\secret', 'a/../../b']) {
    assert.throws(() => validateArchiveEntryPath(path), /unsafe archive path/i);
  }
  assert.equal(validateArchiveEntryPath('references/guide.md'), 'references/guide.md');
});

test('guarded command execution strips ungranted secrets', async () => {
  process.env.AUNO_TEST_SECRET = 'hidden';
  const result = await executeCapabilityCommand(
    { command: process.execPath, args: ['-e', "process.stdout.write(process.env.AUNO_TEST_SECRET ?? 'clean')"] },
    { allowedCommands: [process.execPath], allowedEnv: [] },
  );
  assert.equal(result.stdout, 'clean');
});
