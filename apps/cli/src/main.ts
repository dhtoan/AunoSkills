import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AunoSkillsCore } from '../../../packages/core/src/index.ts';
import {
  createOfficialRegistryClient,
  officialRegistryStatus,
  StaticRegistryClient,
  VerifiedRegistryClient,
  type RegistryAuthConfig,
  type RegistryClient,
} from '../../../packages/registry/src/index.ts';
import type { AgentId, LockfileV1, SigningKeyV1 } from '../../../packages/schema/src/index.ts';
import { normalizeProjectManifest, stableStringify } from '../../../packages/schema/src/index.ts';
import { AunoError, asAunoError, pathExists, readJsonFile, sha256File, writeTextAtomic } from '../../../packages/shared/src/index.ts';
import { parseArgs, type CliArgs } from './args.ts';
import { defaultIO, renderHuman, renderJson, renderJsonError, type CliIO } from './render.ts';
import { skillCommand, skillCommandName } from './skill.ts';

const VERSION = '0.3.0';
const DEFAULT_AGENTS: AgentId[] = ['codex', 'claude-code', 'cursor', 'windsurf', 'copilot', 'opencode'];

type RegistryConfig = {
  url: string;
  trust?: string;
  auth?: RegistryAuthConfig;
  anchors?: SigningKeyV1[];
};
interface UserConfig { telemetry?: boolean; registries?: Record<string, RegistryConfig>; [key: string]: unknown }

export interface CliDependencies {
  cwd?: string;
  registryBase?: string;
  homeDir?: string;
  io?: CliIO;
}

function defaultRegistryBase(): string {
  if (process.env.AUNOSKILLS_REGISTRY) return process.env.AUNOSKILLS_REGISTRY;
  const sourceLayout = resolve(fileURLToPath(new URL('../../../registry', import.meta.url)));
  if (existsSync(sourceLayout)) return sourceLayout;
  return resolve(fileURLToPath(new URL('../../../../registry', import.meta.url)));
}

function helpText(): string {
  return `AunoSkills ${VERSION}\n\nUsage: aunoskills [command] [options]\n\nCommands:\n  init        Detect, recommend and install skills (default)\n  detect      Detect project technologies and traits\n  recommend   Recommend relevant skills\n  explain     Explain a recommendation\n  add         Add a skill to the project manifest\n  remove      Remove a skill\n  install     Resolve and install manifest skills\n  update      Update skills within policy\n  restore     Restore exact lockfile state\n  rollback    Roll back the latest transaction\n  list        List resolved skills\n  outdated    List skills behind registry latest\n  doctor      Inspect or repair materializations\n  audit       Audit installed skills\n  sync        Restore lockfile state\n  skill       Author, validate, pack, verify and publish skills\n  registry    Manage registry configuration and trust\n  cache       Inspect and verify the local CAS\n  config      Read or update user configuration\n\nOptions:\n  -y, --yes\n  --dry-run\n  --json\n  --offline\n  --frozen-lockfile\n  --registry\n  --agent <name>\n  --project <path>\n  --auth-env <ENV_NAME>\n  --skill-version <semver>\n  --publisher <name>\n  --output <path>\n  --registry-workspace <path>\n  --source-repository <url>\n  --source-commit <sha>\n`;
}

function configPath(home: string): string { return join(home, '.aunoskills', 'config.json'); }
async function loadUserConfig(home: string): Promise<UserConfig> {
  const path = configPath(home);
  return await pathExists(path) ? await readJsonFile(path) as UserConfig : {};
}
async function saveUserConfig(home: string, config: UserConfig): Promise<void> {
  await writeTextAtomic(configPath(home), stableStringify(config));
}

async function registryClients(base: string, config: UserConfig, home: string, offline: boolean): Promise<Record<string, RegistryClient>> {
  const clients: Record<string, RegistryClient> = {
    auno: await createOfficialRegistryClient(base, {
      cacheDir: join(home, '.aunoskills', 'registries', 'auno'),
      offline,
    }),
  };
  for (const [name, entry] of Object.entries(config.registries ?? {})) {
    clients[name] = entry.anchors?.length
      ? new VerifiedRegistryClient(entry.url, entry.anchors, {
          auth: entry.auth ?? { type: 'none' },
          cacheDir: join(home, '.aunoskills', 'registries', name),
          offline,
        })
      : new StaticRegistryClient(entry.url);
  }
  return clients;
}

