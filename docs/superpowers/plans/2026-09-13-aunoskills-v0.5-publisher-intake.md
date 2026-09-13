# AunoSkills v0.5.0 Publisher Identity & Registry Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add publisher attestations, registry-controlled publisher policy, deterministic registry intake, and an authenticated idempotent remote intake client without weakening existing registry trust semantics.

**Architecture:** `packages/schema` defines the new contracts, `packages/authoring` creates publisher attestations, and `packages/registry` verifies publisher policy, performs deterministic intake, and owns remote write transport. The CLI only parses/routes/renders. Existing public registry signing remains authoritative for `verified` trust.

**Tech Stack:** TypeScript 5.8, Node.js >=22 built-ins (`crypto`, `fs`, `fetch`), Node test runner, existing stable JSON/hash/signing helpers, zero runtime npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-aunoskills-v0.5-publisher-intake-design.md`

## Global Constraints

- Target version is `0.5.0`.
- Persisted digest fields are lowercase 64-hex without `sha256:` prefixes.
- Ed25519 is the only publisher-attestation signing algorithm in v0.5.
- Publisher authentication never assigns registry `verified` trust.
- Private publisher keys are environment-only runtime inputs and are never persisted.
- Existing `SkillSubmissionV1` remains valid and unchanged.
- Existing `RegistryClient` read interface remains backward compatible.
- No new runtime npm dependencies.
- Ubuntu/macOS/Windows with Node 22/24 must pass.
- Exact-head PR CI and post-merge `main` CI are release gates.

---

## File map

**Create**
- `packages/authoring/src/attest.ts` — author-side submission digest + Ed25519 attestation creation.
- `packages/authoring/test/attest.test.ts` — attestation RED/GREEN tests.
- `packages/registry/src/publisher-policy.ts` — namespace/key lifecycle verification.
- `packages/registry/src/intake.ts` — deterministic local/CI intake + immutable accepted workspace.
- `packages/registry/src/intake-client.ts` — authenticated remote artifact/submission PUT transport.
- `packages/registry/test/publisher-policy.test.ts`
- `packages/registry/test/intake.test.ts`
- `packages/registry/test/intake-client.test.ts`
- `test/security-fixtures/publisher-intake.test.ts` — adversarial publisher/intake cases.

**Modify**
- `packages/schema/src/types.ts` — new v0.5 public contracts.
- `packages/schema/src/validate.ts` — strict validators.
- `packages/schema/src/index.ts` — exports.
- `packages/schema/test/authoring.test.ts` — schema contract tests.
- `packages/authoring/src/index.ts` — attestation exports.
- `packages/registry/src/types.ts` — intake config type only; keep `RegistryClient` read shape stable.
- `packages/registry/src/index.ts` — exports.
- `packages/registry/src/auth.ts` — reuse bearer header construction; add no persistence.
- `apps/cli/src/args.ts` — new flags.
- `apps/cli/src/skill.ts` — `attest` and `submit` routes.
- `apps/cli/src/main.ts` — registry config `intake`, `registry intake`, help/version.
- CLI/E2E tests already covering command envelopes.
- `package.json`, `README.md`, `SECURITY.md`, `CHANGELOG.md`, `packages/authoring/README.md` — release/docs.

---

### Task 1: v0.5 Schema Contracts

**Files:**
- Modify: `packages/schema/src/types.ts`
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/src/index.ts`
- Modify/Test: `packages/schema/test/authoring.test.ts`

**Interfaces:**
- Produces `PublisherAttestationV1`, `PublisherNamespacePolicyV1`, `PublisherPolicyV1`, `RegistryIntakeCandidateV1`, `RegistryIntakeEnvelopeV1`.
- Produces validators `validatePublisherAttestation`, `validatePublisherPolicy`, `validateRegistryIntakeCandidate`, `validateRegistryIntakeEnvelope`.

- [ ] **Step 1: Write failing schema tests**

Add tests equivalent to:

```ts
const attestation = validatePublisherAttestation({
  schemaVersion: 1,
  publisher: 'acme',
  packageId: 'acme/security-review',
  version: '1.0.0',
  submissionDigest: 'a'.repeat(64),
  artifactDigest: 'b'.repeat(64),
  signature: { keyId: 'acme-2026', algorithm: 'ed25519', signature: 'c2ln' },
});
assert.equal(attestation.packageId, 'acme/security-review');
assert.throws(() => validatePublisherAttestation({ ...attestation, submissionDigest: 'sha256:bad' }));
```

