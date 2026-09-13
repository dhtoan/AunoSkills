import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Bytes } from '../../../packages/shared/src/index.ts';
import { runCli } from '../src/main.ts';

async function registry(skills: Array<{ id: string; version: string; text: string; trust?: string; recommendation?: any; capabilities?: any }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'auno-cli-reg-'));
  await mkdir(join(root, 'blobs/sha256'), { recursive: true });
  const index: any = { schemaVersion: 1, registry: 'auno', skills: {} };
  for (const skill of skills) {
    const metadata = { schemaVersion: 1, id: skill.id, version: skill.version, recommendation: skill.recommendation, capabilities: skill.capabilities };
    const bundle = Buffer.from(JSON.stringify({ schemaVersion: 1, metadata, files: { 'SKILL.md': Buffer.from(skill.text).toString('base64') } }));
    const hash = sha256Bytes(bundle);
    await writeFile(join(root, 'blobs/sha256', hash), bundle);
    index.skills[skill.id] ??= { latest: skill.version, versions: {} };
    index.skills[skill.id].latest = skill.version;
    index.skills[skill.id].versions[skill.version] = { manifest: `sha256:${hash}`, bundle: `sha256:${hash}`, trust: skill.trust ?? 'verified', publisher: 'auno', metadata, capabilities: skill.capabilities };
  }
  await writeFile(join(root, 'index.json'), JSON.stringify(index));
  return root;
}
function capture() { let stdout = ''; let stderr = ''; return { io: { stdout: (text: string) => { stdout += text; }, stderr: (text: string) => { stderr += text; } }, get stdout() { return stdout; }, get stderr() { return stderr; } }; }

test('no subcommand behaves like init and installs auto recommendation with --yes', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-'));
  await writeFile(join(project, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' } })); await writeFile(join(project, 'next.config.ts'), 'export default {}');
  const reg = await registry([{ id: 'next-guide', version: '1.0.0', text: '# Next\n', recommendation: { boosts: { 'tech:nextjs': 100 } } }]); const out = capture();
  assert.equal(await runCli(['--yes'], { cwd: project, registryBase: reg, io: out.io }), 0);
  assert.match(await readFile(join(project, 'aunoskills.json'), 'utf8'), /auno:next-guide/); assert.equal(await readFile(join(project, '.agents/skills/next-guide/SKILL.md'), 'utf8'), '# Next\n');
});

test('detect --json emits stable machine-readable envelope', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-')); await writeFile(join(project, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0' } })); const reg = await registry([]); const out = capture();
  assert.equal(await runCli(['detect', '--json'], { cwd: project, registryBase: reg, io: out.io }), 0); const parsed = JSON.parse(out.stdout); assert.equal(parsed.schemaVersion, 1); assert.equal(parsed.command, 'detect'); assert.equal(parsed.ok, true); assert.ok(parsed.data.technologies.nextjs > 0);
});

test('install --dry-run makes no materialization changes', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-')); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } })); const reg = await registry([{ id: 'demo', version: '1.0.0', text: '# Demo\n' }]); const out = capture();
  assert.equal(await runCli(['install', '--dry-run'], { cwd: project, registryBase: reg, io: out.io }), 0); await assert.rejects(() => readFile(join(project, '.agents/skills/demo/SKILL.md')), /ENOENT/);
});

test('frozen lock failure returns stable lockfile exit code', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-')); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } })); const reg = await registry([{ id: 'demo', version: '1.0.0', text: '# Demo\n' }]); let out = capture();
  assert.equal(await runCli(['install'], { cwd: project, registryBase: reg, io: out.io }), 0); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: {} })); out = capture(); const code = await runCli(['install', '--frozen-lockfile', '--json'], { cwd: project, registryBase: reg, io: out.io }); assert.equal(code, 9); assert.equal(JSON.parse(out.stdout).error.code, 'AUNO_LOCKFILE_STALE');
});

test('--yes does not bypass a denied security policy', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-')); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:risky': '1.0.0' }, policy: { execution: 'deny', minimumTrust: 'verified' } }));
  const reg = await registry([{ id: 'risky', version: '1.0.0', text: '# Risk\n', capabilities: { shell: { commands: ['npm test'] } } }]); const out = capture(); assert.equal(await runCli(['install', '--yes'], { cwd: project, registryBase: reg, io: out.io }), 7);
});

