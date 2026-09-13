import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RegistryTrustDocumentV1, SigningKeyV1 } from '../../schema/src/index.ts';
import { canonicalSignedPayload, signEd25519 } from '../../security/src/index.ts';
import {
  buildDelegatedSignedRegistry,
  createOfficialRegistryClient,
  officialRegistryStatus,
  StaticRegistryClient,
  VerifiedRegistryClient,
} from '../src/index.ts';

function descriptor(keyId: string, publicKey: ReturnType<typeof generateKeyPairSync>['publicKey']): SigningKeyV1 {
  return { keyId, algorithm: 'ed25519', publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
}

function rootSignedTrust(rootPrivateKey: ReturnType<typeof generateKeyPairSync>['privateKey'], root: SigningKeyV1, release: SigningKeyV1): RegistryTrustDocumentV1 {
  const unsigned = { schemaVersion: 1 as const, registry: 'auno', keys: [root, release] };
  return { ...unsigned, signature: signEd25519(canonicalSignedPayload(unsigned), root.keyId, rootPrivateKey) };
}

async function activeOfficialRegistry() {
  const work = await mkdtemp(join(tmpdir(), 'auno-official-v2-'));
  const sourceDir = join(work, 'skills');
  const registryDir = join(work, 'registry');
  const skillDir = join(sourceDir, 'demo');
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), '---\nname: demo\ndescription: Official registry fixture.\n---\n# Demo\n');
  await writeFile(join(skillDir, 'auno.json'), JSON.stringify({ schemaVersion: 1, id: 'demo', version: '3.0.0', publisher: 'auno', license: 'Apache-2.0' }));

  const rootPair = generateKeyPairSync('ed25519');
  const releasePair = generateKeyPairSync('ed25519');
  const root = descriptor('auno-root-test', rootPair.publicKey);
  const release = descriptor('auno-release-test', releasePair.publicKey);
  const trust = rootSignedTrust(rootPair.privateKey, root, release);
  await buildDelegatedSignedRegistry({
    sourceDir,
    outputDir: registryDir,
    registry: 'auno',
    repository: 'github:dhtoan/AunoSkills',
    commit: 'fixture',
    rootAnchor: root,
    trust,
    releaseKeyId: release.keyId,
    releasePrivateKey: releasePair.privateKey,
  });
  await writeFile(join(registryDir, 'root.json'), JSON.stringify(root));
  return { registryDir, root, release };
}

test('legacy official registry reports awaiting production trust instead of verified status', async () => {
  const work = await mkdtemp(join(tmpdir(), 'auno-official-v1-'));
  await writeFile(join(work, 'index.json'), JSON.stringify({ schemaVersion: 1, registry: 'auno', skills: {} }));

  const status = await officialRegistryStatus(work);
  const client = await createOfficialRegistryClient(work);

  assert.equal(status.mode, 'legacy-awaiting-production-trust');
  assert.equal(status.verified, false);
  assert.equal(client instanceof StaticRegistryClient, true);
});

test('official v2 registry pins root.json and creates a verified client', async () => {
  const { registryDir, root, release } = await activeOfficialRegistry();

  const status = await officialRegistryStatus(registryDir);
  const client = await createOfficialRegistryClient(registryDir);

  assert.equal(status.mode, 'verified-v2');
  assert.equal(status.verified, true);
  assert.equal(status.rootKeyId, root.keyId);
  assert.deepEqual(status.releaseKeyIds, [release.keyId]);
  assert.equal(client instanceof VerifiedRegistryClient, true);
  assert.equal((await client.getVersion('demo', '3.0.0')).metadata?.id, 'demo');
});

test('official client does not accept a caller-supplied replacement trust anchor', async () => {
  const { registryDir } = await activeOfficialRegistry();
  const attacker = generateKeyPairSync('ed25519');
  const replacement = descriptor('attacker-root', attacker.publicKey);

  await assert.rejects(
    () => createOfficialRegistryClient(registryDir, { anchors: [replacement] } as never),
    /AUNO_OFFICIAL_TRUST_INVALID|anchors/,
  );
});
