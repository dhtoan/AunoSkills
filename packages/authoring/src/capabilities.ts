import type { CapabilitySet } from '../../schema/src/index.ts';
import type { AuthoringFinding, CapabilityEvidence, CapabilityInferenceResult, SkillSourceFile } from './types.ts';

const MAX_TEXT_BYTES = 256 * 1024;
const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.sh', '.bash', '.zsh', '.py', '.rb', '.php', '.toml']);

function extension(path: string): string {
  const name = path.split('/').at(-1) ?? path;
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

function isInspectableText(file: SkillSourceFile): boolean {
  if (file.size > MAX_TEXT_BYTES || file.bytes.includes(0)) return false;
  return file.path === 'SKILL.md' || file.path === 'auno.json' || TEXT_EXTENSIONS.has(extension(file.path));
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function addEvidence(evidence: CapabilityEvidence[], capability: string, value: string | boolean, path: string, signal: string): void {
  const key = `${capability}\u0000${String(value)}\u0000${path}\u0000${signal}`;
  if (evidence.some((item) => `${item.capability}\u0000${String(item.value)}\u0000${item.path}\u0000${item.signal}` === key)) return;
  evidence.push({ capability, value, path, signal });
}

export function inferCapabilities(files: SkillSourceFile[]): CapabilityInferenceResult {
  const network = new Set<string>();
  const env = new Set<string>();
  const filesystemWrite = new Set<string>();
  const shell = new Set<string>();
  const evidence: CapabilityEvidence[] = [];
  let gitWrite = false;
  let agentModifyConfig = false;

  for (const file of files) {
    if (!isInspectableText(file)) continue;
    const text = file.bytes.toString('utf8');

    for (const match of text.matchAll(/https?:\/\/([A-Za-z0-9.-]+)(?::\d+)?(?:[/?#]|\b)/g)) {
      const host = match[1].toLowerCase();
      network.add(host);
      addEvidence(evidence, 'network.connect', host, file.path, match[0]);
    }

    for (const match of text.matchAll(/\$\{?([A-Z][A-Z0-9_]{1,63})\}?|process\.env\.([A-Z][A-Z0-9_]{1,63})/g)) {
      const name = match[1] ?? match[2];
      if (!name) continue;
      env.add(name);
      addEvidence(evidence, 'env.read', name, file.path, match[0]);
    }

    for (const match of text.matchAll(/\b(?:write|create|update|modify|edit)\s+(?:to\s+)?[`'"]?([.A-Za-z0-9_/-]+(?:\.[A-Za-z0-9._-]+)?)[`'"]?/gi)) {
      const target = match[1];
      if (!target || target.startsWith('http')) continue;
      filesystemWrite.add(target);
      addEvidence(evidence, 'filesystem.write', target, file.path, match[0]);
    }

    for (const match of text.matchAll(/`\s*(curl|wget|npm|npx|pnpm|yarn|bun|git|rm|cp|mv|mkdir|chmod|bash|sh|python|python3|node)\b[^`]*`/gi)) {
      const command = match[1].toLowerCase();
      shell.add(command);
      addEvidence(evidence, 'shell.commands', command, file.path, match[0]);
    }

    if (/\bgit\s+(?:add|commit|push|merge|rebase|reset|checkout|switch|tag|cherry-pick|revert)\b/i.test(text)) {
      gitWrite = true;
      addEvidence(evidence, 'git.write', true, file.path, 'git mutation command');
    }

    if (/(?:\.agents\/|\.claude\/|\.cursor\/|\.windsurf\/|\.github\/copilot|AGENTS\.md|CLAUDE\.md)/i.test(text)) {
      agentModifyConfig = true;
      addEvidence(evidence, 'agent.modifyConfig', true, file.path, 'agent configuration path');
    }
  }

  const capabilities: CapabilitySet = {};
  if (network.size) capabilities.network = { connect: sortedUnique(network) };
  if (env.size) capabilities.env = { read: sortedUnique(env) };
  if (filesystemWrite.size) capabilities.filesystem = { write: sortedUnique(filesystemWrite) };
  if (shell.size) capabilities.shell = { commands: sortedUnique(shell) };
  if (gitWrite) capabilities.git = { write: true };
  if (agentModifyConfig) capabilities.agent = { modifyConfig: true };
  evidence.sort((a, b) => {
    const left = `${a.capability}\u0000${String(a.value)}\u0000${a.path}\u0000${a.signal}`;
    const right = `${b.capability}\u0000${String(b.value)}\u0000${b.path}\u0000${b.signal}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { capabilities, evidence };
}

function missingValues(inferred: string[] | undefined, declared: string[] | undefined): string[] {
  if (!inferred?.length) return [];
  const allowed = new Set(declared ?? []);
  return inferred.filter((value) => !allowed.has(value));
}

export function capabilityMismatchFindings(declared: CapabilitySet | undefined, inferred: CapabilitySet): AuthoringFinding[] {
  const findings: AuthoringFinding[] = [];
  const mismatches: Array<[string, string[]]> = [
    ['network.connect', missingValues(inferred.network?.connect, declared?.network?.connect)],
    ['env.read', missingValues(inferred.env?.read, declared?.env?.read)],
    ['filesystem.write', missingValues(inferred.filesystem?.write, declared?.filesystem?.write)],
    ['shell.commands', missingValues(inferred.shell?.commands, declared?.shell?.commands)],
  ];
  for (const [capability, values] of mismatches) {
    if (!values.length) continue;
    findings.push({
      code: 'AUNO_SKILL_CAPABILITY_MISMATCH',
      severity: 'high',
      category: 'capabilities',
      message: `Static inference found undeclared ${capability}: ${values.join(', ')}`,
      details: { capability, values },
    });
  }
  if (inferred.git?.write && !declared?.git?.write) {
    findings.push({ code: 'AUNO_SKILL_CAPABILITY_MISMATCH', severity: 'high', category: 'capabilities', message: 'Static inference found undeclared git.write capability' });
  }
  if (inferred.agent?.modifyConfig && !declared?.agent?.modifyConfig) {
    findings.push({ code: 'AUNO_SKILL_CAPABILITY_MISMATCH', severity: 'high', category: 'capabilities', message: 'Static inference found undeclared agent.modifyConfig capability' });
  }
  return findings;
}