test('recommend and explain expose explainable scores as JSON', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-')); await writeFile(join(project, 'package.json'), JSON.stringify({ dependencies: { next: '15.0.0' } })); const reg = await registry([{ id: 'next-guide', version: '1.0.0', text: '# Next\n', recommendation: { boosts: { 'tech:nextjs': 100 } } }]); let out = capture();
  assert.equal(await runCli(['recommend', '--json'], { cwd: project, registryBase: reg, io: out.io }), 0); assert.equal(JSON.parse(out.stdout).data[0].skillId, 'auno:next-guide'); out = capture(); assert.equal(await runCli(['explain', 'next-guide', '--json'], { cwd: project, registryBase: reg, io: out.io }), 0); assert.equal(JSON.parse(out.stdout).data.relevance, 80);
});

test('doctor --check returns materialization exit code when managed files drift', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-')); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } })); const reg = await registry([{ id: 'demo', version: '1.0.0', text: '# Demo\n' }]); let out = capture(); assert.equal(await runCli(['install'], { cwd: project, registryBase: reg, io: out.io }), 0); await writeFile(join(project, '.agents/skills/demo/SKILL.md'), '# changed\n'); out = capture(); const code = await runCli(['doctor', '--check', '--json'], { cwd: project, registryBase: reg, io: out.io }); assert.equal(code, 8); assert.equal(JSON.parse(out.stdout).error.code, 'AUNO_DOCTOR_CHECK_FAILED');
});

test('audit threshold failure uses dedicated exit code 10', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-')); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:risky': '1.0.0' }, policy: { minimumTrust: 'untrusted', allowUntrusted: true, execution: 'allow' } })); const reg = await registry([{ id: 'risky', version: '1.0.0', text: '# Risk\n', trust: 'untrusted' }]); let out = capture(); assert.equal(await runCli(['install'], { cwd: project, registryBase: reg, io: out.io }), 0); out = capture(); const code = await runCli(['audit', '--fail-on', 'high', '--json'], { cwd: project, registryBase: reg, io: out.io }); assert.equal(code, 10); assert.equal(JSON.parse(out.stdout).error.code, 'AUNO_AUDIT_THRESHOLD');
});

test('add updates manifest and installs the requested skill', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-')); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: {} })); const reg = await registry([{ id: 'demo', version: '1.0.0', text: '# Demo\n' }]); const out = capture(); assert.equal(await runCli(['add', 'demo@1.0.0'], { cwd: project, registryBase: reg, io: out.io }), 0); assert.match(await readFile(join(project, 'aunoskills.json'), 'utf8'), /auno:demo/); assert.equal(await readFile(join(project, '.agents/skills/demo/SKILL.md'), 'utf8'), '# Demo\n');
});

test('registry cache config sync and outdated subcommands have stable JSON surfaces', async () => {
  const project = await mkdtemp(join(tmpdir(), 'auno-cli-project-')); const home = await mkdtemp(join(tmpdir(), 'auno-cli-home-')); await writeFile(join(project, 'aunoskills.json'), JSON.stringify({ schemaVersion: 1, agents: ['codex'], skills: { 'auno:demo': '1.0.0' } })); const reg = await registry([{ id: 'demo', version: '1.0.0', text: '# Demo\n' }]); let out = capture(); assert.equal(await runCli(['install'], { cwd: project, homeDir: home, registryBase: reg, io: out.io }), 0);
  out = capture(); assert.equal(await runCli(['registry', 'list', '--json'], { cwd: project, homeDir: home, registryBase: reg, io: out.io }), 0); assert.equal(JSON.parse(out.stdout).data.registries[0].name, 'auno');
  out = capture(); assert.equal(await runCli(['cache', 'status', '--json'], { cwd: project, homeDir: home, registryBase: reg, io: out.io }), 0); assert.ok(JSON.parse(out.stdout).data.objects >= 1);
  out = capture(); assert.equal(await runCli(['config', 'set', 'telemetry', 'true', '--json'], { cwd: project, homeDir: home, registryBase: reg, io: out.io }), 0);
  out = capture(); assert.equal(await runCli(['config', 'get', 'telemetry', '--json'], { cwd: project, homeDir: home, registryBase: reg, io: out.io }), 0); assert.equal(JSON.parse(out.stdout).data.value, true);
  out = capture(); assert.equal(await runCli(['sync', '--offline', '--json'], { cwd: project, homeDir: home, registryBase: reg, io: out.io }), 0);
  out = capture(); assert.equal(await runCli(['outdated', '--json'], { cwd: project, homeDir: home, registryBase: reg, io: out.io }), 0); assert.deepEqual(JSON.parse(out.stdout).data.skills, []);
});
