import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RegistryIndexV2, RegistryTrustDocumentV1, SigningKeyV1, SkillMetadataV1 } from '../../schema/src/index.ts';
import { stableStringify } from '../../schema/src/index.ts';
import { canonicalSignedPayload, signEd25519 } from '../../security/src/index.ts';
import { sha256Bytes } from '../../shared/src/index.ts';
import { VerifiedRegistryClient } from '../src/index.ts';

interface SignedFixture {
  root: string;
  anchor: SigningKeyV1;
  bundleDigest: string;
  manifestDigest: string;
}

async function signedFixture(): Promise<SignedFixture> {
  const root = await mkdtemp(join(tmpdir(), 'auno-v2-reg-'));
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const anchor: SigningKeyV1 = {
    keyId: 'root-1',
    algorithm: 'ed25519',
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
  const trustUnsigned = { schemaVersion: 1 as const, registry: 'auno', keys: [anchor] };
  const trust: RegistryTrustDocumentV1 = {
    ...trustUnsigned,
    signature: signEd25519(canonicalSignedPayload(trustUnsigned), anchor.keyId, privateKey),
  };
  const trustBytes = Buffer.from(stableStringify(trust));
  await writeFile(join(root, 'trust.json'), trustBytes);

  const metadata: SkillMetadataV1 = { schemaVersion: 1, id: 'security-review', version: '1.0.0', publisher: 'auno' };
  const manifestBytes = Buffer.from(stableStringify(metadata));
  const manifestDigest = sha256Bytes(manifestBytes);
  const bundleBytes = Buffer.from('signed-bundle');
  const bundleDigest = sha256Bytes(bundleBytes);
  await mkdir(join(root, 'manifests', 'sha256'), { recursive: true });
  await mkdir(join(root, 'blobs', 'sha256'), { recursive: true });
  await writeFile(join(root, 'manifests', 'sha256', manifestDigest), manifestBytes);
  await writeFile(join(root, 'blobs', 'sha256', bundleDigest), bundleBytes);

  const indexUnsigned: Omit<RegistryIndexV2, 'signature'> = {
    schemaVersion: 2,
    registry: 'auno',
    trustDigest: `sha256:${sha256Bytes(trustBytes)}`,
    skills: {
      'security-review': {
        latest: '1.0.0',
        versions: {
          '1.0.0': {
            manifest: `sha256:${manifestDigest}`,
            manifestSignature: signEd25519(manifestBytes, anchor.keyId, privateKey),
            bundle: `sha256:${bundleDigest}`,
            trust: 'verified',
            publisher: 'auno',
          },
        },
      },
    },
  };
  const index: RegistryIndexV2 = {
    ...indexUnsigned,
    signature: signEd25519(canonicalSignedPayload(indexUnsigned), anchor.keyId, privateKey),
  };
  await writeFile(join(root, 'index.json'), stableStringify(index));
  return { root, anchor, bundleDigest, manifestDigest };
}

test('verified registry validates trust index manifest and bundle before returning data', async () => {
  const fixture = await signedFixture();
  const registry = new VerifiedRegistryClient(fixture.root, [fixture.anchor]);
  assert.deepEqual(await registry.listSkills(), ['security-review']);
  const version = await registry.getVersion('security-review', '1.0.0');
  assert.equal(version.metadata?.id, 'security-review');
  assert.equal(version.trust, 'verified');
  assert.equal((await registry.fetchBundle(`sha256:${fixture.bundleDigest}`)).toString(), 'signed-bundle');
  const verification = await registry.getVerification('security-review', '1.0.0');
  assert.equal(verification.registryKeyId, 'root-1');
  assert.equal(verification.manifestKeyId, 'root-1');
});

test('tampered signed registry index is rejected', async () => {
  const fixture = await signedFixture();
  const path = join(fixture.root, 'index.json');
  const index = JSON.parse(await readFile(path, 'utf8')) as RegistryIndexV2;
  index.registry = 'evil';
  await writeFile(path, stableStringify(index));
  await assert.rejects(() => new VerifiedRegistryClient(fixture.root, [fixture.anchor]).loadIndex(), /AUNO_SIGNATURE_INVALID/);
});

test('tampered manifest is rejected before metadata is returned', async () => {
  const fixture = await signedFixture();
  await writeFile(join(fixture.root, 'manifests', 'sha256', fixture.manifestDigest), '{"schemaVersion":1,"id":"evil","version":"1.0.0"}\n');
  await assert.rejects(() => new VerifiedRegistryClient(fixture.root, [fixture.anchor]).getVersion('security-review', '1.0.0'), /AUNO_HASH_MISMATCH/);
});

test('tampered bundle is rejected by verified registry fetch', async () => {
  const fixture = await signedFixture();
  await writeFile(join(fixture.root, 'blobs', 'sha256', fixture.bundleDigest), 'tampered');
  await assert.rejects(() => new VerifiedRegistryClient(fixture.root, [fixture.anchor]).fetchBundle(`sha256:${fixture.bundleDigest}`), /AUNO_HASH_MISMATCH/);
});
