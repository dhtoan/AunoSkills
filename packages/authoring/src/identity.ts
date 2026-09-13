import { AunoError } from '../../shared/src/index.ts';

const PACKAGE_SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;
const WINDOWS_RESERVED = new Set(['con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9']);

function invalid(packageId: string): never {
  throw new AunoError({ code: 'AUNO_SKILL_ID_INVALID', message: `Invalid skill package id: ${packageId}`, category: 'config' });
}

export function validatePackageId(packageId: string): void {
  if (!packageId || packageId.includes('\\') || packageId.startsWith('/') || /^[A-Za-z]:/.test(packageId) || packageId.startsWith('//')) invalid(packageId);
  const segments = packageId.split('/');
  if (segments.length > 2 || segments.some((segment) => !segment || segment === '.' || segment === '..' || !PACKAGE_SEGMENT.test(segment))) invalid(packageId);
  const runtimeName = segments.at(-1)!;
  if (WINDOWS_RESERVED.has(runtimeName.toLowerCase()) || runtimeName.endsWith('.') || runtimeName.endsWith(' ')) invalid(packageId);
}

export function deriveRuntimeName(packageId: string): string {
  validatePackageId(packageId);
  return packageId.split('/').at(-1)!;
}