async function ensureInitManifest(core: AunoSkillsCore, projectRoot: string, args: CliArgs): Promise<{ created: boolean; selected: string[] }> {
  const manifestPath = join(projectRoot, 'aunoskills.json');
  if (await pathExists(manifestPath)) return { created: false, selected: [] };
  const recommendations = await core.recommend();
  const selected = recommendations.filter((item) => item.tier === 'auto').map((item) => item.skillId);
  const skills = Object.fromEntries(selected.map((id) => [id, 'recommended']));
  const manifest = {
    schemaVersion: 1,
    agents: args.agents.length ? args.agents : DEFAULT_AGENTS,
    skills,
    recommendation: { enabled: true, autoSelect: 95, recommended: 80, optional: 60 },
    materialization: { mode: 'portable', delivery: 'generated' },
    policy: { minimumTrust: 'community', allowUntrusted: false, execution: 'ask', network: 'ask', permissionEscalation: 'require-review' },
  };
  await writeTextAtomic(manifestPath, stableStringify(manifest));
  return { created: true, selected };
}

function parseSkillSpec(spec: string): { id: string; version: string } {
  const at = spec.lastIndexOf('@');
  const rawId = at > 0 ? spec.slice(0, at) : spec;
  const version = at > 0 ? spec.slice(at + 1) : 'recommended';
  if (!rawId || !version) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `Invalid skill spec: ${spec}`, category: 'config' });
  return { id: rawId.includes(':') ? rawId : `auno:${rawId}`, version };
}

async function addSkill(projectRoot: string, spec: string, args: CliArgs, core: AunoSkillsCore): Promise<unknown> {
  const path = join(projectRoot, 'aunoskills.json');
  const manifest = await pathExists(path)
    ? normalizeProjectManifest(await readJsonFile(path))
    : normalizeProjectManifest({ schemaVersion: 1, agents: args.agents.length ? args.agents : DEFAULT_AGENTS, skills: {} });
  const { id, version } = parseSkillSpec(spec);
  manifest.skills[id] = { version, scope: 'project', ...(args.agents.length ? { agents: args.agents } : {}) };
  await writeTextAtomic(path, stableStringify(manifest));
  return core.install({ dryRun: args.dryRun, offline: args.offline });
}

async function cacheCommand(args: CliArgs, home: string): Promise<unknown> {
  const action = args.positionals[0] ?? 'status';
  const root = join(home, '.aunoskills', 'cache', 'sha256');
  const names = await pathExists(root) ? (await readdir(root)).filter((name) => !name.endsWith('.tmp')) : [];
  if (action === 'status') return { objects: names.length, path: root };
  if (action === 'verify') {
    const corrupt: string[] = [];
    for (const digest of names) if (await sha256File(join(root, digest)) !== digest) corrupt.push(digest);
    return { objects: names.length, corrupt };
  }
  if (action === 'clear') {
    if (!args.yes) throw new AunoError({ code: 'AUNO_CONFIRMATION_REQUIRED', message: 'cache clear requires --yes', category: 'config' });
    await rm(root, { recursive: true, force: true });
    return { cleared: names.length };
  }
  if (action === 'prune') {
    let removed = 0;
    for (const digest of names) {
      if (await sha256File(join(root, digest)) !== digest) { await rm(join(root, digest), { force: true }); removed += 1; }
    }
    return { removed, retained: names.length - removed };
  }
  throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `Unknown cache action: ${action}`, category: 'config' });
}

async function configCommand(args: CliArgs, home: string, config: UserConfig): Promise<unknown> {
  const action = args.positionals[0] ?? 'list';
  if (action === 'list') return config;
  const key = args.positionals[1];
  if (!key) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `config ${action} requires a key`, category: 'config' });
  if (action === 'get') return { key, value: config[key] };
  if (action === 'set') {
    const raw = args.positionals[2];
    if (raw === undefined) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: 'config set requires a value', category: 'config' });
    let value: unknown = raw;
    if (raw === 'true') value = true;
    else if (raw === 'false') value = false;
    else if (/^-?\d+(?:\.\d+)?$/.test(raw)) value = Number(raw);
    config[key] = value;
    await saveUserConfig(home, config);
    return { key, value };
  }
  throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `Unknown config action: ${action}`, category: 'config' });
}

function safeRegistryConfig(entry: RegistryConfig): RegistryConfig {
  return {
    url: entry.url,
    ...(entry.trust ? { trust: entry.trust } : {}),
    ...(entry.auth ? { auth: entry.auth } : {}),
    ...(entry.anchors ? { anchors: entry.anchors } : {}),
  };
}

