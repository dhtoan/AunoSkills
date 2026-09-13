# AunoSkills v0.3 Secure Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add delegated root/release signing, secure release tooling, and official-registry verification infrastructure without committing private signing material.

**Architecture:** Keep Ed25519 primitives and runtime verification from v0.2. Add a delegated builder that requires a root-verified trust document and a release private key matching an active delegated public key. Add official-registry construction and release scripts/workflow around that boundary. Normal CI remains secret-free and verifies public artifacts only.

**Tech Stack:** TypeScript, Node.js >=22 built-in `crypto`, Node test runner, static JSON registries, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-aunoskills-v0.3-secure-publishing-design.md`

## Global Constraints

- Never commit root or release private keys.
- Root private key is offline-only; repository contains public root metadata only.
- Release private key may enter only at runtime from `AUNOSKILLS_RELEASE_PRIVATE_KEY`.
- Explicit release key selection uses `AUNOSKILLS_RELEASE_KEY_ID`.
- Normal PR CI must not require signing secrets.
- Signed output must be independently verifiable with public material only.
- No silent downgrade from official verified-v2 mode to unverified v1.
- Preserve Windows/macOS/Linux and Node 22/24 support.
- Preserve existing schema-v1 compatibility for non-official legacy/custom registries.

---

### Task 1: Delegated Release-Key Validation

**Files:**
- Create: `packages/registry/src/delegated-build.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/test/delegated-build.test.ts`

**Interfaces:**
- Produces `validateDelegatedReleaseSigner(trust, rootAnchor, releaseKeyId, releasePrivateKey, now?)`.
- Produces `buildDelegatedSignedRegistry(options)` used by release scripts.
- Reuses `RegistryTrustStore`, `verifyEd25519`, `buildSignedStaticRegistry` concepts but must not self-sign trust metadata.

- [ ] Write a failing test that creates ephemeral root + release keypairs, root-signs `trust.json`, and expects an active delegated release private key to validate.
- [ ] Add failing tests for undelegated keyId, mismatched private/public key, revoked key, expired key, and tampered root-signed trust metadata.
- [ ] Run registry tests and confirm failures are due to missing delegated builder APIs.
- [ ] Implement minimal delegated signer validation using the pinned root anchor and existing trust-store/signature primitives.
- [ ] Implement `buildDelegatedSignedRegistry()` so it copies the verified root-signed trust document unchanged and signs manifests/index only with the delegated release key.
- [ ] Run registry tests and full typecheck.
- [ ] Commit `feat(registry): add delegated release signing`.

### Task 2: Deterministic Unsigned Registry Payloads

**Files:**
- Create: `packages/registry/src/unsigned-build.ts`
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/test/unsigned-build.test.ts`

**Interfaces:**
- Produces `buildUnsignedRegistryPayload(options)` returning canonical manifest bytes, bundle bytes/digests, unsigned index payload, and provenance.
- Does not accept or access private keys.

- [ ] Write failing tests asserting identical source/provenance inputs produce byte-identical unsigned payloads across repeated builds.
- [ ] Assert changing only signatures cannot change manifest/bundle SHA-256 identities.
- [ ] Implement canonical skill collection and unsigned index payload generation without secret inputs.
- [ ] Refactor delegated builder to consume unsigned payload output instead of duplicating collection logic.
- [ ] Run registry build tests and deterministic assertions.
- [ ] Commit `refactor(registry): split deterministic unsigned build`.

### Task 3: Official Root Descriptor and Client Factory

**Files:**
- Create: `packages/registry/src/official.ts`
- Create: `registry/root.json` only when valid public production metadata is available; otherwise use an explicit inactive descriptor/status contract.
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/test/official.test.ts`

**Interfaces:**
- Produces `loadOfficialRegistryTrust(base)` and `createOfficialRegistryClient(base, options)`.
- Produces `officialRegistryStatus(base)` with explicit `verified-v2` or `legacy-awaiting-production-trust` state.

- [ ] Write failing tests proving official mode cannot silently accept a user-supplied replacement anchor.
- [ ] Write a test proving active v2 official metadata creates `VerifiedRegistryClient` with pinned public root trust.
- [ ] Write a test proving missing production trust material reports an explicit inactive/legacy status instead of claiming verified v2.
- [ ] Implement official trust descriptor/client factory.
- [ ] Export the APIs and run registry tests.
- [ ] Commit `feat(registry): add official trust bootstrap`.

### Task 4: CLI Official Registry Verification Commands

**Files:**
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/cli/src/args.ts` only if a new flag is required.
- Test: `apps/cli/test/registry-security.test.ts`

**Interfaces:**
- Add `registry verify`, `registry status`, and `registry keys`.
- Extend `audit --registry` behavior using existing audit result envelope.