Also reject malformed namespace policy, duplicate key IDs, unsupported algorithms, invalid key lifecycle timestamps, non-relative candidate artifact paths, and malformed intake envelopes.

- [ ] **Step 2: Push the RED checkpoint and verify CI/test failure is caused by missing v0.5 types/validators**

Expected failure: TypeScript/test import errors for the new validators/types, not unrelated baseline failures.

- [ ] **Step 3: Implement the minimal public types and strict validators**

Use exact shapes from the spec. Reuse existing helpers for object assertions, semver, signatures, key timestamps, and capability/dependency validation. Digest validation must use `/^[0-9a-f]{64}$/`.

- [ ] **Step 4: Run the schema/unit gate on the exact head**

Expected: schema tests and typecheck pass.

- [ ] **Step 5: Commit**

Commit message: `feat(schema): add publisher intake contracts`

---

### Task 2: Publisher Attestation Creation

**Files:**
- Create: `packages/authoring/src/attest.ts`
- Create/Test: `packages/authoring/test/attest.test.ts`
- Modify: `packages/authoring/src/index.ts`

**Interfaces:**
- Consumes `SkillSubmissionV1`, `PublisherAttestationV1`.
- Produces:

```ts
export function canonicalSubmissionDigest(submission: SkillSubmissionV1): string;
export function publisherAttestationPayload(input: {
  publisher: string;
  packageId: string;
  version: string;
  submissionDigest: string;
  artifactDigest: string;
}): Buffer;
export function createPublisherAttestation(
  submission: SkillSubmissionV1,
  options: { keyId: string; privateKey: string },
): PublisherAttestationV1;
export async function attestSkillSubmission(
  submissionPath: string,
  options: { keyId: string; privateKeyEnv?: string; output?: string },
): Promise<{ attestation: PublisherAttestationV1; attestationPath: string }>;
```

- [ ] **Step 1: Write failing tests for deterministic digest and domain-separated Ed25519 signing**

Generate an ephemeral Ed25519 keypair in the test, export PKCS8/SPKI base64, sign the same canonical submission twice, and assert identical attestation fields/signature. Assert modifying `artifact.sha256` changes both submission digest and signature verification result.

- [ ] **Step 2: Verify RED**

Expected: missing attestation implementation.

- [ ] **Step 3: Implement canonical digest + signing**

Use `stableStringify(submission)` with no newline, SHA-256 hex, Node `crypto.sign(null, payload, privateKey)`, and the domain string `aunoskills.publisher-attestation.v1`. Read the private key from `process.env[privateKeyEnv ?? 'AUNOSKILLS_PUBLISHER_PRIVATE_KEY']`; missing material throws `AUNO_PUBLISHER_KEY_REQUIRED` without echoing the value.

- [ ] **Step 4: Run authoring tests**

Expected: deterministic sign/digest tests pass and existing v0.4 authoring tests remain green.

- [ ] **Step 5: Commit**

Commit message: `feat(authoring): add publisher attestations`

---

### Task 3: Registry-Controlled Publisher Policy Verification

**Files:**
- Create: `packages/registry/src/publisher-policy.ts`
- Create/Test: `packages/registry/test/publisher-policy.test.ts`
- Modify: `packages/registry/src/index.ts`

**Interfaces:**
- Produces:

```ts
export interface PublisherVerificationResult {
  required: boolean;
  verified: boolean;
  keyId?: string;
}

export function verifyPublisherAttestation(input: {
  submission: SkillSubmissionV1;
  attestation?: PublisherAttestationV1;
  policy: PublisherPolicyV1;
  now?: Date;
}): PublisherVerificationResult;
```

- [ ] **Step 1: Write failing policy tests**

Cover valid key, missing required attestation, author-supplied unknown key, revoked key, expired key, not-yet-valid key, publisher/package namespace mismatch, and explicit unsigned namespace policy.

- [ ] **Step 2: Verify RED**

Expected: missing policy verifier.

- [ ] **Step 3: Implement fail-closed policy verification**

Derive namespace from `packageId.split('/')[0]`. Require submission publisher, when present, to match. Select key only from registry policy. Recompute canonical submission digest and domain-separated payload; verify with Node `crypto.verify`. Reuse existing key-time parsing semantics from registry trust code where possible.

- [ ] **Step 4: Run registry policy tests**

