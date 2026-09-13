# AunoSkills v0.4 Skill Authoring & Publishing Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete local-first `aunoskills skill` authoring lifecycle for initializing, validating, inspecting, deterministically packing, independently verifying, and preparing skills for registry publication.

**Architecture:** Add a focused `packages/authoring` package that owns source-skill and `.aunoskill` artifact logic. Keep the CLI as a parser/renderer, reuse schema/security/shared primitives, and keep registry trust/signing outside author-controlled metadata. `.aunoskill` v1 is canonical JSON containing a canonical manifest and base64 file bytes so identical source inputs produce byte-identical artifacts on Linux, macOS, and Windows.

**Tech Stack:** Node.js 22+, TypeScript 5.8, built-in `node:test`, built-in filesystem/crypto APIs, existing AunoSkills schema/shared/security/resolver modules, no new runtime npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-13-aunoskills-v0.4-skill-authoring-design.md`

## Global Constraints

- `SKILL.md` remains the agent-facing source of truth.
- Existing `SkillMetadataV1.id` is the package ID; no schema-v2 metadata bump in v0.4.
- `runtimeName` is derived from the final `/` segment of `auno.json.id`; aliases are not supported.
- `.aunoskill` v1 is canonical JSON with base64 file bytes and no timestamps, host paths, uid/gid, or native path separators.
- Authors cannot self-declare registry trust or create verified attestations.
- Validation, inspection, packing, and verification never execute skill scripts.
- Secret-like files and symlinks fail closed for publishable bundles.
- `.aunoignore` may only exclude more files; it cannot re-include mandatory blocked paths.
- `skill publish` creates author submission/workspace artifacts only; registry signing remains in the v0.2/v0.3 registry pipeline.
- No new runtime dependencies.
- CI must remain green on Ubuntu/macOS/Windows with Node 22 and 24.

---

### Task 1: Authoring schemas, identity helpers, and stable error contracts

**Files:**
- Modify: `packages/schema/src/types.ts`
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/src/index.ts`
- Modify: `packages/shared/src/errors.ts`
- Create: `packages/authoring/src/types.ts`
- Create: `packages/authoring/src/identity.ts`
- Create: `packages/authoring/src/index.ts`
- Create: `packages/authoring/test/contracts.test.ts`

**Interfaces:**
- Produces `SkillBundleManifestV1`, `SkillBundleV1`, `SkillSubmissionV1` schema types.
- Produces `validateSkillBundleManifest(input)`, `validateSkillSubmission(input)`.
- Produces `deriveRuntimeName(packageId: string): string` and `validatePackageId(packageId: string): void`.
- Later tasks rely on `AuthoringFinding`, `SkillValidationResult`, `SkillInspection`, `PackedSkillResult`, and `VerifiedSkillArtifact` from `packages/authoring/src/types.ts`.

- [ ] **Step 1: Write failing schema/identity tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRuntimeName, validatePackageId } from '../src/index.ts';
import { validateSkillBundleManifest, validateSkillSubmission } from '../../schema/src/index.ts';

test('runtimeName is derived from final package id segment', () => {
  assert.equal(deriveRuntimeName('auno/wordpress-security'), 'wordpress-security');
  assert.throws(() => validatePackageId('../escape'), /AUNO_SKILL_ID_INVALID/);
});

