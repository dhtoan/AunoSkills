# AunoSkills v0.2 Registry Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ed25519-verified registry/index/manifest trust, safe private-registry auth, key rotation/revocation, refresh/cache flows, and audit integration without breaking v0.1 lifecycle behavior.

**Architecture:** Extend schemas with registry-v2 and signing metadata, add pure crypto helpers in `security`, isolate trust/auth logic in `registry`, and introduce a `VerifiedRegistryClient` that verifies trust metadata, index signatures, manifest signatures, and immutable bundle hashes before returning installable data. Keep `StaticRegistryClient` for schema-v1 compatibility and route CLI registry configuration through explicit local trust anchors and credential references.

**Tech Stack:** TypeScript 5.8, Node.js >=22 built-in `crypto` Ed25519 APIs, node:test, existing AunoSkills packages, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-aunoskills-v0.2-registry-security-design.md`

## Global Constraints

- No runtime npm dependencies unless impossible with Node >=22 built-ins.
- Never persist credential values.
- Never allow registry-provided keys to self-bootstrap trust.
- Official registry v2 must fail closed on invalid/missing signatures.
- Schema-v1 registries remain readable only under existing community/untrusted policy semantics.
- All committed registry artifacts remain deterministic and cross-platform reproducible.
- Every mutation continues through existing transaction boundaries.
- Windows, macOS, and Linux remain equal CI targets on Node 22 and 24.

---

### Task 1: Registry v2 and Signing Schemas

**Files:**
- Modify: `packages/schema/src/types.ts`
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/schema.test.ts`

**Interfaces:**
- Produces: `SignatureEnvelopeV1`, `SigningKeyV1`, `RegistryTrustDocumentV1`, `RegistryIndexV2`, `RegistryVersionV2`, optional lockfile signer metadata.

- [ ] Add failing tests for valid/invalid signing key, trust document, registry-v2 index, and optional lock signer fields.
- [ ] Run schema tests and verify RED.
- [ ] Add minimal types and validators; reject unknown critical signing fields and invalid algorithms.
- [ ] Run schema tests and verify GREEN.
- [ ] Commit `feat(schema): add signed registry v2 contracts`.

### Task 2: Ed25519 Canonical Signing Helpers

**Files:**
- Create: `packages/security/src/signatures.ts`
- Modify: `packages/security/src/index.ts`
- Test: `packages/security/test/security.test.ts`

**Interfaces:**
- Produces: `canonicalSignedPayload(value, excludedKeys?)`, `signEd25519(payload, privateKey)`, `verifyEd25519(payload, envelope, publicKey)`.

- [ ] Add failing tests using generated Ed25519 keypairs for valid verification and tamper rejection.
- [ ] Run security test and verify RED.
- [ ] Implement using Node `crypto.sign`, `crypto.verify`, `createPrivateKey`, and `createPublicKey`; sign stable canonical UTF-8 bytes.
- [ ] Add explicit `AUNO_SIGNATURE_INVALID` failure mapping.
- [ ] Run security tests and verify GREEN.
- [ ] Commit `feat(security): add ed25519 signature verification`.

### Task 3: Trust Store, Rotation, and Revocation

**Files:**
- Create: `packages/registry/src/trust.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/test/trust.test.ts`

**Interfaces:**
- Produces: `RegistryTrustStore`, `verifyTrustDocument(document, anchors, now)`, `activeSigningKey(keyId, now)`.

- [ ] Add failing tests for trusted root, unknown self-signed root rejection, rotation, revoked key, expired key, and not-yet-valid key.
- [ ] Run trust tests and verify RED.
- [ ] Implement trust validation so only an already trusted active key can authorize a trust-document update.
- [ ] Map failures to `AUNO_SIGNING_KEY_UNKNOWN`, `AUNO_SIGNING_KEY_REVOKED`, `AUNO_SIGNING_KEY_EXPIRED`, and `AUNO_TRUST_METADATA_INVALID`.
- [ ] Run registry trust tests and verify GREEN.
- [ ] Commit `feat(registry): add key rotation and revocation trust store`.

### Task 4: Credential-Safe Registry Authentication

**Files:**
- Create: `packages/registry/src/auth.ts`
- Modify: `packages/registry/src/types.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/test/auth.test.ts`

**Interfaces:**
- Produces: `RegistryAuthConfig`, `registryAuthHeaders(config, env)`.

- [ ] Add failing tests for bearer-env injection, missing env error, and non-persistence/redaction behavior.
- [ ] Run auth tests and verify RED.
- [ ] Implement request-time Authorization header construction without storing token values.
- [ ] Ensure thrown errors contain only env variable names, never secret values.
- [ ] Run auth tests and verify GREEN.
- [ ] Commit `feat(registry): add credential-safe private registry auth`.

### Task 5: Verified Registry Client

**Files:**
- Create: `packages/registry/src/verified-registry.ts`
- Modify: `packages/registry/src/static-registry.ts`
- Modify: `packages/registry/src/types.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/test/verified-registry.test.ts`

**Interfaces:**
- Produces: `VerifiedRegistryClient` implementing `RegistryClient`; consumes explicit local trust anchors and optional auth config.

- [ ] Add failing fixture tests for signed trust/index/manifest/bundle success.
- [ ] Add tampered index, tampered manifest, wrong bundle hash, revoked key, and unknown key failures.
- [ ] Implement fetch flow `trust.json -> verify -> index.json -> verify -> manifest -> verify -> bundle -> sha256`.
- [ ] Add cached verified metadata hooks needed for offline use.
- [ ] Keep `StaticRegistryClient` behavior unchanged for schema-v1 compatibility.
- [ ] Run registry tests and verify GREEN.
- [ ] Commit `feat(registry): verify signed registry v2 artifacts`.

