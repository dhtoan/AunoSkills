# AunoSkills v0.4.0 — Skill Authoring & Publishing Toolkit

Status: Design approved for specification
Date: 2026-09-13
Target release: v0.4.0

## 1. Purpose

AunoSkills v0.4.0 adds the missing publisher-side workflow for creating, validating, inspecting, packing, verifying, and preparing skills for publication.

The runtime already knows how to discover projects, recommend skills, resolve versions, verify registries, enforce trust and capability policy, materialize skills for supported agents, and securely publish signed registry metadata. The remaining ecosystem gap is that skill authors still have to assemble `SKILL.md`, `auno.json`, bundle contents, validation steps, and registry submission metadata manually.

v0.4.0 closes that gap without introducing hosted marketplace infrastructure or weakening the existing trust boundary.

Primary workflow:

```text
aunoskills skill init
        ->
aunoskills skill validate
        ->
aunoskills skill inspect
        ->
aunoskills skill pack
        ->
aunoskills skill verify
        ->
aunoskills skill publish
```

The design remains standard-first: `SKILL.md` is still the agent-facing source of truth, while `auno.json` provides package-manager metadata.

## 2. Goals

v0.4.0 must provide a professional authoring workflow that:

1. Creates a portable skill skeleton that does not depend on one AI coding agent.
2. Validates authoring metadata against AunoSkills schema and security rules.
3. Explains exactly what a skill contains and what capabilities it requests before packaging.
4. Produces deterministic bundles whose SHA-256 identity is stable for identical inputs.
5. Re-verifies packed artifacts independently before publication.
6. Produces a publish-ready submission for registry automation without granting authors the ability to self-declare `verified` trust.
7. Keeps credentials and private signing keys outside the artifact and outside project lockfiles.
8. Reuses the existing security, registry, schema, resolver, hashing, and canonical serialization primitives instead of introducing a parallel package model.
9. Works consistently on Linux, macOS, and Windows with Node 22 and 24.

## 3. Non-goals

v0.4.0 does not add:

- AunoSkills Cloud.
- A hosted marketplace.
- Organization accounts, SSO, RBAC, billing, or publisher dashboards.
- Automatic cryptographic trust elevation for authors.
- A private signing key manager.
- A transparency log.
- A kernel-level sandbox.
- A second proprietary skill format.
- npm-style duplicate versions of the same skill in one project.
- arbitrary install/postinstall hooks.

Publishing in v0.4.0 means creating a validated submission or writing to an explicitly writable registry workspace. It does not mean bypassing the registry review/signing pipeline introduced in v0.2/v0.3.

## 4. CLI surface

New command namespace:

```text
aunoskills skill
├── init
├── validate
├── inspect
├── pack
├── verify
└── publish
```

### 4.1 `skill init`

Creates a new portable skill directory.

Example:

```bash
aunoskills skill init wordpress-performance
```

Default output:

```text
wordpress-performance/
├── SKILL.md
└── auno.json
```

Optional directories are created only when requested or later added by the author:

```text
scripts/
references/
assets/
agents/
```

The command must not generate agent-specific instructions by default.

The generated `SKILL.md` should contain a small original AunoSkills template with sections for purpose, when to use the skill, workflow, constraints, and verification expectations. It must not copy content from third-party skill repositories.

The generated `auno.json` must include only author-controlled fields such as:

- schema version.
- package identity.
- runtime name.
- version.
- publisher.
- display name.
- description.
- license.
- compatibility.
- topics.
- requirements.
- declared capabilities.
- dependencies/conflicts.
- recommendation hints.
- namespaced extensions.

It must not contain authoritative fields such as `trust: verified`, registry signatures, or bundle integrity attestations.

Interactive prompting is optional. The command must support non-interactive creation through flags and `--yes` defaults where safe.

### 4.2 `skill validate`

Validates a source skill directory without packing it.

Validation categories:

```text
schema
identity
version
filesystem
skill-content
compatibility
capabilities
dependencies
security
portability
```

The command returns a structured result containing errors, warnings, and informational findings.

Validation failures include:

