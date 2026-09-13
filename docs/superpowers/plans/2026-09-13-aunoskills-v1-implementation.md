# AunoSkills v1 Implementation Plan

> **For agentic workers:** Implement this plan with test-first checkpoints and independent commits. The approved design is in `docs/superpowers/specs/2026-09-13-aunoskills-v1-design.md`.

**Goal:** Deliver the CLI-first AunoSkills v0.1.0 runtime as a deterministic, policy-aware, cross-platform skill package manager for six AI coding agents.

**Architecture:** Keep CLI rendering thin over a reusable core. Scanner builds project intelligence, recommender ranks skill candidates, resolver selects policy-compatible immutable versions, registry/CAS supply verified bytes, adapters create declarative materialization plans, and Core owns transactional filesystem mutation.

**Tech Stack:** TypeScript 5.8, Node.js 22+, ESM, Node built-in test runner, zero runtime npm dependencies.

## Global constraints

- Node.js minimum: 22.
- Windows, macOS, and Linux are equal supported targets.
- `SKILL.md` remains the portable agent standard; AunoSkills metadata is additive.
- `aunoskills.json` is human intent; `skills-lock.json` is deterministic resolved state.
- Trust and relevance remain separate dimensions.
- Integrity is SHA-256 based and mandatory before materialization.
- Skill execution/capabilities are policy-gated; `--yes` never bypasses security policy.
- Agent adapters plan outputs; Core performs writes.
- Project mutation is transactional and recoverable.
- No machine-specific absolute project materialization paths in committed lockfiles.
- The bundled registry must rebuild without changing checked-in registry bytes.

## Milestone 1 — Contracts and primitives

1. Define project/skill/lock/registry TypeScript contracts.
2. Add validation for unknown critical fields and reject skill self-asserted trust.
3. Add stable JSON serialization.
4. Define structured `AunoError` categories and stable CLI exit codes.
5. Add SHA-256 helpers and atomic text/JSON writes.
6. Cover each public contract with failing-then-passing tests.

## Milestone 2 — Project intelligence

1. Implement scoped Evidence Graph with positive and negative evidence.
2. Detect high-signal manifests and framework configs.
3. Detect WordPress/WooCommerce, Python/FastAPI, Rust, Go, and common JS frameworks.
4. Discover npm/pnpm workspace scope.
5. Detect sensitive files by presence without ingesting secret contents.
6. Verify monorepo scope and sensitive-file behavior with fixtures.

## Milestone 3 — Recommendation and resolver

1. Score candidates from technology/trait/capability evidence.
2. Implement AUTO / RECOMMENDED / OPTIONAL / HIDDEN tiers.
3. Preserve trust as separate metadata.
4. Suppress strongly overlapping lower-quality recommendations.
5. Provide deterministic explain/why-not output.
6. Implement semver constraints and prerelease behavior.
7. Add policy-aware trust selection, namespace pinning, dependencies, cycle detection, and permission escalation.

## Milestone 4 — Security, registry, and CAS

1. Implement trust/capability policy evaluation.
2. Implement integrity verification and immutable CAS.
3. Harden archive/bundle paths against traversal, absolute paths, normalized duplicates, and case collisions.
4. Strip ungranted secret environment variables from guarded command execution.
5. Implement static registry index + immutable SHA-256 blob client.
6. Implement deterministic static registry builder and provenance metadata.
7. Add concurrent CAS and registry validation tests.

## Milestone 5 — Agent adapters and materialization

1. Implement canonical skill bundle representation.
2. Share compatible portable skills through `.agents/skills/`.
3. Materialize Claude Code through `.claude/skills/`.
4. Support native fan-out only for explicit agent extensions.
5. Compute rendered integrity separately from canonical integrity.
6. Track managed ownership and reject unmanaged collisions.

## Milestone 6 — Transactions and core lifecycle

1. Add exclusive project writer lock with stale local lock recovery.
2. Stage outputs before publish and write transaction journals.
3. Roll back staged/partially committed changes on failure.
4. Implement install, exact restore, frozen lockfile, update, remove, rollback, doctor, and audit.
5. Support offline restore from exact CAS identities.
6. Keep lockfile materialization paths portable.
7. Test injected publish failures, crash recovery, dependency-safe removal, drift repair, and update permission escalation.

## Milestone 7 — CLI

1. Add parser for command surface and global flags.
2. Make no subcommand equivalent to `init`.
3. Add stable human and JSON rendering.
4. Implement detect/recommend/explain/add/remove/install/update/restore/rollback/list/outdated/doctor/audit/sync/registry/cache/config.
5. Enforce exit codes for lockfile, materialization, security, and audit failures.
6. Ensure dry-run has zero persistent mutation.

## Milestone 8 — Dogfood and release gates

1. Author original Apache-2.0 starter skills for TypeScript quality, Node CLI quality, and security review.
2. Build the static verified registry and commit immutable bundles.
3. Dogfood the repository with `aunoskills.json` + `skills-lock.json`.
4. Add E2E fresh init, clone/offline restore, update/rollback, six-agent materialization, and monorepo scope tests.
5. Add adversarial security fixtures and concurrent CAS tests.
6. Compile TypeScript before package-entry tests.
7. Add GitHub Actions matrix for Node 22/24 on Ubuntu, macOS, and Windows.
8. Verify registry regeneration produces no diff.
9. Verify `npm pack --dry-run` contains the compiled CLI and registry.
10. Publish v0.1.0 only after the exact remote release head passes required CI gates.

## Definition of done

- Project intelligence and explainable recommendations work without AI.
- Six target agents are served from deterministic materialization plans.
- Manifest and lockfile semantics are reproducible.
- Registry/CAS integrity is enforced.
- Trust/capability policy cannot be bypassed by convenience flags.
- Install/update/remove/restore/rollback are transactional.
- Doctor/audit provide actionable state/security reports.
- Offline restore and frozen-lockfile CI workflows are supported.
- Full remote CI matrix is green on Windows, macOS, and Linux.
