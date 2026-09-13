# AunoSkills v0.4 Skill Authoring & Publishing Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete local skill-author workflow — `init`, `validate`, `inspect`, deterministic `pack`, independent `verify`, and publish-ready `publish` — without weakening registry trust or adding runtime dependencies.

**Architecture:** Add a focused `packages/authoring` package that owns source-skill inspection and `.aunoskill` artifact logic. Normative bundle/submission contracts live in `packages/schema`; the CLI only parses/renders and calls authoring APIs. `.aunoskill` v1 is canonical JSON whose file bytes are base64 encoded, so identical input yields byte-identical artifacts on Linux, macOS, and Windows.

**Tech Stack:** Node.js 22+, TypeScript 5.8, Node built-ins (`fs`, `path`, `crypto`), existing AunoSkills schema/shared/security primitives, Node test runner, GitHub Actions OS × Node 22/24 matrix.

**Spec:** `docs/superpowers/specs/2026-09-13-aunoskills-v0.4-skill-authoring-design.md`

## Global Constraints

- No runtime npm dependencies.
- `SKILL.md` remains the agent-facing source of truth.
- Existing `SkillMetadataV1.id` is the package ID; `runtimeName` is derived from the final `/` segment and is not an overridable metadata field in v0.4.
- `.aunoskill` v1 is canonical JSON with sorted normalized paths and base64 file payloads.
- No timestamps, uid/gid, host paths, path separators, or other volatile metadata may influence artifact bytes.
- Validation/pack/verify must never execute skill code.
- Secret-like files and symlinks are fail-closed for publishable bundles.
- Authors cannot self-declare `verified`; registry signing/trust remains outside authoring.
- `--yes` cannot bypass path safety, secret blocking, immutable-version collisions, or integrity checks.
- Existing installer/resolver/registry/materialization behavior and exit-code categories remain backward compatible.
- CI must remain green on Ubuntu/macOS/Windows × Node 22/24.

---

### Task 1: Authoring Schema Contracts

**Files:**
- Modify: `packages/schema/src/types.ts`
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/test/authoring.test.ts`

**Interfaces:**
- Produces: `SkillBundleManifestV1`, `SkillBundleV1`, `SkillSubmissionV1`.
- Produces: `validateSkillBundleManifest(value)`, `validateSkillBundle(value)`, `validateSkillSubmission(value)`.
- Later tasks consume these contracts directly; no duplicate authoring schema types may be declared elsewhere.

- [ ] **Step 1: Write the failing schema tests**

Create `packages/schema/test/authoring.test.ts` with cases equivalent to:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSkillBundle,
  validateSkillBundleManifest,
  validateSkillSubmission,
} from '../src/index.ts';

test('validates a deterministic skill bundle manifest', () => {
  const manifest = validateSkillBundleManifest({
    schemaVersion: 1,
    packageId: 'auno/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    metadataDigest: 'a'.repeat(64),
    files: [{ path: 'SKILL.md', sha256: 'b'.repeat(64), size: 10 }],
    capabilities: {},
    dependencies: {},
  });
  assert.equal(manifest.runtimeName, 'example-skill');
});

test('rejects a bundle whose file inventory is malformed', () => {
  assert.throws(() => validateSkillBundle({
    schemaVersion: 1,
    manifest: {},
    files: [{ path: '../secret', contentBase64: 'eA==' }],
  }));
});

test('validates a publication submission without trust assertions', () => {
  const submission = validateSkillSubmission({
    schemaVersion: 1,
    packageId: 'auno/example-skill',
    runtimeName: 'example-skill',
    version: '1.0.0',
    publisher: 'auno',
    artifact: { sha256: 'c'.repeat(64), file: 'example-skill-1.0.0.aunoskill' },
    capabilities: {},
    dependencies: {},
  });
  assert.equal(submission.packageId, 'auno/example-skill');
});
```

- [ ] **Step 2: Run the targeted test and confirm RED**

Run: `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/schema/test/authoring.test.ts`

Expected: FAIL because the three validators/types do not exist.

- [ ] **Step 3: Add the normative types**

Add to `packages/schema/src/types.ts`:

```ts
export interface SkillBundleFileV1 {
  path: string;
  sha256: string;
  size: number;
}

export interface SkillBundleManifestV1 {
  schemaVersion: 1;
  packageId: string;
  runtimeName: string;
  version: string;
  metadataDigest: string;
  files: SkillBundleFileV1[];
  capabilities: CapabilitySet;
  dependencies: Record<string, string>;
}

export interface SkillBundleV1 {
  schemaVersion: 1;
  manifest: SkillBundleManifestV1;
  files: Array<{ path: string; contentBase64: string }>;
}

export interface SkillSubmissionV1 {
  schemaVersion: 1;
  packageId: string;
  runtimeName: string;
  version: string;
  publisher?: string;
  artifact: { sha256: string; file: string };
  provenance?: { sourceRepository?: string; sourceCommit?: string };
  capabilities: CapabilitySet;
  dependencies: Record<string, string>;
}
```

