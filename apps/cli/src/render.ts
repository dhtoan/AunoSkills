import type { AunoError } from '../../../packages/shared/src/index.ts';

export interface CliIO { stdout(text: string): void; stderr(text: string): void }

export const defaultIO: CliIO = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export function renderJson(io: CliIO, command: string, data: unknown): void {
  io.stdout(`${JSON.stringify({ schemaVersion: 1, command, ok: true, data })}\n`);
}

export function renderJsonError(io: CliIO, command: string, error: AunoError): void {
  io.stdout(`${JSON.stringify({ schemaVersion: 1, command, ok: false, error: error.toJSON() })}\n`);
}

export function renderHuman(io: CliIO, data: unknown): void {
  if (typeof data === 'string') io.stdout(`${data.endsWith('\n') ? data : `${data}\n`}`);
  else io.stdout(`${JSON.stringify(data, null, 2)}\n`);
}
