# AunoSkills v1 Design Specification

Status: Approved
Date: 2026-09-13
License model: Apache-2.0 open core for CLI/core/schemas/adapters/community registry tooling; commercial services may be added separately.

## Product direction

AunoSkills is a clean-room implementation inspired by the general workflow of automatic AI-agent skill discovery and installation. It does not incorporate AutoSkills source code, assets, registry format, UI, or other CC BY-NC material.

AunoSkills v1 is CLI-first. The core value proposition is:

> Know what you are installing, why you need it, where it came from, and what it can do.

Three design pillars govern the runtime:

1. **Intelligence** — detect project evidence and make explainable recommendations.
2. **Trust** — separate relevance from provenance, trust, and immutable integrity.
3. **Control** — gate capabilities, make mutations transactional, and support deterministic restore/rollback.

## Supported agents

v1 targets:

- OpenAI Codex
- Claude Code
- Cursor
- Windsurf
- GitHub Copilot
- OpenCode

The system uses one canonical skill bundle and agent adapters. Portable project skills are shared through `.agents/skills/` when compatible; Claude Code uses `.claude/skills/`. Native fan-out is used only when an agent-specific extension actually requires it.

## Skill format

AunoSkills is standard-first:

```text
skill/
├── SKILL.md
├── auno.json
├── agents/
├── scripts/
├── references/
└── assets/
```

`SKILL.md` remains the agent-facing source of truth. `auno.json` contains AunoSkills package-manager metadata such as version, compatibility, requirements, recommendation signals, capabilities, dependencies, topics, and extensions. A skill cannot self-assert its trust level.

## Project contracts

A project commits two distinct contracts:

- `aunoskills.json` — human-authored project intent.
- `skills-lock.json` — deterministic resolved state.

Machine-local scanner caches, ownership records, transactions, and diagnostics live under `.aunoskills/state/` and are not committed.

The manifest may define target agents, skill constraints, recommendation thresholds, materialization mode, workspace overrides, and project security policy. The lockfile records exact versions, immutable SHA-256 bundle identities, effective trust, provenance, dependencies, capabilities, and rendered materialization records.

## Project intelligence

The scanner follows a cost-aware pipeline:

```text
Environment
  -> high-signal manifests
  -> framework configs
  -> project topology
  -> selective content signals only when needed
```

Sensitive files may be detected by existence without reading their contents. `.aunoignore` and common generated/vendor directories are excluded from expensive inspection.

The scanner produces a Project Intelligence Model containing workspaces, technologies, frameworks, traits, capabilities, detected agents, and evidence. Monorepo scope is first-class.

A core boundary is enforced:

- Scanner knows projects, not skills.
- Recommender knows skills, not the filesystem.

## Evidence graph and recommendation

Detection stores positive and negative evidence with subject, signal, source, weight, scope, and explanation. Recommendation consumes technology, trait, and capability evidence.

Default confidence tiers are:

```text
95-100  AUTO
80-94   RECOMMENDED
60-79   OPTIONAL
<60     HIDDEN
```

These thresholds are configurable. Relevance and trust remain separate dimensions. A highly relevant community skill remains visibly highly relevant rather than receiving an artificially reduced relevance score.

`aunoskills explain <skill>` must show evidence supporting the recommendation. `--why-not` style explanations can show missing signals for non-recommended skills.

AI enrichment is optional. Deterministic structural evidence has higher authority than AI output. Source code is not uploaded by default; enrichment receives sanitized metadata only when explicitly enabled and useful.

## Registry and trust

Supported source classes are:

1. `verified` — curated identity/provenance/integrity with security review.
2. `community` — known provenance and integrity with automated checks but no official endorsement.
3. `untrusted` — arbitrary/local/custom source without established registry trust.

Effective trust of a dependency graph is the lowest trust in that graph.

Registry versions are immutable. Metadata resolves a version to an exact bundle SHA-256 identity. Mutable `latest.zip`-style URLs are not artifact identities.

A read-only registry can be static:

```text
index.json
blobs/sha256/<digest>
```

This makes S3/R2/static hosting possible without a required application server.

Cryptographic publisher signing, key rotation, and a transparency log are future extensions; v0.1.0 does not claim they are already implemented.

## Security and capability model

Downloading a skill never grants permission to execute code.

The capability taxonomy can describe scoped filesystem read/write, shell execution, network access, environment reads, process spawn, Git read/write, agent config modification, and requested secrets.

Local execution defaults to policy evaluation; CI can use strict deny policies. `--yes` skips ordinary confirmations only and never bypasses trust/capability policy.

