import test from 'node:test';
import assert from 'node:assert/strict';
import { registryAuthHeaders, type RegistryAuthConfig } from '../src/index.ts';

test('bearer-env auth reads token only from the provided environment at request time', () => {
  const config: RegistryAuthConfig = { type: 'bearer-env', env: 'AUNOSKILLS_COMPANY_TOKEN' };
  const headers = registryAuthHeaders(config, { AUNOSKILLS_COMPANY_TOKEN: 'super-secret-token' });
  assert.equal(headers.Authorization, 'Bearer super-secret-token');
  assert.equal(JSON.stringify(config).includes('super-secret-token'), false);
});

test('missing bearer environment variable fails with structured error and no token value', () => {
  const config: RegistryAuthConfig = { type: 'bearer-env', env: 'AUNOSKILLS_COMPANY_TOKEN' };
  assert.throws(
    () => registryAuthHeaders(config, {}),
    (error: unknown) => {
      assert.equal(typeof error, 'object');
      const value = error as { code?: string; message?: string };
      assert.equal(value.code, 'AUNO_REGISTRY_AUTH_MISSING');
      assert.match(value.message ?? '', /AUNOSKILLS_COMPANY_TOKEN/);
      assert.equal((value.message ?? '').includes('Bearer'), false);
      return true;
    },
  );
});

test('registry auth supports explicit no-auth configuration', () => {
  assert.deepEqual(registryAuthHeaders({ type: 'none' }, { TOKEN: 'ignored' }), {});
});
