import type { CapabilitySet } from '../../schema/src/index.ts';

function flatten(capabilities: CapabilitySet = {}): string[] {
  const items: string[] = [];
  for (const [group, value] of Object.entries(capabilities)) {
    if (!value || typeof value !== 'object') continue;
    for (const [name, detail] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(detail)) for (const entry of detail) items.push(`${group}.${name}:${String(entry)}`);
      else if (detail === true) items.push(`${group}.${name}:true`);
    }
  }
  return items.sort();
}

export function detectPermissionEscalation(before: CapabilitySet = {}, after: CapabilitySet = {}): string[] {
  const previous = new Set(flatten(before));
  return flatten(after).filter((entry) => !previous.has(entry));
}