Add validators in `validate.ts` that enforce schemaVersion 1, lowercase portable IDs/names, strict 64-char lowercase hex SHA-256 strings, normalized relative file paths, non-negative integer sizes, and reject extra trust/signature fields in submission input.

- [ ] **Step 4: Export the contracts and rerun targeted tests**

Run the same test command.

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Commit message: `feat(schema): add skill authoring artifact contracts`

---

### Task 2: Source Inventory, Path Policy, and Skill Initialization

**Files:**
- Create: `packages/authoring/src/types.ts`
- Create: `packages/authoring/src/identity.ts`
- Create: `packages/authoring/src/inventory.ts`
- Create: `packages/authoring/src/init.ts`
- Create: `packages/authoring/src/index.ts`
- Test: `packages/authoring/test/init-inventory.test.ts`

**Interfaces:**
- Produces: `deriveRuntimeName(packageId: string): string`.
- Produces: `buildSkillInventory(root: string, options?: { ignorePatterns?: string[] }): Promise<SkillInventory>`.
- Produces: `initSkill(root: string, input: InitSkillInput): Promise<InitSkillResult>`.
- `SkillInventory.files` is sorted lexically by normalized POSIX path.

- [ ] **Step 1: Write failing tests for identity, init, exclusions, secrets, and symlinks**

Test cases must assert:

```ts
assert.equal(deriveRuntimeName('auno/wordpress-security'), 'wordpress-security');
assert.throws(() => deriveRuntimeName('AUNO/Bad Name'));
```

For `initSkill`, use a temporary directory and assert exact existence of `SKILL.md` and `auno.json`, with `auno.json.id === 'auno/example-skill'` and no `trust`, `signature`, or `integrity` fields.

For inventory, create `.git/x`, `node_modules/x`, `.env`, `safe.txt`, and a symlink fixture. Assert ignored normal build/vendor paths do not enter inventory, `.env` returns an `AUNO_SKILL_SECRET_BLOCKED` finding, and any symlink returns `AUNO_SKILL_PATH_UNSAFE` rather than being followed.

- [ ] **Step 2: Run targeted tests and confirm RED**

Run: `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/authoring/test/init-inventory.test.ts`

Expected: FAIL because `packages/authoring` does not exist.

- [ ] **Step 3: Implement portable identity rules**

`deriveRuntimeName()` must require package IDs matching the v0.4 portable grammar:

```text
^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*$
```

The runtime name is the final segment. Reject `.`, `..`, Windows reserved device names, slash/backslash inside the final segment, trailing dot/space, and case-insensitive names that are non-portable.

- [ ] **Step 4: Implement source inventory policy**

Use `lstat` + recursive directory enumeration. Normalize all relative paths with `/`; sort lexically; reject symlinks; never follow entries outside root. Mandatory excluded path segments/files:

```text
.git/
.aunoskills/state/
node_modules/
vendor/
dist/
build/
coverage/
.tmp/
tmp/
.DS_Store
Thumbs.db
```

Secret-like patterns must be blocked rather than silently packed:

```text
.env
.env.*
*.pem
*.key
id_rsa*
id_ed25519*
credentials*.json
service-account*.json
```

Implement a minimal `.aunoignore` supporting blank/comment lines, exact relative paths, directory suffix `/`, and `*` wildcard within one path segment. It may only exclude; it cannot re-include blocked secret files.

- [ ] **Step 5: Implement `initSkill()`**

Create an original, concise `SKILL.md` template containing `Purpose`, `Use this skill when`, `Workflow`, `Constraints`, and `Verification`. Write canonical `auno.json` through existing `stableStringify()` using:

```ts
{
  schemaVersion: 1,
  id: input.packageId,
  version: input.version ?? '0.1.0',
  publisher: input.publisher ?? input.packageId.split('/')[0],
  displayName: input.displayName ?? runtimeName,
  description: input.description ?? `Guidance for ${runtimeName}`,
  license: input.license ?? 'Apache-2.0',
  capabilities: {},
  dependencies: {},
}
```

Refuse to overwrite non-empty existing source directories unless an explicit safe option is later added; v0.4 default is fail-closed.

