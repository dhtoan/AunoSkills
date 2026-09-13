# Changelog

All notable changes to AunoSkills are documented here.

## 0.2.0 — 2026-09-13

Registry trust and private-registry security release.

### Added

- Ed25519 canonical signing and verification using Node.js built-in cryptography with no runtime dependency.
- Registry schema v2 with signed `trust.json`, signed `index.json`, immutable signed skill manifests, and SHA-256-addressed bundles.
- Explicit local trust anchors: registry-provided keys cannot bootstrap their own trust.
- Key rotation, validity windows, and revocation handling with structured signing-key errors.
- `VerifiedRegistryClient` verification pipeline covering trust metadata, index signature, manifest digest/signature, and bundle integrity.
- Deterministic signer evidence in `skills-lock.json` using signer IDs and signature digests without timestamps.
- Audit findings for missing signer proof, unsigned community sources, unknown/expired keys, and CRITICAL revoked signer state.
- Private registry bearer authentication by environment-variable reference; token values are resolved only at request time and are never persisted.
- Registry management commands for safe configuration, explicit trust anchors, show, and refresh.
- Verified metadata cache for offline trust/index/manifest verification; bundle bytes remain managed by the existing content-addressed store.
- Signed registry-v2 builder accepting the private signing key only as a runtime input and never writing it to registry output.
- Cross-platform signing, tamper, trust-bootstrap, revocation, auth-redaction, and offline metadata tests.

### Security

- A registry cannot become trusted merely because its own `trust.json` contains and signs with an unknown key.
- Registry trust updates must be signed by a previously trusted active key before rotations or revocations are applied.
- Invalid index or manifest signatures fail closed.
- Revoked signing keys are rejected for new verified operations and surfaced by audit for installed lockfile evidence.
- Private registry credentials are represented by environment-variable names only; secret values are never written to project manifests, lockfiles, or user registry config.
- Offline mode does not disable cryptographic verification; cached metadata is revalidated against configured trust anchors.

### Compatibility note

The v0.2 client remains compatible with schema-v1 community/untrusted static registries. The bundled `auno` registry remains on its existing v1 static format until a real release signing key is provisioned through secure release infrastructure. AunoSkills intentionally does **not** commit a fixture/private signing key or claim that the bundled registry is cryptographically signed before that provisioning occurs.

### Not included

Sigstore/keyless signing, transparency logs, AunoSkills Cloud, hosted private registries, organization dashboard, SSO, enterprise RBAC, hosted scanning, and kernel-level sandboxing remain outside v0.2.0.

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