### Task 6: Core Resolution and Lock Signer Metadata

**Files:**
- Modify: `packages/core/src/orchestrator.ts`
- Modify: `packages/resolver/src/resolve.ts`
- Test: `packages/core/test/core.test.ts`
- Test: `packages/resolver/test/resolver.test.ts`

**Interfaces:**
- Consumes verified registry metadata.
- Produces deterministic lock signer IDs/signature digests without verification timestamps.

- [ ] Add failing tests showing verified signer metadata persists deterministically in the lock and unsigned v1 registry remains lower-trust.
- [ ] Implement lock metadata propagation and policy-aware handling.
- [ ] Verify no timestamp enters committed lock serialization.
- [ ] Run core/resolver tests and verify GREEN.
- [ ] Commit `feat(core): persist deterministic registry signer metadata`.

### Task 7: Audit Signer State

**Files:**
- Modify: `packages/core/src/audit.ts`
- Test: `packages/core/test/core.test.ts`

**Interfaces:**
- Produces findings for invalid/unknown/revoked/expired/missing signer state.

- [ ] Add failing audit tests for revoked installed signer and unsigned v1 community registry.
- [ ] Implement severity mapping from the design spec.
- [ ] Run audit tests and verify GREEN.
- [ ] Commit `feat(audit): report registry signing trust state`.

### Task 8: CLI Registry Refresh, Trust, Show, and Auth Config

**Files:**
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/cli/src/args.ts`
- Test: `apps/cli/test/cli.test.ts`

**Interfaces:**
- Adds: `registry show`, `registry refresh`, `registry trust <name> <keyId> <publicKey>`, `registry add <name> <url> --auth-env <ENV>`.

- [ ] Add failing CLI tests for each new registry command and stable JSON output.
- [ ] Extend user config to store only credential references and trust anchors.
- [ ] Build `VerifiedRegistryClient` for registries with configured anchors; preserve schema-v1 client for explicitly untrusted/community registries.
- [ ] Ensure reserved `auno` root cannot be removed/replaced.
- [ ] Run CLI tests and verify GREEN.
- [ ] Commit `feat(cli): manage verified custom registries`.

### Task 9: Migrate Bundled Official Registry to Signed v2

**Files:**
- Modify: `scripts/build-registry.ts`
- Modify: `packages/registry/src/build.ts`
- Modify: `registry/index.json`
- Create: `registry/trust.json`
- Create: `registry/manifests/sha256/*`
- Modify: `skills/*/auno.json` only if metadata needs v2 fields.
- Test: `packages/registry/test/build.test.ts`
- Test: `test/e2e/dogfood.test.ts`

**Interfaces:**
- Produces reproducible signed official registry v2 artifacts using a deterministic development/release fixture key strategy documented for this repository.

- [ ] Add failing build tests requiring index/trust/manifest signatures and deterministic rebuild.
- [ ] Add signing support to registry build pipeline with key input separated from published public trust material.
- [ ] Generate v2 registry artifacts and signer metadata.
- [ ] Ensure private signing key material is never committed.
- [ ] Update dogfood flow to verify official signatures before install/restore.
- [ ] Run build/dogfood tests and verify GREEN.
- [ ] Commit `feat(registry): migrate official registry to signed v2`.

### Task 10: Offline Trust Cache and Refresh E2E

**Files:**
- Modify: `packages/registry/src/verified-registry.ts`
- Modify: `packages/core/src/state.ts`
- Test: `test/e2e/lifecycle.test.ts`

**Interfaces:**
- Produces cached verified trust/index state under `.aunoskills/state` or global registry metadata cache, with no credentials.

- [ ] Add failing E2E: online refresh then offline restore succeeds; offline refresh without cache fails cleanly.
- [ ] Implement verified metadata cache with integrity checks.
- [ ] Run E2E and verify GREEN.
- [ ] Commit `feat(registry): support offline verified metadata cache`.

### Task 11: Version, Docs, Security Fixtures, and Release Gates

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `test/security-fixtures/adversarial.test.ts`
- Modify: `.github/workflows/ci.yml` only if additional explicit signing gate is needed.

**Interfaces:**
- Releases `0.2.0` behavior and documents exact security guarantees/non-guarantees.

- [ ] Add adversarial tests for signature tampering, self-bootstrap, revoked key, and auth-secret leakage.
- [ ] Update package version to `0.2.0` and docs/CHANGELOG.
- [ ] Run full `npm run verify` in GitHub Actions matrix.
- [ ] Run `npm run registry:build` then `git diff --exit-code -- registry` on all matrix jobs.
- [ ] Require security gate success.
- [ ] Commit `release: prepare AunoSkills v0.2.0`.

### Task 12: PR, Remote Verification, and Merge

**Files:** none unless CI exposes a real defect.

- [ ] Open PR from `feat/aunoskills-v0.2-registry-security` to `main`.
- [ ] Wait for GitHub Actions on the exact PR head.
- [ ] If CI fails, inspect logs, add a regression test, fix root cause, and push another checkpoint.
- [ ] Confirm security gate + Ubuntu/macOS/Windows Node 22/24 are all successful.
- [ ] Merge only after the exact head is green.
- [ ] Verify `main` push CI succeeds after merge.