Expected: all positive/negative key lifecycle tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat(registry): verify publisher namespace policy`

---

### Task 4: Deterministic Registry Intake and Immutable Accepted Workspace

**Files:**
- Create: `packages/registry/src/intake.ts`
- Create/Test: `packages/registry/test/intake.test.ts`
- Modify: `packages/registry/src/index.ts`

**Interfaces:**
- Produces:

```ts
export interface RegistryIntakeOptions {
  artifactPath: string;
  submissionPath: string;
  attestationPath?: string;
  policyPath: string;
  acceptedWorkspace: string;
  now?: Date;
}

export async function intakeSkillSubmission(
  options: RegistryIntakeOptions,
): Promise<{
  candidate: RegistryIntakeCandidateV1;
  candidatePath: string;
  artifactPath: string;
}>;
```

- [ ] **Step 1: Write failing intake tests**

Build a v0.4 artifact/submission fixture, sign it with a permitted publisher key, intake it, assert candidate bytes equal `stableStringify(candidate) + '\n'`, and assert accepted paths are repository/workspace-relative. Re-run identical intake and assert idempotence. Change artifact digest for the same package/version and assert `AUNO_REGISTRY_VERSION_EXISTS`.

- [ ] **Step 2: Verify RED**

Expected: missing intake implementation.

- [ ] **Step 3: Implement intake pipeline**

Call `verifySkillArtifact` for artifact bytes; `validateSkillSubmission` for descriptor; check exact package/version/runtime/artifact correspondence; validate exact source commit syntax when present; load policy; call `verifyPublisherAttestation`; construct deterministic candidate; copy artifact content-addressably; write accepted record atomically with absent-or-equal semantics.

- [ ] **Step 4: Run intake tests**

Expected: round-trip, idempotency, conflict, tamper, and provenance tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat(registry): add deterministic publisher intake`

---

### Task 5: Authenticated Remote Intake Client

**Files:**
- Create: `packages/registry/src/intake-client.ts`
- Create/Test: `packages/registry/test/intake-client.test.ts`
- Modify: `packages/registry/src/types.ts`
- Modify: `packages/registry/src/auth.ts`
- Modify: `packages/registry/src/index.ts`

**Interfaces:**
- Extend registry configuration shape with optional `intake?: { url: string }` without changing `RegistryClient` methods.
- Produce:

```ts
export interface RemoteIntakeRequest {
  intakeUrl: string;
  auth?: RegistryAuthConfig;
  artifact: Buffer;
  submission: SkillSubmissionV1;
  attestation?: PublisherAttestationV1;
  fetchImpl?: RegistryFetch;
}

export async function submitToRegistryIntake(
  request: RemoteIntakeRequest,
): Promise<{
  artifactStatus: number;
  submissionStatus: number;
  artifactDigest: string;
  submissionDigest: string;
  remoteReference?: string;
}>;
```

- [ ] **Step 1: Write failing transport tests**

Use injected fetch to assert exactly two PUTs, encoded URL components, content types, deterministic `Idempotency-Key`, bearer token read from env at request time, and exact artifact bytes. Add failures for `401`, `403`, `409`, `422`, cross-origin redirect response, malformed/oversized response body, and missing intake URL.

- [ ] **Step 2: Verify RED**

Expected: missing client and intake config types.

- [ ] **Step 3: Implement the minimal remote client**

Locally validate artifact/submission/attestation before network. Resolve auth via the existing env-based helper. Use `redirect: 'manual'`. Treat 200/201 as success. Map 401/403 to `AUNO_REGISTRY_INTAKE_AUTH`, 409 to `AUNO_REGISTRY_INTAKE_CONFLICT`, 422 to `AUNO_REGISTRY_INTAKE_INVALID`, and other non-2xx to `AUNO_REGISTRY_INTAKE_UNAVAILABLE`. Cap diagnostic response text before constructing errors.

- [ ] **Step 4: Run registry transport tests**

Expected: transport and existing auth-redaction tests pass.

- [ ] **Step 5: Commit**

Commit message: `feat(registry): add remote intake transport`

---

### Task 6: CLI Routes and Machine-Readable Output

**Files:**
- Modify: `apps/cli/src/args.ts`
- Modify: `apps/cli/src/skill.ts`
- Modify: `apps/cli/src/main.ts`
- Modify/Test: existing CLI and `test/e2e` command lifecycle tests

**Interfaces:**
- New flags: `publisherKeyId`, `publisherKeyEnv`, `submission`, `attestation`, `publishRegistry`, `publisherPolicy`, `acceptedWorkspace`.
- New commands: `skill attest`, `skill submit`, `registry intake`.

- [ ] **Step 1: Write failing CLI/E2E tests**

