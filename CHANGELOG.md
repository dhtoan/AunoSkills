# Changelog

All notable changes to AunoSkills are documented here.

## 0.1.0 — 2026-09-13

Initial CLI-first open-source release.

### Added

- Deterministic project scanner with evidence graph, sensitive-file guards, and pnpm/npm workspace discovery.
- Explainable recommendation engine with confidence tiers, workspace scope, overlap suppression, and separate trust metadata.
- Policy-aware semantic-version resolver with namespace pinning, shallow dependency graphs, cycle detection, effective trust, and permission-escalation reporting.
- Immutable static registry client and SHA-256 content-addressed cache.
- Registry validation for immutable hash references and bundle validation requiring `SKILL.md`.
- Capability-aware security policy, integrity checking, archive path hardening, guarded process execution, and audit findings.
- Portable adapter layer for Codex, Claude Code, Cursor, Windsurf, GitHub Copilot, and OpenCode.
- Shared `.agents/skills` materialization for compatible agents plus `.claude/skills` for Claude Code.
- Transaction journal, one-writer project lock, stale-lock recovery, unmanaged collision protection, rollback, ownership tracking, and drift repair.
- CLI commands for init, detect, recommend, explain, add, remove, install, update, restore, rollback, list, outdated, doctor, audit, sync, registry, cache, and config.
- Stable JSON envelopes and public exit codes including dedicated audit threshold exit code `10`.
- Offline exact restore and frozen-lockfile behavior.
- Three original verified starter skills: `typescript-quality`, `node-cli-quality`, and `security-review`.
- Cross-platform GitHub Actions matrix, adversarial security tests, E2E lifecycle tests, package-entry tests, and scanner benchmark smoke test.

### Security

- `--yes` does not bypass policy.
- Lockfile materialization targets are portable repository-relative paths rather than machine-specific absolute paths.
- Archive validation detects traversal, absolute paths, normalized duplicates, and case-insensitive collisions.
- Concurrent writes converge on a single immutable CAS object.

### Not included

AunoSkills Cloud, hosted private registries, organization dashboard, SSO, enterprise RBAC, hosted scanning, and kernel-level sandboxing are outside the v0.1.0 scope.