- [ ] **Step 6: Rerun targeted tests**

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Commit message: `feat(authoring): add skill init and secure inventory`

---

### Task 3: Source Validation, Capability Inference, and Inspect

**Files:**
- Create: `packages/authoring/src/capabilities.ts`
- Create: `packages/authoring/src/validate.ts`
- Create: `packages/authoring/src/inspect.ts`
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/index.ts`
- Test: `packages/authoring/test/validate-inspect.test.ts`

**Interfaces:**
- Produces: `validateSkillSource(root: string): Promise<SkillValidationResult>`.
- Produces: `inspectSkillSource(root: string): Promise<SkillInspection>`.
- Produces: `inferCapabilities(files: Array<{ path: string; bytes: Buffer }>): CapabilityInference`.
- Findings use `{ code, severity, category, message, path?, details? }`.

- [ ] **Step 1: Write failing behavior tests**

Fixtures must cover:

1. valid portable skill → `valid === true`.
2. missing `SKILL.md` → ERROR `AUNO_SKILL_SOURCE_INVALID`.
3. invalid `auno.json.id` → ERROR `AUNO_SKILL_ID_INVALID`.
4. invalid semver → ERROR `AUNO_SKILL_VERSION_INVALID`.
5. metadata with `trust: 'verified'` → ERROR `AUNO_SKILL_SOURCE_INVALID`.
6. self dependency → ERROR `AUNO_SKILL_DEPENDENCY_INVALID`.
7. `SKILL.md` containing `curl https://api.example.com` with no network capability → HIGH `AUNO_SKILL_CAPABILITY_MISMATCH`.
8. inspect returns declared/inferred capabilities, sorted inventory, exclusions, findings, `packageId`, derived `runtimeName`, and version.

- [ ] **Step 2: Run targeted test and confirm RED**

Run: `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/authoring/test/validate-inspect.test.ts`

- [ ] **Step 3: Implement conservative explainable capability inference**

Heuristics may only emit evidence-backed capability hints. Detect:

- `http://` / `https://`, `curl`, `wget`, `fetch(` → network.
- shell fences, `bash`, `sh`, `powershell`, `cmd.exe` → shell/process.
- `$ENV`, `${ENV}`, `process.env.X` → env reads.
- `git commit`, `git push`, `git checkout`, `git branch` → git write.
- file mutation commands or APIs (`writeFile`, `rm`, `mv`, `cp`, output redirection) → filesystem write.
- explicit secret terms paired with env references → secret request review.

Each inferred item must include source path + short evidence string; inference never grants permission.

- [ ] **Step 4: Implement validation**

Read/parse `auno.json`, call existing `validateSkillMetadata`, then apply authoring-specific rules: package ID grammar, derived runtime name, semver using existing resolver range/version utilities where available, reject authority fields (`trust`, signatures, integrity attestations), dependency self-reference/duplicates/conflict overlap, inventory findings, and capability mismatch findings.

Validation must return all findings in deterministic order instead of stopping at the first non-fatal issue.

- [ ] **Step 5: Implement inspect as a read-only projection of validation**

`inspectSkillSource()` must not write files. Return metadata, derived runtime name, inventory count/paths, declared capabilities, inferred capabilities/evidence, dependencies, compatibility, exclusions, portability state, and validation findings.

- [ ] **Step 6: Rerun targeted tests and commit**

Expected: PASS.

Commit: `feat(authoring): validate and inspect skill sources`

---

### Task 4: Deterministic `.aunoskill` Pack and Independent Verify

**Files:**
- Create: `packages/authoring/src/pack.ts`
- Create: `packages/authoring/src/verify.ts`
- Modify: `packages/authoring/src/index.ts`
- Test: `packages/authoring/test/pack-verify.test.ts`
- Test: `test/security-fixtures/authoring-artifact.test.ts`

**Interfaces:**
- Produces: `packSkill(root: string, options?: { outputPath?: string }): Promise<PackSkillResult>`.
- Produces: `verifySkillArtifact(path: string): Promise<VerifySkillArtifactResult>`.
- Bundle bytes are `Buffer.from(stableStringify(bundle), 'utf8')` and artifact identity is SHA-256 of those exact bytes.

- [ ] **Step 1: Write deterministic pack tests**

Create a source fixture with text + binary bytes. Assert:

```ts
const first = await packSkill(root, { outputPath: firstPath });
const second = await packSkill(root, { outputPath: secondPath });
assert.equal(first.sha256, second.sha256);
assert.deepEqual(await readFile(firstPath), await readFile(secondPath));
```

Also assert lexical manifest file ordering, POSIX paths, no timestamps, and default name `<runtimeName>-<version>.aunoskill`.

