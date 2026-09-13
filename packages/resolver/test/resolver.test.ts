import test from 'node:test';
import assert from 'node:assert/strict';
import { satisfies, resolveManifest } from '../src/index.ts';
import type { ProjectManifestV1, RegistryIndexV1, LockfileV1 } from '../../schema/src/index.ts';

test('supports exact caret tilde ranges and prerelease constraints', () => {
  assert.equal(satisfies('2.4.3', '2.4.3'), true);
  assert.equal(satisfies('2.9.0', '^2.4.0'), true);
  assert.equal(satisfies('3.0.0', '^2.4.0'), false);
  assert.equal(satisfies('2.4.9', '~2.4.0'), true);
  assert.equal(satisfies('2.5.0', '~2.4.0'), false);
  assert.equal(satisfies('2.8.0', '>=2.4.0 <3'), true);
  assert.equal(satisfies('3.0.0', '>=2.4.0 <3'), false);
  assert.equal(satisfies('3.0.0-beta.2', '*'), false);
  assert.equal(satisfies('3.0.0-beta.2', '^3.0.0-beta'), true);
});

function registry(): RegistryIndexV1 {
  return { schemaVersion: 1, registry: 'auno', skills: {
    core: { latest: '1.0.0', versions: { '1.0.0': { manifest: 'sha256:m1', bundle: 'sha256:b1', trust: 'community', metadata: { schemaVersion: 1, id: 'core', version: '1.0.0' } } } },
    secure: { latest: '3.0.0', versions: {
      '2.8.0': { manifest: 'sha256:m28', bundle: 'sha256:b28', trust: 'verified', metadata: { schemaVersion: 1, id: 'secure', version: '2.8.0' } },
      '2.9.0': { manifest: 'sha256:m29', bundle: 'sha256:b29', trust: 'community', metadata: { schemaVersion: 1, id: 'secure', version: '2.9.0' } },
      '3.0.0': { manifest: 'sha256:m30', bundle: 'sha256:b30', trust: 'untrusted', metadata: { schemaVersion: 1, id: 'secure', version: '3.0.0' } },
    } },
    suite: { latest: '1.0.0', versions: { '1.0.0': { manifest: 'sha256:ms', bundle: 'sha256:bs', trust: 'verified', dependencies: { 'auno:core': '^1.0.0' }, metadata: { schemaVersion: 1, id: 'suite', version: '1.0.0' } } } },
  } };
}
function manifest(skill: string, version: string): ProjectManifestV1 { return { schemaVersion: 1, agents: [], skills: { [skill]: { version, scope: 'project' } } }; }

test('policy-aware resolution prefers verified version over newer lower-trust versions', () => {
  const result = resolveManifest(manifest('auno:secure', '>=2'), { auno: registry() }, { minimumTrust: 'verified', allowUntrusted: false });
  assert.equal(result.skills['auno:secure'].resolved, '2.8.0');
  assert.match(String(result.skills['auno:secure'].resolution?.selectedBy), /policy/);
});

test('namespace pinning never falls back to another registry', () => {
  assert.throws(() => resolveManifest(manifest('company:secure', '^2'), { auno: registry() }, {}), /AUNO_REGISTRY_NOT_FOUND/);
});

test('effective trust is lowered by a dependency graph', () => {
  const result = resolveManifest(manifest('auno:suite', '^1'), { auno: registry() }, { minimumTrust: 'community' });
  assert.equal(result.skills['auno:suite'].trust, 'verified');
  assert.equal(result.skills['auno:suite'].effectiveTrust, 'community');
  assert.equal(result.skills['auno:core'].resolved, '1.0.0');
});

test('dependency cycles fail deterministically', () => {
  const index = registry();
  index.skills.a = { latest: '1.0.0', versions: { '1.0.0': { manifest: 'sha256:a', bundle: 'sha256:a', trust: 'verified', dependencies: { 'auno:b': '^1' }, metadata: { schemaVersion: 1, id: 'a', version: '1.0.0' } } } };
  index.skills.b = { latest: '1.0.0', versions: { '1.0.0': { manifest: 'sha256:b', bundle: 'sha256:b', trust: 'verified', dependencies: { 'auno:a': '^1' }, metadata: { schemaVersion: 1, id: 'b', version: '1.0.0' } } } };
  assert.throws(() => resolveManifest(manifest('auno:a', '^1'), { auno: index }, {}), /AUNO_RESOLUTION_CYCLE/);
});

test('capability escalation is surfaced against an existing lockfile', () => {
  const index = registry();
  index.skills.secure.versions['2.8.0'].capabilities = { shell: { commands: ['npm test'] } };
  const previous: LockfileV1 = { lockfileVersion: 1, generatedBy: 'aunoskills@0.0.9', project: { manifestDigest: 'sha256:x' }, skills: { 'auno:secure': { requested: '>=2', resolved: '2.7.0', registry: 'auno', bundleIntegrity: 'sha256:old', trust: 'verified', effectiveTrust: 'verified', capabilities: {} } } };
  const result = resolveManifest(manifest('auno:secure', '2.8.0'), { auno: index }, { minimumTrust: 'verified' }, previous);
  assert.deepEqual(result.skills['auno:secure'].resolution?.permissionEscalation, ['shell.commands:npm test']);
});