- [ ] Write failing CLI tests for `registry status auno`, `registry keys auno`, and `registry verify auno`.
- [ ] Assert outputs contain public key IDs/status only and never private/environment secret values.
- [ ] Add a failing test that official root anchors cannot be modified through `registry trust auno`.
- [ ] Wire reserved `auno` registry construction through `createOfficialRegistryClient()` when production v2 metadata is active.
- [ ] Implement registry verification/status/keys rendering in JSON-compatible command output.
- [ ] Extend audit registry health without changing existing installed-skill audit semantics.
- [ ] Run CLI tests and full typecheck.
- [ ] Commit `feat(cli): expose official registry verification`.

### Task 5: Release Scripts

**Files:**
- Create: `scripts/registry-build-unsigned.mjs`
- Create: `scripts/registry-sign.mjs`
- Create: `scripts/registry-verify.mjs`
- Modify: `package.json`
- Test: `test/e2e/secure-publishing.test.ts`

**Interfaces:**
- `npm run registry:unsigned` builds deterministic unsigned payloads without secrets.
- `npm run registry:sign` requires `AUNOSKILLS_RELEASE_PRIVATE_KEY` and `AUNOSKILLS_RELEASE_KEY_ID` plus valid public trust material.
- `npm run registry:verify` verifies signed output using public material only.

- [ ] Write failing E2E tests invoking unsigned build twice and comparing digests/content.
- [ ] Write failing tests for missing release key/keyId with structured safe errors.
- [ ] Write test using ephemeral runtime key env values and assert generated output does not contain the private key.
- [ ] Implement unsigned, sign, and public-only verify scripts.
- [ ] Add npm scripts and keep existing `registry:build` compatibility until official production activation.
- [ ] Run E2E tests.
- [ ] Commit `feat(release): add secure registry publishing scripts`.

### Task 6: GitHub Actions Protected Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `.github/workflows/ci.yml`
- Test: `test/security-fixtures/release-workflow.test.ts`

**Interfaces:**
- Normal CI remains secret-free.
- Release workflow signing job uses `environment: release` and runtime secrets.
- Public verification runs after signing and before packaging.

- [ ] Write a failing security-fixture test that parses `release.yml` and requires protected release environment, no secret echo, public verification after signing, and least-privilege permissions.
- [ ] Add a failing test proving normal `ci.yml` never references release private-key secrets.
- [ ] Implement release workflow with build/test -> unsigned build -> sign -> public verify -> package stages.
- [ ] Update CI to verify committed public official-registry state and deterministic unsigned digests without requiring release secrets.
- [ ] Run security fixture tests.
- [ ] Commit `ci: add protected registry signing workflow`.

### Task 7: Official Registry Activation Contract

**Files:**
- Modify: `registry/index.json`, `registry/trust.json`, `registry/manifests/**`, `registry/root.json` only when real externally provisioned public trust material exists.
- Modify: `scripts/build-registry.mjs` or current registry builder entry as necessary.
- Test: `test/e2e/dogfood-registry.test.ts`

**Interfaces:**
- Official registry is either explicitly active signed-v2 or explicitly awaiting production trust; no false verified claim.

- [ ] Add tests for the activation-state contract.
- [ ] If production root-signed public trust material is available in repository configuration, migrate official registry to v2 and verify all three starter skills through public-only verification.
- [ ] If production trust material is not available, keep v1 bundles intact but expose explicit `legacy-awaiting-production-trust` state and ensure release workflow is ready to activate without code changes.
- [ ] Confirm no private key material exists in repository tree or generated output fixtures.
- [ ] Commit `feat(registry): enforce official signing activation state`.

### Task 8: Version 0.3.0 and Documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Test: `test/e2e/package-entry.test.ts`

**Interfaces:**
- CLI reports `0.3.0`.
- Documentation distinguishes implemented secure publishing infrastructure from production-key activation state.

- [ ] Update package version and package-entry expectation to `0.3.0`.
- [ ] Document root/release key separation, rotation procedure, release environment requirements, and official activation state.
- [ ] Document that private signing keys must never be committed.
- [ ] Run package-entry test.
- [ ] Commit `release: prepare AunoSkills v0.3.0`.

### Task 9: Release Verification and Integration

**Files:**
- No new runtime files unless CI exposes a defect.
- Update PR body with exact verification evidence.

**Interfaces:**
- Exact branch head must pass all release gates before merge.

- [ ] Open PR from `feat/aunoskills-v0.3-secure-publishing` to `main` after first meaningful implementation checkpoint so CI starts early.
- [ ] Run/observe security gate and Ubuntu/macOS/Windows × Node 22/24 on the exact final head.
- [ ] Require full `npm run verify`, public registry verification, deterministic unsigned rebuild, and registry diff/activation checks to pass.
- [ ] Fix remote-only failures test-first; do not disable platform/security gates.
- [ ] Squash-merge only with `expected_head_sha` equal to the verified head.
- [ ] Wait for post-merge `main` CI and require `conclusion: success` before claiming v0.3 complete.
