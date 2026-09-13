# Security Policy

## Supported version

Security fixes are provided for the latest `0.1.x` release line while AunoSkills is pre-1.0. After a newer minor release is published, users should update before reporting issues already fixed there.

## Reporting a vulnerability

Do not publish a suspected vulnerability, credential, exploit payload, or affected private registry contents in a public issue. Use a private GitHub Security Advisory for the `dhtoan/AunoSkills` repository when the repository is available. If private reporting is temporarily unavailable, provide only a non-sensitive request for a private contact channel.

Include the affected version, platform, command, minimal reproduction, expected security boundary, actual result, and whether any credential or untrusted artifact was exposed.

## Security model

AunoSkills separates four questions:

1. **Relevance** — is a skill useful for this project?
2. **Trust** — what registry/publisher provenance is established?
3. **Integrity** — do the bytes match the immutable SHA-256 identity?
4. **Capability** — what side effects is the skill allowed to request?

A positive answer to one question never implies a positive answer to another.

Important invariants include:

- Registry trust is assigned externally; a skill cannot self-assert `verified`.
- Immutable bundle integrity is verified before project materialization.
- `--yes` never bypasses capability or trust policy.
- Permission escalation is reviewed during updates even when semver would otherwise allow the version.
- Skill execution is default-deny/explicit-policy; downloading instructions is not execution permission.
- Secret environment values are not inherited by guarded execution unless explicitly allowed.
- Archive paths are normalized and checked for traversal, absolute paths, normalized duplicates, and case collisions.
- Project mutations are staged and journaled so failures can roll back rather than leave a half-installed state.
- Offline restore still verifies integrity.

## Threats covered by tests

The release security gate includes regression coverage for hash mismatch, archive traversal and case collision, untrusted shell capability, stale local locks, concurrent CAS writes, unmanaged materialization collisions, secret environment stripping, transaction rollback, and offline exact restore.

## Limitations

AunoSkills v0.1.0 provides a policy-level capability boundary. A portable Node.js CLI cannot provide a kernel-level sandbox consistently across Windows, macOS, and Linux. Network and process capability metadata therefore represents policy and review intent unless a future native isolation backend explicitly enforces it.

No security score should be interpreted as proof that a skill is safe. Review concrete trust, integrity, provenance, requested capabilities, and audit findings.
