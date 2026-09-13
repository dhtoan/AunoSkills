import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RegistryClient } from '../../registry/src/index.ts';
import type { RegistryIndexV1, RegistryVersionV1 } from '../../schema/src/index.ts';
import { AunoSkillsCore } from '../src/index.ts';

const index: RegistryIndexV1 = {
  schemaVersion: 1,
  registry: 'auno',
  skills: {
    demo: {
      latest: '1.0.0',
      versions: {
        '1.0.0': { manifest: 'sha256:manifest', bundle: 'sha256:bundle', trust: 'verified' },
      },
    },
  },
};

class RevokedRegistry implements RegistryClient {
  async loadIndex(): Promise<RegistryIndexV1> { return index; }
  async listSkills(): Promise<string[]> { return ['demo']; }
  async getVersion(): Promise<RegistryVersionV1> { return index.skills.demo.versions['1.0.0']; }
  async fetchBundle(): Promise<Buffer> { return Buffer.from('unused'); }
  async getSigningKeyStatus(keyId: string) { return keyId === 'root-1' ? 'revoked' as const : 'unknown' as const; }
}

test('core audit resolves current registry signer state for locked signer proof', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-audit-registry-'));
  await writeFile(join(project, 'skills-lock.json'), JSON.stringify({
    lockfileVersion: 1,
    generatedBy: 'aunoskills@0.2.0',
    project: { manifestDigest: 'sha256:manifest' },
    skills: {
      'auno:demo': {
        requested: '1.0.0',
        resolved: '1.0.0',
        registry: 'auno',
        bundleIntegrity: 'sha256:bundle',
        trust: 'verified',
        effectiveTrust: 'verified',
        signing: {
          registryKeyId: 'root-1',
          manifestKeyId: 'root-1',
          registrySignatureDigest: 'sha256:r',
          manifestSignatureDigest: 'sha256:m',
        },
      },
    },
  }));
  const app = new AunoSkillsCore({ projectRoot: project, registries: { auno: new RevokedRegistry() }, cacheRoot: join(project, '.cache'), version: '0.2.0' });
  const report = await app.audit();
  assert.ok(report.findings.some((finding) => finding.code === 'AUNO_SIGNING_KEY_REVOKED' && finding.severity === 'critical'));
});