test('bundle and submission schemas reject malformed contracts', () => {
  assert.throws(() => validateSkillBundleManifest({ schemaVersion: 1 }), /AUNO_SKILL_ARTIFACT_INVALID/);
  assert.throws(() => validateSkillSubmission({ schemaVersion: 1 }), /AUNO_SKILL_PUBLISH_FAILED/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/authoring/test/contracts.test.ts`

Expected: FAIL because authoring exports and schema validators do not exist.

- [ ] **Step 3: Add normative authoring schema types**

Add to `packages/schema/src/types.ts`:

```ts
export interface SkillBundleFileV1 {
  path: string;
  sha256: string;
  size: number;
  contentBase64: string;
}

export interface SkillBundleManifestV1 {
  schemaVersion: 1;
  packageId: string;
  runtimeName: string;
  version: string;
  metadataDigest: string;
  capabilities?: CapabilitySet;
  dependencies?: Record<string, string>;
  files: Array<{ path: string; sha256: string; size: number }>;
}

export interface SkillBundleV1 {
  schemaVersion: 1;
  manifest: SkillBundleManifestV1;
  files: SkillBundleFileV1[];
}

export interface SkillSubmissionV1 {
  schemaVersion: 1;
  packageId: string;
  runtimeName: string;
  version: string;
  publisher?: string;
  artifact: { sha256: string; file: string };
  provenance?: { sourceRepository?: string; sourceCommit?: string };
  capabilities?: CapabilitySet;
  dependencies?: Record<string, string>;
}
```

Implement strict structural validators in `packages/schema/src/validate.ts`, export them from `index.ts`, and reject unknown/invalid mandatory values with stable AunoError codes.

- [ ] **Step 4: Add identity helpers and authoring result types**

`deriveRuntimeName()` must split only `/`, reject empty segments, `.`/`..`, drive/UNC/absolute forms, backslashes, control characters, and names unsafe on Windows. Keep package ID syntax deliberately small: lowercase ASCII letters/digits plus `-`, `_`, `.`, with at most one publisher separator `/`.

- [ ] **Step 5: Add stable error codes to shared error mapping**

Support these codes without changing existing global exit categories:

```text
AUNO_SKILL_SOURCE_INVALID
AUNO_SKILL_ID_INVALID
AUNO_SKILL_VERSION_INVALID
AUNO_SKILL_PATH_UNSAFE
AUNO_SKILL_SECRET_BLOCKED
AUNO_SKILL_CAPABILITY_MISMATCH
AUNO_SKILL_DEPENDENCY_INVALID
AUNO_SKILL_PACK_FAILED
AUNO_SKILL_ARTIFACT_INVALID
AUNO_SKILL_VERSION_EXISTS
AUNO_SKILL_PUBLISH_FAILED
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/authoring/test/contracts.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

Commit: `feat(authoring): add skill artifact contracts and identity rules`

---

### Task 2: Source initialization, inventory, ignore policy, and validation

**Files:**
- Create: `packages/authoring/src/init.ts`
- Create: `packages/authoring/src/inventory.ts`
- Create: `packages/authoring/src/validate.ts`
- Modify: `packages/authoring/src/index.ts`
- Create: `packages/authoring/test/source.test.ts`

**Interfaces:**
- Produces `initSkill(targetDir, options): Promise<{ root: string; metadata: SkillMetadataV1 }>`.
- Produces `collectSkillInventory(root): Promise<SkillSourceFile[]>`.
- Produces `validateSkillSource(root): Promise<SkillValidationResult>`.
- Later pack/inspect tasks consume the normalized `SkillSourceFile[]` inventory.

- [ ] **Step 1: Write failing init/inventory/validation tests**

```ts
test('init creates portable SKILL.md and author-only auno.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'auno-author-'));
  await initSkill(join(root, 'example-skill'), { packageId: 'demo/example-skill', version: '1.0.0' });
  const metadata = JSON.parse(await readFile(join(root, 'example-skill', 'auno.json'), 'utf8'));
  assert.equal(metadata.id, 'demo/example-skill');
  assert.equal('trust' in metadata, false);
  assert.match(await readFile(join(root, 'example-skill', 'SKILL.md'), 'utf8'), /When to use/i);
});

test('inventory blocks secrets and symlinks and honors .aunoignore', async () => {
  // create SKILL.md, auno.json, ignored.txt, .env and a symlink fixture
  await assert.rejects(() => collectSkillInventory(root), /AUNO_SKILL_SECRET_BLOCKED|AUNO_SKILL_PATH_UNSAFE/);
});
```

- [ ] **Step 2: Verify RED**

Run the source test file only. Expected failure: APIs missing.

- [ ] **Step 3: Implement original portable templates in `init.ts`**

Generated `SKILL.md` contains only original AunoSkills copy with headings:

```markdown
# <Display Name>

## Purpose
## When to use
## Workflow
## Constraints
## Verification
```

Generated `auno.json` is stable-stringified and includes `schemaVersion: 1`, `id`, `version`, optional `publisher`, display name, description, license, compatibility/topics/capabilities/dependencies only when supplied.

- [ ] **Step 4: Implement deterministic inventory**

Rules:
- recurse with `lstat`, never follow symlinks;
- normalize to POSIX-style relative paths;
- run existing `validateArchivePaths()` over the final path list;
- mandatory ignore directories/files from spec;
- block credential-like file patterns with `AUNO_SKILL_SECRET_BLOCKED`;
- parse `.aunoignore` as simple normalized glob-like exclusions supporting exact paths, directory prefixes ending `/`, and `*` wildcard within one path segment;
- lexical sort by normalized path.

- [ ] **Step 5: Implement source validation**

`validateSkillSource()` must read `auno.json`, call `validateSkillMetadata`, validate package ID and semver, require `SKILL.md`, reject any self-authored keys named `trust`, `verified`, `signature`, `integrity`, or `attestation` at the top level, and return structured findings instead of executing files.

- [ ] **Step 6: Run focused tests + typecheck**

Expected: all source tests PASS.

- [ ] **Step 7: Commit**

Commit: `feat(authoring): initialize and validate portable skill sources`

---

### Task 3: Capability inference, dependency checks, and inspection

**Files:**
- Create: `packages/authoring/src/capabilities.ts`
- Create: `packages/authoring/src/dependencies.ts`
- Create: `packages/authoring/src/inspect.ts`
- Modify: `packages/authoring/src/validate.ts`
- Modify: `packages/authoring/src/index.ts`
- Create: `packages/authoring/test/inspect.test.ts`

**Interfaces:**
- Produces `inferCapabilities(files): CapabilityInferenceResult`.
- Produces `validateSkillDependencies(metadata, localMetadata?): AuthoringFinding[]`.
- Produces `inspectSkill(root): Promise<SkillInspection>`.

- [ ] **Step 1: Write failing inference/inspection tests**

```ts
test('inspection explains undeclared dangerous capability', async () => {
  await writeFile(join(root, 'SKILL.md'), '# Skill\nRun `curl https://api.example.test` and write `.github/config.yml`.\n');
  const result = await inspectSkill(root);
  assert.equal(result.inferredCapabilities.network?.connect?.includes('api.example.test'), true);
  assert.equal(result.findings.some((f) => f.code === 'AUNO_SKILL_CAPABILITY_MISMATCH' && f.severity === 'high'), true);
});
```

- [ ] **Step 2: Verify RED**

Expected failure: `inspectSkill`/inference missing.

- [ ] **Step 3: Implement explainable heuristic inference**

Infer only high-signal patterns from UTF-8 text files with bounded file sizes. Record evidence strings/paths. Detect obvious HTTP(S) domains, environment references (`$NAME`, `${NAME}`, `process.env.NAME`), shell command snippets, Git mutation verbs, filesystem-write instructions, and agent-config paths. Never execute or parse with shell.

- [ ] **Step 4: Implement dependency validation**

Reject self-dependency and duplicate/invalid constraints using the resolver's supported semver/range parser. When local metadata is supplied, run cycle detection over only that local graph. Do not resolve/download dependencies.

- [ ] **Step 5: Implement inspection**

Return package ID, derived runtime name, version, publisher, inventory, dependencies, conflicts if represented by extension metadata, compatibility, declared capabilities, inferred capabilities, mismatch findings, portability state, and excluded/blocked policy summary.

- [ ] **Step 6: Run tests/typecheck and commit**

Commit: `feat(authoring): add explainable skill inspection`

---

### Task 4: Deterministic `.aunoskill` packing and independent verification

**Files:**
- Create: `packages/authoring/src/pack.ts`
- Create: `packages/authoring/src/verify.ts`
- Modify: `packages/authoring/src/index.ts`
- Create: `packages/authoring/test/artifact.test.ts`
- Modify: `test/security-fixtures/security.test.ts`

**Interfaces:**
- Produces `packSkill(root, options?): Promise<PackedSkillResult>`.
- Produces `verifySkillArtifact(pathOrBytes): Promise<VerifiedSkillArtifact>`.
- Artifact bytes are `Buffer.from(stableStringify(bundle), 'utf8')`.

- [ ] **Step 1: Write failing deterministic pack/verify tests**

```ts
test('packing identical source twice produces identical bytes and digest', async () => {
  const a = await packSkill(root, { outputDir: join(root, 'out-a') });
  const b = await packSkill(root, { outputDir: join(root, 'out-b') });
  assert.equal(a.sha256, b.sha256);
  assert.deepEqual(await readFile(a.path), await readFile(b.path));
});

test('verify rejects tampered file bytes', async () => {
  const packed = await packSkill(root);
  const bundle = JSON.parse(await readFile(packed.path, 'utf8'));
  bundle.files[0].contentBase64 = Buffer.from('tampered').toString('base64');
  await assert.rejects(() => verifySkillArtifact(Buffer.from(JSON.stringify(bundle))), /AUNO_SKILL_ARTIFACT_INVALID/);
});
```

- [ ] **Step 2: Verify RED**

Expected: pack/verify APIs missing.

- [ ] **Step 3: Implement canonical bundle construction**

For every inventory file, include normalized path, SHA-256, byte length, and base64 bytes. Manifest file inventory excludes `contentBase64`; it includes canonical metadata digest, declared capabilities, dependencies. Serialize the full bundle with existing `stableStringify()` and hash those exact UTF-8 bytes externally.

Do not include output files if output directory is nested under source; either require output outside root or automatically exclude the exact current output path before inventory. Prefer default output sibling `dist-skills/` and make that path a mandatory pack exclusion.

- [ ] **Step 4: Implement independent artifact verification**

Parse bytes without trusting filename. Validate bundle schema, path safety, case collisions, base64 decode, each per-file hash/size, manifest inventory equality, metadata digest, embedded `auno.json`, `SKILL.md`, identity/version consistency, and capability/dependency validation. Return `artifactValid: true` with `trust: 'unknown'` unless verified external registry attestation is explicitly supplied.

- [ ] **Step 5: Add adversarial security fixtures**

Include traversal, Windows drive path, UNC path, normalized duplicate/case collision, malformed base64, tampered file, and secret-like embedded filename. All must fail closed.

- [ ] **Step 6: Run focused/security/full tests and commit**

Commit: `feat(authoring): add deterministic skill bundles and verification`

---

### Task 5: Publication submissions and immutable registry workspaces

**Files:**
- Create: `packages/authoring/src/publish.ts`
- Modify: `packages/authoring/src/index.ts`
- Create: `packages/authoring/test/publish.test.ts`

**Interfaces:**
- Produces `createSkillSubmission(packed, metadata, provenance?): SkillSubmissionV1`.
- Produces `publishSkill(rootOrArtifact, options): Promise<PublishSkillResult>`.

- [ ] **Step 1: Write failing publish tests**

```ts
test('submission is deterministic and never claims verified trust', async () => {
  const first = await publishSkill(root, { output: join(tmp, 'one.json') });
  const second = await publishSkill(root, { output: join(tmp, 'two.json') });
  assert.deepEqual(JSON.parse(await readFile(first.submissionPath, 'utf8')), JSON.parse(await readFile(second.submissionPath, 'utf8')));
  assert.equal('trust' in first.submission, false);
});

test('workspace refuses immutable version replacement with different bytes', async () => {
  await publishSkill(root, { registryWorkspace });
  await writeFile(join(root, 'SKILL.md'), '# changed');
  await assert.rejects(() => publishSkill(root, { registryWorkspace }), /AUNO_SKILL_VERSION_EXISTS/);
});
```

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement deterministic submission descriptor**

Descriptor includes package ID, runtime name, version, publisher, exact artifact SHA/file name, optional explicitly supplied source repository/commit, capabilities, and dependencies. It must not include timestamps, credentials, trust level, signatures, or private keys.

- [ ] **Step 4: Implement writable workspace mode**

Use a simple author submission layout isolated from signed registry output:

```text
<workspace>/submissions/<publisher-or-local>/<runtimeName>/<version>/
  artifact.aunoskill
  submission.json
```

If destination exists, allow exact-byte idempotent republish only; reject different bytes with `AUNO_SKILL_VERSION_EXISTS`. Use atomic temp-write + rename helpers.

- [ ] **Step 5: Run tests and commit**

Commit: `feat(authoring): prepare immutable registry submissions`

---

### Task 6: CLI `skill *` namespace and machine-readable output

**Files:**
- Modify: `apps/cli/src/args.ts`
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/cli/test/cli.test.ts`
- Create: `test/e2e/authoring-cli.test.ts`

**Interfaces:**
- `aunoskills skill init <id> [--version <semver>] [--publisher <name>] [--output <path>]`
- `aunoskills skill validate <path>`
- `aunoskills skill inspect <path>`
- `aunoskills skill pack <path> [--output <path>]`
- `aunoskills skill verify <artifact>`
- `aunoskills skill publish <path|artifact> [--output <path>|--registry-workspace <path>] [--source-repository <url>] [--source-commit <sha>]`

- [ ] **Step 1: Write failing CLI tests first**

Assert help includes `skill`, JSON envelope command names are `skill validate`, etc., and `skill init -> validate -> pack -> verify -> publish` succeeds in an E2E temp directory.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Extend `CliArgs` with explicit authoring flags**

Add optional fields:

```ts
skillVersion?: string;
publisher?: string;
output?: string;
registryWorkspace?: string;
sourceRepository?: string;
sourceCommit?: string;
```

Parse `--version` carefully: current top-level `--version` is boolean. Preserve bare `--version` for CLI version output, but when used after `skill init` prefer a distinct authoring flag `--skill-version <semver>` to avoid ambiguity. Final public contract therefore uses `--skill-version`, not overloaded `--version`.

- [ ] **Step 4: Add `skillCommand(args, projectRoot)` dispatcher**

Keep authoring business logic in `packages/authoring`; `main.ts` only resolves paths/options and returns structured results. Add `skill` to help text.

- [ ] **Step 5: Run CLI/E2E/full tests and commit**

Commit: `feat(cli): add skill authoring lifecycle commands`

---

### Task 7: Cross-platform determinism and security release gates

**Files:**
- Create: `test/e2e/authoring-determinism.test.ts`
- Modify: `test/security-fixtures/security.test.ts`
- Modify: `.github/workflows/ci.yml` only if a dedicated artifact-determinism assertion is needed beyond `npm run verify`

**Interfaces:**
- Same repository fixture must produce one hard-coded logical artifact SHA independent of OS.

- [ ] **Step 1: Add a normalized deterministic fixture**

Construct source bytes explicitly with `writeFile(..., Buffer.from(...))`; avoid platform newline transformations in runtime-generated fixture. Assert expected SHA literal after first validated implementation run, then keep it fixed as a regression vector.

- [ ] **Step 2: Add no-secret/no-symlink/no-traversal security assertions**

Security gate must call public authoring APIs and assert the stable AunoError code, not only regex private helper behavior.

- [ ] **Step 3: Run `npm run verify` and `npm run test:security` on the branch CI matrix**

Expected: all OS/Node jobs pass with the same deterministic artifact vector.

- [ ] **Step 4: Commit**

Commit: `test(authoring): enforce portable deterministic skill artifacts`

---

### Task 8: v0.4 release metadata and documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` if present/versioned
- Modify: `apps/cli/src/main.ts`
- Modify: `test/e2e/package-entry.test.ts`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Create: `packages/authoring/README.md`

**Interfaces:**
- Public version becomes `0.4.0` consistently in package and compiled CLI.

- [ ] **Step 1: Write/update version consistency test first**

Change expected package-entry version to `0.4.0` and assert `package.json.version` equals CLI `--version`. Confirm RED before production bump.

- [ ] **Step 2: Bump package/CLI to `0.4.0` and make the test GREEN**

- [ ] **Step 3: Document the author workflow**

README Quick Start adds a concise “Author a skill” path. `packages/authoring/README.md` documents exact bundle/submission contracts. SECURITY explains that source validation and capability inference are heuristic/static and do not grant trust. CHANGELOG lists the new namespace and deterministic bundle behavior.

- [ ] **Step 4: Run full verification and commit**

Commit: `release: prepare AunoSkills v0.4.0`

---

### Task 9: Final exact-head verification, PR, merge, and post-merge verification

**Files:**
- No production changes unless verification finds a real defect.

- [ ] **Step 1: Run exact-head GitHub Actions on the feature branch**

Required jobs:
- security-gate;
- Ubuntu Node 22/24;
- macOS Node 22/24;
- Windows Node 22/24;
- full `npm run verify`;
- deterministic registry rebuild/diff.

- [ ] **Step 2: Review branch diff against `main`**

Verify only v0.4 authoring scope plus approved spec/plan/docs is present. No private keys, `.env`, credentials, fixture secrets, generated local caches, or unrelated refactors.

- [ ] **Step 3: Open PR with exact head SHA and CI run evidence**

Title: `feat: release AunoSkills v0.4.0 skill authoring toolkit`

- [ ] **Step 4: Merge with `expected_head_sha` only after exact-head CI succeeds**

Use squash merge to keep `main` release history compact.

- [ ] **Step 5: Verify post-merge GitHub Actions on the resulting `main` commit**

Do not call v0.4 complete until the post-merge run is `completed / success` across the same matrix.

---

## Plan Self-Review

- Spec coverage: all CLI commands, identity rules, source policy, deterministic bundle encoding, inference, dependencies, security boundary, publication descriptor/workspace, JSON output, tests, and release boundary have explicit tasks.
- Placeholder scan: no implementation TODO/TBD steps remain.
- Type consistency: `SkillMetadataV1.id` is consistently the package ID; `runtimeName` is derived, never independently authored. `SkillBundleV1` owns file bytes while `SkillBundleManifestV1` owns hashes/inventory. `SkillSubmissionV1` is an author claim and has no trust/signature field.
- Security consistency: registry trust/signing remains outside `packages/authoring`; no task adds signing keys, execution hooks, or trust elevation.
