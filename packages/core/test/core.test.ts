import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Bytes } from '../../shared/src/index.ts';
import { StaticRegistryClient } from '../../registry/src/index.ts';
import { AunoSkillsCore } from '../src/index.ts';

interface SkillDef { id: string; version: string; trust?: 'verified' | 'community' | 'untrusted'; text: string; capabilities?: Record<string, unknown>; dependencies?: Record<string, string>; recommendation?: Record<string, unknown> }

async function makeRegistry(skills: SkillDef[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-core-reg-'));
  await mkdir(join(root, 'blobs/sha256'), { recursive: true });
  const index: any = { schemaVersion: 1, registry: 'auno', skills: {} };
  for (const skill of skills) {
    const metadata = { schemaVersion: 1, id: skill.id, version: skill.version, description: `${skill.id} description`, capabilities: skill.capabilities, recommendation: skill.recommendation };
    const bundle = Buffer.from(JSON.stringify({ schemaVersion: 1, metadata, files: { 'SKILL.md': Buffer.from(skill.text).toString('base64') } }));
    const digest = sha256Bytes(bundle);
    await writeFile(join(root, 'blobs/sha256', digest), bundle);
    index.skills[skill.id] ??= { latest: skill.version, versions: {} };
    index.skills[skill.id].latest = skill.version;
    index.skills[skill.id].versions[skill.version] = { manifest: `sha256:${digest}`, bundle: `sha256:${digest}`, trust: skill.trust ?? 'verified', publisher: 'auno', capabilities: skill.capabilities, dependencies: skill.dependencies, metadata };
  }
  await writeFile(join(root, 'index.json'), JSON.stringify(index));
  return root;
}
async function makeProject(manifest: unknown): Promise<string> { const root = await mkdtemp(join(tmpdir(), 'auno-core-project-')); await writeFile(join(root, 'aunoskills.json'), JSON.stringify(manifest, null, 2)); return root; }

function core(project: string, registryRoot: string): AunoSkillsCore { return new AunoSkillsCore({ projectRoot: project, registries: { auno: new StaticRegistryClient(registryRoot) }, cacheRoot: join(project, '.cache') }); }

test('install resolves verifies caches materializes and writes deterministic lockfile', async () => {
  const registryRoot = await makeRegistry([{ id: 'demo', version: '1.0.0', text: '# Demo v1\n' }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex', 'claude-code'], skills: { 'auno:demo': '^1.0.0' }, policy: { minimumTrust: 'verified', allowUntrusted: false } });
  const result = await core(project, registryRoot).install();
  assert.equal(result.lock.skills['auno:demo'].resolved, '1.0.0');
  assert.equal(await readFile(join(project, '.agents/skills/demo/SKILL.md'), 'utf8'), '# Demo v1\n');
  assert.equal(await readFile(join(project, '.claude/skills/demo/SKILL.md'), 'utf8'), '# Demo v1\n');
  assert.equal(await readFile(join(project, 'skills-lock.json'), 'utf8'), result.lockText);
});

test('frozen install rejects a changed manifest', async () => {
  const registryRoot = await makeRegistry([{ id: 'demo', version: '1.0.0', text: '# Demo\n' }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } });
  const app = core(project, registryRoot); await app.install(); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: {} }));
  await assert.rejects(() => app.install({ frozenLockfile: true }), /AUNO_LOCKFILE_STALE/);
});

test('offline restore reconstructs exact locked materializations from CAS', async () => {
  const registryRoot = await makeRegistry([{ id: 'demo', version: '1.0.0', text: '# Offline\n' }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } });
  const app = core(project, registryRoot); await app.install(); await rm(join(project, '.agents'), { recursive: true, force: true }); await app.restore({ offline: true });
  assert.equal(await readFile(join(project, '.agents/skills/demo/SKILL.md'), 'utf8'), '# Offline\n');
});

test('update blocks capability escalation unless explicitly approved', async () => {
  const registryRoot = await makeRegistry([{ id: 'demo', version: '1.0.0', text: '# v1\n' }, { id: 'demo', version: '1.1.0', text: '# v1.1\n', capabilities: { shell: { commands: ['npm test'] } } }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' }, policy: { minimumTrust: 'verified', execution: 'ask', permissionEscalation: 'require-review' } });
  const app = core(project, registryRoot); await app.install();
  await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '^1.0.0' }, policy: { minimumTrust: 'verified', execution: 'ask', permissionEscalation: 'require-review' } }));
  await assert.rejects(() => app.update(), /AUNO_CAPABILITY_ESCALATION/);
  assert.equal((await app.update({ approveCapabilities: true })).lock.skills['auno:demo'].resolved, '1.1.0');
});