async function registryCommand(
  args: CliArgs,
  home: string,
  base: string,
  config: UserConfig,
  registries: Record<string, RegistryClient>,
): Promise<unknown> {
  const action = args.positionals[0] ?? 'list';
  const officialStatus = await officialRegistryStatus(base, {
    cacheDir: join(home, '.aunoskills', 'registries', 'auno'),
    offline: args.offline,
  });
  if (action === 'list') {
    const officialTrust = officialStatus.verified ? 'verified' : 'legacy-awaiting-production-trust';
    return { registries: [{ name: 'auno', url: base, trust: officialTrust, reserved: true }, ...Object.entries(config.registries ?? {}).map(([name, entry]) => ({ name, ...safeRegistryConfig(entry) }))] };
  }
  const name = args.positionals[1];
  if (!name) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `registry ${action} requires a name`, category: 'config' });

  if (action === 'status' && name === 'auno') return { status: officialStatus };
  if (action === 'keys' && name === 'auno') {
    return { keys: [officialStatus.rootKeyId, ...officialStatus.releaseKeyIds].filter((value): value is string => Boolean(value)) };
  }
  if (action === 'verify' && name === 'auno') {
    if (!officialStatus.verified) return { verification: officialStatus };
    const index = await registries.auno.loadIndex();
    return { verification: { ...officialStatus, skills: Object.keys(index.skills).length } };
  }

  if (action === 'show') {
    if (name === 'auno') return { registry: { name: 'auno', url: base, reserved: true, status: officialStatus } };
    const existing = config.registries?.[name];
    if (!existing) throw new AunoError({ code: 'AUNO_REGISTRY_NOT_FOUND', message: `Registry not configured: ${name}`, category: 'config' });
    return { registry: { name, ...safeRegistryConfig(existing) } };
  }

  if (action === 'refresh') {
    if (args.offline) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: 'registry refresh cannot run with --offline', category: 'config' });
    const names = name === 'all' ? Object.keys(registries) : [name];
    const refreshed: Array<{ name: string; schemaVersion: number; skills: number }> = [];
    for (const target of names) {
      const client = registries[target];
      if (!client) throw new AunoError({ code: 'AUNO_REGISTRY_NOT_FOUND', message: `Registry not configured: ${target}`, category: 'config' });
      const index = await client.loadIndex();
      refreshed.push({ name: target, schemaVersion: index.schemaVersion, skills: Object.keys(index.skills).length });
    }
    return { refreshed };
  }

  if (name === 'auno') throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `registry ${action} cannot modify reserved registry auno`, category: 'config' });
  config.registries ??= {};
  if (action === 'add') {
    const url = args.positionals[2];
    if (!url) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: 'registry add requires a URL/path', category: 'config' });
    config.registries[name] = {
      url,
      trust: 'untrusted',
      ...(args.authEnv ? { auth: { type: 'bearer-env', env: args.authEnv } as const } : {}),
    };
  } else if (action === 'remove') {
    delete config.registries[name];
  } else if (action === 'trust') {
    const keyId = args.positionals[2];
    const publicKey = args.positionals[3];
    if (!keyId || !publicKey) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: 'registry trust requires <keyId> <publicKey>', category: 'config' });
    const existing = config.registries[name];
    if (!existing) throw new AunoError({ code: 'AUNO_REGISTRY_NOT_FOUND', message: `Registry not configured: ${name}`, category: 'config' });
    existing.anchors = [{ keyId, algorithm: 'ed25519', publicKey }];
    existing.trust = 'verified';
  } else {
    throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `Unknown registry action: ${action}`, category: 'config' });
  }
  await saveUserConfig(home, config);
  return { registries: config.registries };
}

async function outdated(projectRoot: string, registries: Record<string, RegistryClient>): Promise<unknown> {
  const path = join(projectRoot, 'skills-lock.json');
  if (!await pathExists(path)) return { skills: [] };
  const lock = await readJsonFile(path) as LockfileV1;
  const skills: Array<{ id: string; current: string; latest: string }> = [];
  for (const [id, item] of Object.entries(lock.skills)) {
    const registry = registries[item.registry];
    if (!registry) continue;
    const latest = (await registry.loadIndex()).skills[id.split(':').at(-1)!]?.latest;
    if (latest && latest !== item.resolved) skills.push({ id, current: item.resolved, latest });
  }
  return { skills };
}

