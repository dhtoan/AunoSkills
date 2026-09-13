import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.ts';

test('skill init parses authoring flags without overloading top-level --version', () => {
  const args = parseArgs([
    'skill', 'init', 'demo/example-skill',
    '--skill-version', '1.2.3',
    '--publisher', 'demo',
    '--output', './skills/example-skill',
  ]);
  assert.equal(args.command, 'skill');
  assert.deepEqual(args.positionals, ['init', 'demo/example-skill']);
  assert.equal(args.skillVersion, '1.2.3');
  assert.equal(args.publisher, 'demo');
  assert.equal(args.output, './skills/example-skill');
  assert.equal(args.version, false);
});

test('bare --version remains the CLI version flag', () => {
  const args = parseArgs(['--version']);
  assert.equal(args.version, true);
  assert.equal(args.skillVersion, undefined);
});

test('skill publish parses workspace and provenance flags', () => {
  const args = parseArgs([
    'skill', 'publish', './example-skill',
    '--registry-workspace', '../registry',
    '--source-repository', 'https://github.com/example/skills',
    '--source-commit', 'abc123',
  ]);
  assert.equal(args.registryWorkspace, '../registry');
  assert.equal(args.sourceRepository, 'https://github.com/example/skills');
  assert.equal(args.sourceCommit, 'abc123');
});