- missing `SKILL.md`.
- missing or invalid `auno.json`.
- invalid package identity.
- invalid runtime name.
- invalid semantic version.
- self-asserted trust/verification fields.
- absolute paths.
- `..` traversal after normalization.
- case-insensitive path collisions.
- disallowed file types when policy requires blocking.
- dependency self-reference.
- dependency cycles when a graph can be resolved locally.
- malformed compatibility declarations.
- malformed capability scopes.
- unsupported critical extension fields.

Warnings can include:

- capability declaration does not match static inference.
- skill appears agent-specific while declaring itself portable.
- missing license metadata.
- broad shell/network/filesystem capabilities.
- suspicious prompt-injection-like text requiring review.

Validation must not execute skill scripts.

### 4.3 `skill inspect`

Produces an explainable author-facing summary of a source skill.

Human output should show:

- package ID.
- runtime name.
- version.
- publisher.
- file count and normalized inventory.
- dependencies and conflicts.
- compatibility targets.
- declared capabilities.
- statically inferred capabilities.
- declaration/inference differences.
- portability status.
- security findings.
- expected bundle exclusions.

`--json` uses the existing versioned JSON envelope.

The inspection layer must be read-only.

### 4.4 `skill pack`

Builds a deterministic immutable bundle from a valid source skill.

Conceptual pipeline:

```text
source directory
  -> validate
  -> normalize inventory
  -> apply inclusion/exclusion policy
  -> reject unsafe paths/collisions
  -> canonical file ordering
  -> deterministic bundle bytes
  -> SHA-256 digest
  -> output bundle + metadata
```

Default artifact naming:

```text
<runtime-name>-<version>.aunoskill
```

The extension is an AunoSkills distribution container only; the skill contents remain standard-first and include `SKILL.md`.

The packed format must be deterministic across supported operating systems for semantically identical source input. Platform-specific metadata such as mtime, uid, gid, local absolute paths, and host-specific separators must not affect the digest.

The packer must not execute code and must not follow filesystem links outside the source root.

### 4.5 `skill verify`

Independently verifies a packed `.aunoskill` artifact.

Verification includes:

- container structure.
- normalized safe paths.
- duplicate/case-collision detection.
- deterministic manifest/inventory consistency.
- embedded `auno.json` schema validation.
- `SKILL.md` presence.
- artifact SHA-256 calculation.
- capability/dependency validation.
- source-independent security checks.

Verification does not claim registry trust. An artifact can be valid but untrusted.

Output must distinguish:

```text
artifactValid: true|false
trust: untrusted|community|verified|unknown
```

where trust is only populated as authoritative when external registry attestations are actually supplied and verified.

### 4.6 `skill publish`

Prepares a validated publication submission.

Supported v0.4.0 modes:

1. `submission` — create a deterministic publication descriptor that a registry CI pipeline can consume.
2. `workspace` — write immutable skill artifact + submission metadata into an explicitly writable local registry workspace.

Example:

```bash
aunoskills skill publish ./my-skill --registry-workspace ../registry
```

or:

```bash
aunoskills skill publish ./my-skill --output submission.json
```

`skill publish` must not:

- mark the skill as verified.
- mint registry signatures without the registry signing workflow.
- persist private keys.
- persist bearer tokens.
- overwrite an existing immutable version with different bytes.

A submission descriptor contains author/package data, exact artifact digest, provenance claims, capabilities, dependencies, and the source commit when supplied. The registry remains responsible for independent validation, security scanning, trust evaluation, signing, and publication.

## 5. Identity model

v0.4.0 makes three identifiers explicit:

```text
packageId    registry/package identity, e.g. auno/wordpress-security
runtimeName  materialized skill directory/name, e.g. wordpress-security
publisher    publisher identity/namespace, e.g. auno
```

Rules:

- `packageId` is globally meaningful within a registry namespace.
- `runtimeName` must be safe as a directory name and portable across supported filesystems.
- `publisher` is metadata/identity, not trust by itself.
- two packages that would materialize to the same runtime name in the same scope must conflict rather than silently alias.
- v0.4.0 does not add runtime aliases.

## 6. Source file policy

The packer uses an explicit allow-by-default-for-normal-files policy with mandatory exclusions and security checks.

Always excluded:

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

Credential-like files are excluded or blocked by default:

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

Authors can add `.aunoignore` patterns. `.aunoignore` may only further exclude files; it cannot re-include files blocked by security policy.