async function dispatch(command: string, args: CliArgs, core: AunoSkillsCore, projectRoot: string, home: string, base: string, config: UserConfig, registries: Record<string, RegistryClient>): Promise<unknown> {
  switch (command) {
    case 'init': {
      const init = await ensureInitManifest(core, projectRoot, args);
      const result = await core.install({ dryRun: args.dryRun, offline: args.offline, frozenLockfile: args.frozenLockfile });
      return { initialized: init.created, selected: init.selected, skills: Object.keys(result.lock.skills), plans: result.plans.map((plan) => plan.target) };
    }
    case 'detect': return core.detect();
    case 'recommend': return core.recommend();
    case 'explain': {
      const id = args.positionals[0];
      if (!id) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: 'explain requires a skill id', category: 'config' });
      return core.explain(id.includes(':') ? id : `auno:${id}`);
    }
    case 'add': {
      const spec = args.positionals[0];
      if (!spec) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: 'add requires a skill spec', category: 'config' });
      return addSkill(projectRoot, spec, args, core);
    }
    case 'install': return core.install({ dryRun: args.dryRun, offline: args.offline, frozenLockfile: args.frozenLockfile });
    case 'restore': return core.restore({ dryRun: args.dryRun, offline: args.offline });
    case 'sync': return core.restore({ dryRun: args.dryRun, offline: args.offline });
    case 'update': return core.update({ dryRun: args.dryRun, offline: args.offline });
    case 'remove': {
      const id = args.positionals[0];
      if (!id) throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: 'remove requires a skill id', category: 'config' });
      return core.remove(id.includes(':') ? id : `auno:${id}`);
    }
    case 'doctor': {
      const report = await core.doctor({ fix: args.fix });
      if (args.check && report.issues.length) throw new AunoError({ code: 'AUNO_DOCTOR_CHECK_FAILED', message: `${report.issues.length} doctor issue(s) found`, category: 'materialization', details: report });
      return report;
    }
    case 'audit': {
      const report = await core.audit({ failOn: args.failOn });
      if (!args.registryAudit) return report;
      return {
        ...report,
        registry: await officialRegistryStatus(base, {
          cacheDir: join(home, '.aunoskills', 'registries', 'auno'),
          offline: args.offline,
        }),
      };
    }
    case 'rollback': return { transaction: await core.rollback() };
    case 'list': {
      const path = join(projectRoot, 'skills-lock.json');
      if (!await pathExists(path)) return { skills: [] };
      const lock = await readJsonFile(path) as LockfileV1;
      return { skills: Object.entries(lock.skills).map(([id, value]) => ({ id, version: value.resolved, trust: value.effectiveTrust })) };
    }
    case 'outdated': return outdated(projectRoot, registries);
    case 'skill': return skillCommand(args, projectRoot);
    case 'registry': return registryCommand(args, home, base, config, registries);
    case 'cache': return cacheCommand(args, home);
    case 'config': return configCommand(args, home, config);
    default: throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `Unknown command: ${command}`, category: 'config' });
  }
}

export async function runCli(argv: string[], deps: CliDependencies = {}): Promise<number> {
  const io = deps.io ?? defaultIO;
  let command = 'init';
  try {
    const args = parseArgs(argv);
    const dispatchCommand = args.command;
    command = dispatchCommand === 'skill' ? skillCommandName(args) : dispatchCommand;
    if (args.help) { io.stdout(helpText()); return 0; }
    if (args.version) { io.stdout(`${VERSION}\n`); return 0; }
    const projectRoot = resolve(args.project ?? deps.cwd ?? process.cwd());
    const home = deps.homeDir ?? homedir();
    const base = deps.registryBase ?? defaultRegistryBase();
    const config = await loadUserConfig(home);
    const registries = await registryClients(base, config, home, args.offline);
    const core = new AunoSkillsCore({ projectRoot, registries, cacheRoot: join(home, '.aunoskills', 'cache'), version: VERSION });
    const result = await dispatch(dispatchCommand, args, core, projectRoot, home, base, config, registries);
    if (!args.quiet) args.json ? renderJson(io, command, result) : renderHuman(io, result);
    return 0;
  } catch (cause) {
    const error = asAunoError(cause);
    const jsonRequested = argv.includes('--json');
    if (jsonRequested) renderJsonError(io, command, error);
    else io.stderr(`ERROR ${error.code}\n${error.message}\n`);
    return error.exitCode;
  }
}

const selfPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (selfPath === fileURLToPath(import.meta.url)) process.exitCode = await runCli(process.argv.slice(2));