Permission escalation between installed and candidate versions is independently reviewed even when semantic version constraints allow the update.

Security operations happen before project mutation:

```text
download
  -> verify integrity
  -> scan/validate
  -> evaluate policy
  -> stage
  -> materialize
  -> commit transaction
```

Archive/file handling rejects traversal, absolute paths, normalized duplicate paths, and case-insensitive collisions.

A portable Node CLI cannot provide a universal kernel-level sandbox across all supported operating systems. v1 therefore defines and enforces policy boundaries where practical and leaves room for future native isolation backends.

## Content-addressed store

Global cache objects are addressed by SHA-256. CAS objects are immutable. Hardlinks directly into the CAS are forbidden by default because editing a materialization could mutate the same inode and violate the hash invariant.

Preferred project materialization strategy:

1. reflink/copy-on-write where available,
2. normal copy as fallback,
3. optional symlink only in explicitly supported local modes.

Project materializations must remain usable in CI and cloud-agent environments without depending on a user machine's global cache path.

## Resolver

Skill versions use semantic versioning. Supported constraints include exact, caret, tilde, comparison ranges, `latest`, and `recommended`.

`latest` means highest compatible published version. `recommended` means best policy-compatible version. Security/trust/capability policy can therefore choose an older compatible version over a newer candidate.

Resolver order is conceptually:

```text
explicit namespace/source
  -> version constraint
  -> platform compatibility
  -> agent compatibility
  -> organization/project policy
  -> dependency compatibility
  -> trust requirements
  -> capability compatibility
  -> recommendation preference
```

Registry pinning never silently falls back to an identically named package from another registry. Dependency graphs must remain shallow, deterministic, and cycle-free.

## Materialization adapters

Adapters detect agent conventions and produce declarative plans. Adapters do not directly mutate the filesystem. Core validates and transactionally commits plans.

Rendered outputs have their own integrity hashes separate from canonical bundle integrity. Ownership state distinguishes AunoSkills-managed outputs from unmanaged user-authored skills. Existing unmanaged paths are never silently overwritten.

`doctor` detects drift or missing materializations. Repair recreates managed outputs from exact lockfile/CAS state.

## Transactions and recovery

All mutations use a common lifecycle:

```text
PLAN
  -> VALIDATE
  -> SNAPSHOT
  -> STAGE
  -> VERIFY
  -> COMMIT
  -> FINALIZE
```

A failed mutation must not leave a half-installed project. Transaction journals support crash recovery. Project mutation uses a one-writer lock with stale-local-lock recovery.

Rollback is transaction-level rather than merely a single version downgrade. CAS identities reduce the need to copy immutable bundles during rollback.

## CLI contract

Primary command surface:

```text
init
detect
recommend
explain
add
remove
install
update
restore
rollback
list
outdated
doctor
audit
sync
registry
cache
config
```

No subcommand is equivalent to `init`.

Important global modes include `--yes`, `--dry-run`, `--json`, `--offline`, `--no-ai`, `--frozen-lockfile`, `--agent`, and `--project`.

Human output and machine output consume the same structured core results. JSON uses a versioned envelope. Stable exit-code categories allow CI to distinguish invalid usage, resolution failure, registry/network failure, integrity failure, security-policy failure, materialization failure, lockfile violation, and audit-threshold failure.

Mutation commands are all-or-nothing in v1; best-effort partial mutation is intentionally outside MVP scope.

## Testing and release gates

Required test layers:

- unit tests,
- schema/adapter contracts,
- integration tests,
- E2E lifecycle tests,
- adversarial/security tests.

Cross-platform CI covers Windows, macOS, and Linux. Release gates include typecheck, format checks, compiled build, full tests, security tests, E2E lifecycle, deterministic registry regeneration, and package-entry validation.

Important invariants include:

- same inputs resolve deterministically,
- frozen lockfiles never change versions,
- offline mode never disables integrity,
- denied capabilities never produce executable plans,
- unmanaged skills are never overwritten silently,
- CAS remains immutable,
- failed transactions can be recovered,
- project lockfile materialization paths remain portable.

## v0.1.0 scope boundary

The CLI-first release includes the deterministic local runtime, static verified registry, trust/integrity metadata, six-agent adapters, lifecycle commands, transactions, audit/doctor, offline restore, and CI gates.

Not included in v0.1.0:

- AunoSkills Cloud,
- hosted private-registry service,
- organization dashboard,
- SSO/RBAC,
- hosted scanning,
- cryptographic publisher signing/key rotation,
- transparency log,
- kernel-level sandboxing.