Symlinks are not followed outside the source root. For v0.4.0 the safest default is to reject symlinks in publishable bundles unless a future format defines portable link semantics explicitly.

## 7. Deterministic bundle format

The bundle format must be simple, inspectable, deterministic, and dependency-light.

Normative conceptual content:

```text
bundle/
├── manifest.json
└── files/
    └── <normalized skill files>
```

`manifest.json` contains:

- bundle schema version.
- package ID.
- runtime name.
- skill version.
- canonical file inventory.
- per-file SHA-256 hashes.
- canonical `auno.json` digest.
- declared capability snapshot.
- dependency snapshot.

The whole container SHA-256 remains an external artifact identity rather than a self-referential field inside the bytes being hashed.

Canonical ordering is lexical by normalized POSIX-style relative path.

Text bytes are preserved as authored; pack must not silently reformat `SKILL.md` or source files.

Container metadata must not include volatile timestamps.

## 8. Capability inference

v0.4.0 reuses the existing capability taxonomy.

Static inference can inspect:

- shell-like commands in documented workflows.
- scripts directory presence/content.
- obvious network URLs/domains.
- environment-variable references.
- filesystem write instructions.
- Git mutation instructions.
- agent-config modification instructions.

The inference system is heuristic and explainable. It is not a proof of safety.

Mismatch rules:

- inferred dangerous capability missing from declaration: HIGH validation finding by default.
- declaration broader than inference: warning, because the author may be documenting conditional behavior.
- secret-like environment access without explicit `secrets.request` or scoped env capability: HIGH.

No single numeric safety score is produced.

## 9. Dependency validation

Dependencies remain skill dependencies, not arbitrary npm/runtime package dependencies.

Validation rules:

- no self-dependency.
- no duplicate dependency declarations.
- constraints must be valid supported semver/range syntax.
- local dependency graphs used during authoring must be cycle-free.
- conflicts cannot silently overlap a dependency.
- optional/recommended related skills remain outside the core dependency graph for v0.4.0.

The authoring toolkit does not install dependencies during validation or pack.

## 10. Security boundary

Authoring commands inherit AunoSkills security principles:

- never execute downloaded or local skill code as part of validation/pack/verify.
- never infer trust from package metadata.
- never persist signing secrets.
- never emit bearer tokens/private keys in structured errors or logs.
- reject traversal, absolute paths, normalized duplicates, and case-insensitive collisions.
- reject secret-like files from publication by default.
- keep registry signing at the registry/release boundary.

`--yes` may skip ordinary authoring confirmations but cannot bypass blocked file policy, path safety, immutable version collisions, or cryptographic verification.

## 11. Publication descriptor

A submission document uses a versioned schema, conceptually:

```json
{
  "schemaVersion": 1,
  "packageId": "publisher/example-skill",
  "runtimeName": "example-skill",
  "version": "1.0.0",
  "artifact": {
    "sha256": "...",
    "file": "example-skill-1.0.0.aunoskill"
  },
  "publisher": "publisher",
  "provenance": {
    "sourceRepository": "https://github.com/example/skills",
    "sourceCommit": "<exact commit>"
  },
  "capabilities": [],
  "dependencies": {}
}
```

This document is an author claim, not a registry attestation.

Registry ingestion must re-validate the bundle and may enrich/reject the submission.

## 12. Module architecture

Add a focused authoring package rather than putting authoring logic in the CLI.

Proposed structure:

```text
packages/authoring/
├── src/
│   ├── init.ts
│   ├── validate.ts
│   ├── inspect.ts
│   ├── inventory.ts
│   ├── pack.ts
│   ├── verify.ts
│   ├── publish.ts
│   ├── capabilities.ts
│   └── types.ts
└── test/

apps/cli/
└── routes `skill *` commands to authoring APIs
```

Boundary rules:

- CLI parses flags and renders output.
- authoring package owns skill-source and bundle logic.
- schema package owns normative JSON contracts.
- security package owns reusable path/integrity/security primitives.
- registry package owns registry trust/signing, not authoring.
- core installer/resolver does not gain authoring responsibilities.

## 13. Error contracts

Add stable structured errors as needed:

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

