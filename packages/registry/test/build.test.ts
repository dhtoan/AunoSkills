import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSignedStaticRegistry, buildStaticRegistry, decodeSkillBundle, StaticRegistryClient, VerifiedRegistryClient } from '../src/index.ts';

test('buildStaticRegistry creates immutable verified bundles from skill directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-build-reg-'));
  const source = join(root, 'skills');
  const output = join(root, 'registry');
  const skill = join(source, 'demo');
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: Demo skill for registry builder tests.\n---\n# Demo\n');
  await writeFile(join(skill, 'auno.json'), JSON.stringify({ schemaVersion: 1, id: 'demo', version: '1.2.3', publisher: 'auno', license: 'Apache-2.0' }));
  const index = await buildStaticRegistry({ sourceDir: source, outputDir: output, registry: 'auno', repository: 'github:dhtoan/AunoSkills', commit: 'abc123' });
  const version = index.skills.demo.versions['1.2.3'];
  assert.match(version.bundle, /^sha256:[0-9a-f]{64}$/);
  assert.match(version.manifest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(version.trust, 'verified');
  assert.equal(version.provenance?.commit, 'abc123');
  const client = new StaticRegistryClient(output);
  const decoded = decodeSkillBundle(await client.fetchBundle(version.bundle));
  assert.equal(decoded.id, 'demo');
  assert.equal(Buffer.from(decoded.files['SKILL.md']).toString('utf8').includes('# Demo'), true);
  assert.equal(JSON.parse(await readFile(join(output, 'index.json'), 'utf8')).skills.demo.latest, '1.2.3');
});

test('buildSignedStaticRegistry emits signed trust index manifests and immutable bundle without persisting private key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-build-signed-reg-'));
  const source = join(root, 'skills');
  const output = join(root, 'registry');
  const skill = join(source, 'demo');
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: Signed registry skill.\n---\n# Signed Demo\n');
  await writeFile(join(skill, 'auno.json'), JSON.stringify({ schemaVersion: 1, id: 'demo', version: '2.0.0', publisher: 'auno', license: 'Apache-2.0' }));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const anchor = {
    keyId: 'release-root-1',
    algorithm: 'ed25519' as const,
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
  const index = await buildSignedStaticRegistry({
    sourceDir: source,
    outputDir: output,
    registry: 'auno',
    repository: 'github:dhtoan/AunoSkills',
    commit: 'def456',
    signing: { key: anchor, privateKey },
  });
  assert.equal(index.schemaVersion, 2);
  assert.equal(index.signature.keyId, anchor.keyId);
  assert.match(index.trustDigest, /^sha256:[0-9a-f]{64}$/);
  const version = index.skills.demo.versions['2.0.0'];
  assert.equal(version.manifestSignature.keyId, anchor.keyId);
  assert.match(version.manifest, /^sha256:[0-9a-f]{64}$/);
  assert.equal((await readFile(join(output, 'trust.json'), 'utf8')).includes('PRIVATE KEY'), false);
  const client = new VerifiedRegistryClient(output, [anchor]);
  const verified = await client.getVersion('demo', '2.0.0');
  assert.equal(verified.metadata?.id, 'demo');
  assert.equal((await client.fetchBundle(version.bundle)).length > 0, true);
});