Verify `--json` envelopes for all three commands, missing-flag usage errors, `--offline skill submit` failing before injected fetch, reserved `auno` direct submission denial without advertised intake, and no secret values in stderr/JSON.

- [ ] **Step 2: Verify RED**

Expected: unknown flags/commands.

- [ ] **Step 3: Implement argument parsing and thin routes**

`skill attest` calls `attestSkillSubmission`; `skill submit` loads configured registry intake/auth and calls `submitToRegistryIntake`; `registry intake` resolves local paths and calls `intakeSkillSubmission`. Keep business logic out of CLI files.

- [ ] **Step 4: Run CLI/E2E tests**

Expected: new command envelopes pass, existing commands remain compatible.

- [ ] **Step 5: Commit**

Commit message: `feat(cli): expose publisher intake workflow`

---

### Task 7: Adversarial Security and Cross-Platform Determinism Gates

**Files:**
- Create: `test/security-fixtures/publisher-intake.test.ts`
- Modify: existing cross-platform authoring/CI fixtures as needed

**Interfaces:**
- Locks one normalized fixture to one canonical submission digest, one publisher-attestation payload digest, and one accepted-candidate digest.

- [ ] **Step 1: Add security fixtures that initially expose missing hardening**

Cover tampered descriptor, tampered artifact, wrong artifact digest, unknown/self-supplied key, revoked/expired key, namespace mismatch, token redaction, traversal-like publisher/runtime/version values, cross-origin redirect, and same-version immutable conflict.

- [ ] **Step 2: Run the security gate and inspect each failure**

Expected: only genuinely uncovered hardening cases fail.

- [ ] **Step 3: Apply minimal hardening in owning modules**

Do not patch CLI to hide library defects. Validation belongs in schema/policy/intake/client modules.

- [ ] **Step 4: Add golden cross-platform digest expectations**

Compute digests from canonical fixture bytes and lock the exact lowercase hex values in tests. Confirm at least Ubuntu + Windows before accepting the golden values; full matrix must later confirm macOS.

- [ ] **Step 5: Run security + E2E gates**

Expected: zero failures.

- [ ] **Step 6: Commit**

Commit message: `test: harden publisher intake supply chain`

---

### Task 8: Release Metadata and Documentation

**Files:**
- Modify: `package.json`
- Modify: `apps/cli/src/main.ts`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Modify: `packages/authoring/README.md`
- Create or modify registry package documentation if a package README exists
- Modify: package-entry/version expectation tests

**Interfaces:**
- Package and CLI version both exactly `0.5.0`.

- [ ] **Step 1: Change only version expectation test to `0.5.0` and verify RED**

Expected: release-version test fails while build remains otherwise healthy.

- [ ] **Step 2: Bump `package.json` and CLI `VERSION` to `0.5.0`**

- [ ] **Step 3: Verify version test GREEN**

- [ ] **Step 4: Update docs**

README must document `publish -> attest -> submit -> registry intake -> registry signing`, four trust states, remote intake config, and v0.5 project status. SECURITY must document runtime-only publisher keys, namespace policy, auth redaction, and cross-origin redirect behavior. CHANGELOG must describe v0.5 and its non-goals.

- [ ] **Step 5: Run `npm run verify` on GitHub Actions exact head**

Expected: full verification success.

- [ ] **Step 6: Commit**

Commit message: `release: prepare AunoSkills v0.5.0`

---

### Task 9: Exact-Head Review, PR, Squash Merge, and Post-Merge Verification

**Files:** none unless verification finds a concrete defect.

- [ ] **Step 1: Freeze the candidate SHA**

No further writes while validating this SHA.

- [ ] **Step 2: Require exact-head CI success**

Verify security-gate plus Ubuntu/macOS/Windows × Node 22/24, full verify, deterministic registry rebuild, and registry diff gate.

- [ ] **Step 3: Self-review spec coverage**

Confirm every completion criterion and invariant maps to implemented code/test/docs. Do not infer completion from CI alone.

- [ ] **Step 4: Open PR to `main`**

PR body must name the exact head SHA, CI run ID, security boundary, new CLI commands, schema contracts, and remote protocol.

- [ ] **Step 5: Re-check PR mergeability and exact head**

Use expected-head protection when merging.

- [ ] **Step 6: Squash merge**

Commit title: `feat: release AunoSkills v0.5.0 publisher intake`

- [ ] **Step 7: Require post-merge `main` CI success**

Do not claim v0.5 complete until the CI run for the resulting `main` commit is `completed / success` across all jobs.