Existing exit-code categories remain stable. Authoring validation failures map to invalid usage/config or security/integrity categories depending on cause rather than inventing a new incompatible global exit-code scheme.

## 14. JSON output

All `skill` commands support the existing machine-readable envelope:

```json
{
  "schemaVersion": 1,
  "command": "skill validate",
  "ok": true,
  "data": {}
}
```

Validation/inspection findings use stable fields:

```text
code
severity
category
message
path?
details?
```

Human output and JSON output come from the same structured result.

## 15. Testing strategy

### Unit tests

- package/runtime-name validation.
- `.aunoignore` behavior.
- secret-file blocking.
- path normalization.
- case-insensitive collision detection.
- deterministic inventory ordering.
- capability inference.
- dependency validation.
- publication descriptor serialization.

### Contract tests

- source `auno.json` schema.
- bundle manifest schema.
- submission schema.
- JSON output envelope compatibility.

### Integration tests

- `init -> validate`.
- `validate -> inspect`.
- `validate -> pack -> verify`.
- `pack -> publish submission`.
- local registry workspace immutable-version protection.

### Adversarial tests

- `../` traversal.
- absolute paths.
- Windows drive paths.
- UNC-style paths.
- case collisions.
- symlink escape.
- secret files.
- prompt-injection-like content.
- malicious capability mismatch.
- malformed bundle manifest.
- tampered packed file.

### Cross-platform determinism

The same fixture must produce the same logical file inventory and bundle SHA-256 on:

- Ubuntu / Node 22 and 24.
- macOS / Node 22 and 24.
- Windows / Node 22 and 24.

If filesystem archive implementation differences make byte-identical output impossible, the selected container encoding must be changed rather than weakening the deterministic requirement.

## 16. CI and release gates

Existing gates remain mandatory:

```text
format check
TypeScript typecheck
compiled build
full unit/integration/E2E suite
security gate
registry reproducibility
Windows/macOS/Linux matrix
Node 22/24 matrix
```

v0.4.0 adds authoring-specific release gates:

```text
authoring round-trip fixture
cross-platform bundle digest fixture
secret-exclusion fixture
malicious-path fixture
submission determinism fixture
```

## 17. Versioning and compatibility

Release target: `0.4.0` because this adds a new public CLI namespace and public authoring contracts.

Existing install/registry commands must remain backward compatible.

The package has no new runtime dependency requirement by design unless implementation proves a deterministic container cannot be safely built with Node built-ins. Any proposed runtime dependency must be justified before adoption.

## 18. Documentation changes

README will add a concise "Author a skill" section after Quick Start.

New documentation should include:

```text
docs/authoring/getting-started.md
docs/authoring/bundle-format.md
docs/authoring/publishing.md
```

`SECURITY.md` will document secret-file blocking and the distinction between author submission and registry verification.

`CHANGELOG.md` will record the v0.4.0 authoring toolkit.

## 19. MVP completion criteria

v0.4.0 is complete when all of the following are true:

- `aunoskills skill init` creates a valid portable skill.
- `skill validate` reports structured schema/security/capability/dependency findings.
- `skill inspect` explains authoring state without mutation.
- `skill pack` produces deterministic immutable bundles.
- `skill verify` detects tampering and invalid artifacts independently.
- `skill publish` emits deterministic publish submissions and optionally writes to a local registry workspace without overwriting immutable versions.
- no command executes skill code during authoring.
- no command self-assigns verified trust.
- secret-like files are blocked from publication by default.
- full existing v0.3 lifecycle/security tests still pass.
- authoring tests pass on Ubuntu/macOS/Windows with Node 22/24.
- exact-head PR CI and post-merge `main` CI both succeed.

## 20. Invariants

1. `SKILL.md` remains the portable agent-facing source of truth.
2. `auno.json` describes author intent; it does not establish trust.
3. Same normalized source bytes produce the same packed artifact digest.
4. Packaging never executes skill code.
5. Publishing never bypasses registry verification/signing policy.
6. Private keys and bearer tokens never enter packed artifacts or submission documents.
7. Unsafe paths and secret-like files fail closed.
8. Artifact validity and registry trust are separate concepts.
9. CLI contains no authoring business logic beyond argument parsing/rendering.
10. Existing installer, resolver, registry, and materialization behavior remain backward compatible.