- [ ] **Step 2: Write independent tamper tests**

After packing, parse canonical JSON and alter one file payload without updating the manifest. `verifySkillArtifact()` must return `artifactValid: false` with integrity finding. Add malformed path, duplicate path, case collision, missing `SKILL.md`, invalid embedded `auno.json`, and secret-like path cases.

- [ ] **Step 3: Confirm RED**

Run both targeted tests; expect missing pack/verify APIs.

- [ ] **Step 4: Implement deterministic pack**

Require `validateSkillSource(root).valid === true`. For each included file, preserve exact bytes and encode base64. Manifest inventory contains path, SHA-256, and byte length. `metadataDigest` is SHA-256 of canonical parsed `auno.json`, not raw whitespace. Serialize the full `SkillBundleV1` with `stableStringify`; write atomically; calculate artifact SHA-256 from exact serialized bytes.

The whole artifact hash must not appear inside the bundle itself.

- [ ] **Step 5: Implement independent verification**

Verifier must treat the artifact as untrusted input. Parse JSON, call schema validators, normalize/recheck every path, detect duplicate/case collisions, decode base64 strictly, compare each file length/hash to manifest, require exact inventory correspondence, revalidate embedded metadata, require `SKILL.md`, and independently rerun authoring security checks over reconstructed virtual files.

Return default trust as `untrusted`; never infer `verified` from artifact contents.

- [ ] **Step 6: Run authoring + security tests**

Run:

```bash
node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/authoring/test/pack-verify.test.ts test/security-fixtures/authoring-artifact.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Commit: `feat(authoring): add deterministic skill artifacts`

---

### Task 5: Publish Submission and Immutable Registry Workspace Output

**Files:**
- Create: `packages/authoring/src/publish.ts`
- Modify: `packages/authoring/src/index.ts`
- Test: `packages/authoring/test/publish.test.ts`

**Interfaces:**
- Produces: `createSkillSubmission(input: PublishSubmissionInput): Promise<SkillSubmissionV1>`.
- Produces: `publishSkill(input: PublishSkillInput): Promise<PublishSkillResult>`.
- Workspace layout:

```text
<registry-workspace>/submissions/<publisher>/<runtimeName>/<version>/
  artifact.aunoskill
  submission.json
```

- [ ] **Step 1: Write failing submission/workspace tests**

Assert submission JSON contains exact artifact digest, package ID, derived runtime name, author publisher, declared capabilities/dependencies, optional source repo/commit, and contains no `trust`, signature, private key, bearer token, or environment-variable value.

Workspace publish test must succeed once, succeed idempotently when existing bytes are identical, and throw `AUNO_SKILL_VERSION_EXISTS` if the same package/version path exists with different artifact bytes or descriptor content.

- [ ] **Step 2: Confirm RED**

Run: `node --disable-warning=ExperimentalWarning --experimental-transform-types --test packages/authoring/test/publish.test.ts`

- [ ] **Step 3: Implement deterministic submission creation**

Always verify the packed artifact first. Create `SkillSubmissionV1` solely from verified artifact metadata + explicit provenance inputs. Serialize with `stableStringify`.

- [ ] **Step 4: Implement immutable workspace publishing**

Create destination directories safely. Before any write, if target files exist, compare exact bytes. Identical = idempotent success; different = `AUNO_SKILL_VERSION_EXISTS`. Use atomic writes; never delete/overwrite an immutable prior version.

- [ ] **Step 5: Rerun test and commit**

Expected: PASS.

Commit: `feat(authoring): add publish submissions and workspace output`

---

### Task 6: CLI `skill` Namespace

**Files:**
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/cli/src/args.ts` only if new value flags are required
- Test: `apps/cli/test/skill-cli.test.ts`
- Test: `test/e2e/skill-authoring.test.ts`

**Interfaces:**
- CLI routes only; all business logic must call `packages/authoring` APIs.
- Commands: `skill init`, `skill validate`, `skill inspect`, `skill pack`, `skill verify`, `skill publish`.

- [ ] **Step 1: Write CLI RED tests**

Test non-interactive flows:

```text
aunoskills skill init auno/example-skill --project <tmp>
aunoskills skill validate <skillDir> --json
aunoskills skill inspect <skillDir> --json
aunoskills skill pack <skillDir> --output <artifact>
aunoskills skill verify <artifact> --json
aunoskills skill publish <skillDir> --output <submission>
```

Assert stable envelope `command` values (`skill init`, `skill validate`, etc.), exit code behavior, and no authoring logic duplicated in the CLI test fixtures.

- [ ] **Step 2: Confirm RED**