test('remove refuses a skill that is still required by another installed skill', async () => {
  const registryRoot = await makeRegistry([{ id: 'core', version: '1.0.0', text: '# Core\n' }, { id: 'suite', version: '1.0.0', text: '# Suite\n', dependencies: { 'auno:core': '^1' } }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:suite': '1.0.0', 'auno:core': '1.0.0' } });
  const app = core(project, registryRoot); await app.install(); await assert.rejects(() => app.remove('auno:core'), /AUNO_DEPENDENCY_IN_USE/);
});

test('doctor reports and repairs missing materialization', async () => {
  const registryRoot = await makeRegistry([{ id: 'demo', version: '1.0.0', text: '# Repair\n' }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } });
  const app = core(project, registryRoot); await app.install(); await rm(join(project, '.agents/skills/demo'), { recursive: true, force: true });
  assert.ok((await app.doctor()).issues.some((issue) => issue.code === 'AUNO_MATERIALIZATION_DRIFT'));
  assert.equal((await app.doctor({ fix: true })).issues.length, 0);
});

test('audit surfaces untrusted skills and can fail at a severity threshold', async () => {
  const registryRoot = await makeRegistry([{ id: 'demo', version: '1.0.0', text: '# Risk\n', trust: 'untrusted' }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' }, policy: { allowUntrusted: true } });
  const app = core(project, registryRoot); await app.install({ approveCapabilities: true });
  assert.ok((await app.audit()).findings.some((finding) => finding.severity === 'high'));
  await assert.rejects(() => app.audit({ failOn: 'high' }), /AUNO_AUDIT_THRESHOLD/);
});

test('rollback restores prior lockfile and materialized skill version', async () => {
  const registryRoot = await makeRegistry([{ id: 'demo', version: '1.0.0', text: '# Old\n' }, { id: 'demo', version: '1.1.0', text: '# New\n' }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } });
  const app = core(project, registryRoot); await app.install(); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '^1.0.0' } }));
  await app.update(); assert.equal(await readFile(join(project, '.agents/skills/demo/SKILL.md'), 'utf8'), '# New\n'); await app.rollback();
  assert.equal(await readFile(join(project, '.agents/skills/demo/SKILL.md'), 'utf8'), '# Old\n');
  assert.equal(JSON.parse(await readFile(join(project, 'skills-lock.json'), 'utf8')).skills['auno:demo'].resolved, '1.0.0');
});

test('detect recommend and explain compose project intelligence with registry candidates', async () => {
  const registryRoot = await makeRegistry([{ id: 'nextjs-guide', version: '1.0.0', text: '# Next\n', recommendation: { boosts: { 'tech:nextjs': 100 } } }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex'], skills: {} });
  await writeFile(join(project, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' } })); await writeFile(join(project, 'next.config.ts'), 'export default {}');
  const app = core(project, registryRoot); assert.ok((await app.detect()).technologies.nextjs >= 0.9); assert.equal((await app.recommend())[0].skillId, 'auno:nextjs-guide'); assert.equal((await app.explain('auno:nextjs-guide')).recommended, true);
});

test('lockfile materialization targets are repository-relative and portable', async () => {
  const registryRoot = await makeRegistry([{ id: 'demo', version: '1.0.0', text: '# Portable\n' }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex', 'claude-code'], skills: { 'auno:demo': '1.0.0' } });
  const result = await core(project, registryRoot).install();
  const targets = result.lock.skills['auno:demo'].materializations?.map((item) => item.target) ?? [];
  assert.deepEqual(targets.sort(), ['.agents/skills/demo', '.claude/skills/demo']);
  assert.equal(result.lockText.includes(project), false);
});

test('verified registry signer proof is persisted deterministically without timestamps', async () => {
  const registryRoot = await makeRegistry([{ id: 'demo', version: '1.0.0', text: '# Signed\n' }]);
  const project = await makeProject({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } });
  class SigningRegistry extends StaticRegistryClient {
    async getVerification() {
      return {
        registryKeyId: 'root-1',
        manifestKeyId: 'root-1',
        registrySignatureDigest: 'sha256:regsig',
        manifestSignatureDigest: 'sha256:mansig',
      };
    }
  }
  const app = new AunoSkillsCore({ projectRoot: project, registries: { auno: new SigningRegistry(registryRoot) }, cacheRoot: join(project, '.cache'), version: '0.2.0' });
  const result = await app.install();
  assert.deepEqual(result.lock.skills['auno:demo'].signing, {
    registryKeyId: 'root-1',
    manifestKeyId: 'root-1',
    registrySignatureDigest: 'sha256:regsig',
    manifestSignatureDigest: 'sha256:mansig',
  });
  assert.equal(result.lockText.includes('verifiedAt'), false);
});
