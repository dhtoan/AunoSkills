import { resolve } from 'node:path';
import { createOfficialRegistryClient, officialRegistryStatus } from '../packages/registry/src/index.ts';
import { stableStringify } from '../packages/schema/src/index.ts';

const root = resolve(process.cwd());
const base = resolve(root, process.env.AUNOSKILLS_REGISTRY_VERIFY_BASE ?? 'dist/official-registry');

try {
  const status = await officialRegistryStatus(base);
  if (!status.verified) throw new Error(`official registry mode is ${status.mode}`);
  const client = await createOfficialRegistryClient(base);
  const index = await client.loadIndex();
  let versions = 0;
  for (const skillId of Object.keys(index.skills).sort()) {
    const entry = index.skills[skillId];
    for (const versionId of Object.keys(entry.versions).sort()) {
      const version = await client.getVersion(skillId, versionId);
      await client.fetchBundle(version.bundle);
      if (client.getVerification) await client.getVerification(skillId, versionId);
      versions += 1;
    }
  }
  process.stdout.write(stableStringify({
    registry: index.registry,
    schemaVersion: index.schemaVersion,
    mode: status.mode,
    rootKeyId: status.rootKeyId,
    releaseKeyIds: status.releaseKeyIds,
    skills: Object.keys(index.skills).sort(),
    versions,
  }));
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`AUNO_REGISTRY_VERIFY_FAILED ${message}\n`);
  process.exitCode = 1;
}