Run targeted CLI/E2E tests and expect `Unknown command: skill` or equivalent.

- [ ] **Step 3: Add required flags to parser**

Only add flags actually needed by spec:

```text
--output <path>
--registry-workspace <path>
--publisher <name>
--version <semver>
--description <text>
--license <spdx-ish string>
--source-repository <url>
--source-commit <sha>
```

Do not add interactive wizard dependencies.

- [ ] **Step 4: Add `skillCommand()` router**

`main.ts` should import authoring public APIs and route subcommands. `skill init` interprets first positional after action as package ID; default source path is `<projectRoot>/<runtimeName>` unless an explicit output/directory flag is present. `skill publish --output` creates artifact beside or in temp-authoring state only long enough to write the submission; no secret state is persisted.

Update `helpText()` with concise `skill` namespace documentation.

- [ ] **Step 5: Run targeted tests and commit**

Expected: PASS.

Commit: `feat(cli): add skill authoring command namespace`

---

### Task 7: Cross-Platform and Adversarial Release Gates

**Files:**
- Create: `test/security-fixtures/authoring-source.test.ts`
- Modify: `test/e2e/skill-authoring.test.ts`
- Modify: `.github/workflows/ci.yml` only if existing globs do not already include the new tests

**Interfaces:**
- No new product API; this task locks v0.4 invariants into release gates.

- [ ] **Step 1: Add source security fixtures**

Cover traversal-like names where constructible, Windows drive/UNC strings inside malicious artifact inputs, case collisions, secret file names, symlinks, self-dependency, self-asserted trust fields, capability mismatch, and malformed base64/artifact manifest.

- [ ] **Step 2: Add deterministic E2E round trip**

The E2E test must perform:

```text
init -> validate -> inspect -> pack -> verify -> publish submission -> publish workspace
```

and assert artifact digest remains identical on a second pack of unchanged input.

- [ ] **Step 3: Run security + E2E gates**

Run:

```bash
npm run build
npm run test:security
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 4: Commit Task 7**

Commit: `test: add v0.4 authoring security and e2e gates`

---

### Task 8: Release Metadata, Documentation, and v0.4 Version

**Files:**
- Modify: `package.json`
- Modify: `apps/cli/src/main.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `SECURITY.md`
- Create: `packages/authoring/README.md`
- Test: existing package-entry/version consistency tests

**Interfaces:**
- Package and CLI version both become `0.4.0`.

- [ ] **Step 1: Make version-consistency test RED for 0.4.0**

Update the existing package-entry version expectation to `0.4.0` before changing production metadata. Confirm the single intended failure.

- [ ] **Step 2: Bump package and CLI versions**

Set `package.json.version` and CLI `VERSION` to `0.4.0`; update lock metadata only if the repository has a committed npm lockfile requiring it.

- [ ] **Step 3: Document the author workflow accurately**

README quick docs must show `skill init/validate/pack/verify/publish` without claiming a hosted marketplace. `SECURITY.md` must explain that artifact validity is not registry trust and authoring never executes skill code. `packages/authoring/README.md` documents module boundaries and canonical JSON artifact format. CHANGELOG records v0.4 behavior and compatibility boundary.

- [ ] **Step 4: Run package-entry and targeted docs-sensitive verification**

Run package-entry E2E test and `npm run format:check`.

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

Commit: `release: prepare AunoSkills v0.4.0`

---

### Task 9: Full Verification, PR, Merge, and Post-Merge Gate

**Files:**
- No product-file changes unless verification reveals a defect.

**Interfaces:**
- Final candidate SHA must be immutable while exact-head CI runs.

- [ ] **Step 1: Run the complete release verification on the branch**

GitHub Actions must execute the existing matrix:

```text
security-gate
Ubuntu  × Node 22/24
macOS   × Node 22/24
Windows × Node 22/24
```

Every matrix job must pass `npm run verify`, deterministic `registry:build`, and registry diff gate.

- [ ] **Step 2: Review exact-head evidence**

Do not merge based on an earlier commit. Confirm workflow `head_sha` equals the PR head and overall conclusion is `success`.

- [ ] **Step 3: Open/update PR with v0.4 scope and security boundary**

PR summary must state that `.aunoskill` validity does not confer verified trust and that no runtime dependencies/private signing keys were added.

- [ ] **Step 4: Squash merge with expected head SHA**

Use GitHub merge with `expected_head_sha` equal to the verified PR head.

- [ ] **Step 5: Verify post-merge `main` CI**

Wait for the `main` workflow run on the merge SHA to reach `completed / success` before claiming v0.4 complete.
