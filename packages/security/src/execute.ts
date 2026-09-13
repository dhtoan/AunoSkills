import { spawn } from 'node:child_process';

export interface CommandRequest { command: string; args?: string[]; cwd?: string }
export interface CommandGrant { allowedCommands: string[]; allowedEnv?: string[]; env?: Record<string, string> }
export interface CommandResult { code: number; stdout: string; stderr: string }

const SAFE_ENV = ['PATH', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'TMPDIR', 'TMP', 'TEMP'];

export async function executeCapabilityCommand(request: CommandRequest, grant: CommandGrant): Promise<CommandResult> {
  if (!grant.allowedCommands.includes(request.command)) throw new Error(`command not allowed: ${request.command}`);
  const env: Record<string, string> = {};
  for (const key of new Set([...SAFE_ENV, ...(grant.allowedEnv ?? [])])) {
    const value = grant.env?.[key] ?? process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(request.command, request.args ?? [], { cwd: request.cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}
