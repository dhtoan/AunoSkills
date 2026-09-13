import type { AgentId } from '../../../packages/schema/src/index.ts';
import { AunoError } from '../../../packages/shared/src/index.ts';

export interface CliArgs {
  command: string;
  positionals: string[];
  yes: boolean;
  dryRun: boolean;
  json: boolean;
  verbose: boolean;
  quiet: boolean;
  offline: boolean;
  noAi: boolean;
  frozenLockfile: boolean;
  help: boolean;
  version: boolean;
  registryAudit: boolean;
  agents: AgentId[];
  project?: string;
  authEnv?: string;
  failOn?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  fix: boolean;
  check: boolean;
}

const AGENTS = new Set<AgentId>(['codex', 'claude-code', 'cursor', 'windsurf', 'copilot', 'opencode']);
const SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical']);

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `${flag} requires a value`, category: 'config' });
  }
  return value;
}

export function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {
    command: 'init', positionals: [], yes: false, dryRun: false, json: false, verbose: false, quiet: false,
    offline: false, noAi: false, frozenLockfile: false, help: false, version: false, registryAudit: false, agents: [], fix: false, check: false,
  };
  let commandSet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') parsed.yes = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--verbose' || arg === '-v') parsed.verbose = true;
    else if (arg === '--quiet') parsed.quiet = true;
    else if (arg === '--offline') parsed.offline = true;
    else if (arg === '--no-ai') parsed.noAi = true;
    else if (arg === '--frozen-lockfile') parsed.frozenLockfile = true;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--version') parsed.version = true;
    else if (arg === '--registry') parsed.registryAudit = true;
    else if (arg === '--fix') parsed.fix = true;
    else if (arg === '--check') parsed.check = true;
    else if (arg === '--project') { parsed.project = requireValue(argv, i, arg); i += 1; }
    else if (arg === '--auth-env') { parsed.authEnv = requireValue(argv, i, arg); i += 1; }
    else if (arg === '--agent') {
      const value = requireValue(argv, i, arg);
      if (!AGENTS.has(value as AgentId)) throw new AunoError({ code: 'AUNO_INVALID_AGENT', message: `Unsupported agent: ${value}`, category: 'config' });
      parsed.agents.push(value as AgentId); i += 1;
    } else if (arg === '--fail-on') {
      const value = requireValue(argv, i, arg);
      if (!SEVERITIES.has(value)) throw new AunoError({ code: 'AUNO_INVALID_SEVERITY', message: `Unsupported severity: ${value}`, category: 'config' });
      parsed.failOn = value as CliArgs['failOn']; i += 1;
    } else if (arg.startsWith('-')) {
      throw new AunoError({ code: 'AUNO_INVALID_USAGE', message: `Unknown option: ${arg}`, category: 'config' });
    } else if (!commandSet) {
      parsed.command = arg;
      commandSet = true;
    } else parsed.positionals.push(arg);
  }
  return parsed;
}
