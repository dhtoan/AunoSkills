import { AunoError } from '../../shared/src/index.ts';
import type { RegistryAuthConfig } from './types.ts';

export function registryAuthHeaders(
  config: RegistryAuthConfig,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (config.type === 'none') return {};
  const token = env[config.env];
  if (!token) {
    throw new AunoError({
      code: 'AUNO_REGISTRY_AUTH_MISSING',
      message: `AUNO_REGISTRY_AUTH_MISSING environment variable ${config.env} is not set`,
      category: 'registry',
      retryable: false,
    });
  }
  return { Authorization: `Bearer ${token}` };
}
