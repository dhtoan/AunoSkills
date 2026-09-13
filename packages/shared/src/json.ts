import { readFile } from 'node:fs/promises';

export async function readJsonFile<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}
