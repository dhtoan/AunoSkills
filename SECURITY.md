# Security Policy

## Supported version

Security fixes are provided for the latest `0.2.x` release line while AunoSkills is pre-1.0. After a newer minor release is published, users should update before reporting issues already fixed there.

## Reporting a vulnerability

Do not publish a suspected vulnerability, credential, exploit payload, signing key, or affected private registry contents in a public issue. Use a private GitHub Security Advisory for the `dhtoan/AunoSkills` repository when available. If private reporting is temporarily unavailable, provide only a non-sensitive request for a private contact channel.

Include the affected version, platform, command, minimal reproduction, expected security boundary, actual result, and whether any credential, signing key, or untrusted artifact was exposed.

## Security model

AunoSkills separates five questions:

1. **Relevance** — is a skill useful for this project?
2. **Trust** — what registry/publisher authority is explicitly trusted?
3. **Authenticity** — was registry/manifest metadata signed by an active trusted key?
4. **Integrity** — do immutable artifacts match their SHA-256 identity?
5. **Capability** — what side effects is the skill allowed to request?

A positive answer to one question never implies a positive answer to another.

## Signed registry v2

A verified registry-v2 path is:

```text
explicit local trust anchor
  -> signed trust.json
  -> signed index.json
  -> signed immutable skill manifest
  -> SHA-256 immutable bundle
```

Security invariants:

- Registry-provided keys cannot self-bootstrap trust. The signer of a trust update must already be trusted and active before the update is applied.
- Ed25519 signatures cover deterministic canonical metadata bytes.
- Unknown, expired, not-yet-valid, or revoked keys fail closed for verified operations.
- Key rotation is accepted only through a trust document authorized by an already trusted active key.
- Revoked signer state is surfaced as a CRITICAL audit finding for locked signed artifacts.
- Signer evidence stored in `skills-lock.json` contains only deterministic key IDs/signature digests; verification timestamps remain out of committed lock state.
- Private signing keys are runtime inputs to the signed-registry builder and must never be committed or written into registry output.

## Private registry authentication

AunoSkills supports bearer credentials by environment-variable reference.

```json
{
  "auth": {
    "type": "bearer-env",
    "env": "AUNOSKILLS_COMPANY_TOKEN"
  }
}
```

Only the environment-variable name is stored. The token value is read at request time and must not be written to `aunoskills.json`, `skills-lock.json`, registry configuration, logs, or structured errors.

## General invariants

- Registry trust is assigned externally; a skill cannot self-assert `verified`.
- Immutable bundle integrity is verified before project materialization.
- `--yes` never bypasses capability, trust, authenticity, or integrity policy.
- Permission escalation is reviewed during updates even when semver would otherwise allow the version.
- Skill execution is default-deny/explicit-policy; downloading instructions is not execution permission.
- Secret environment values are not inherited by guarded execution unless explicitly allowed.
- Archive paths are normalized and checked for traversal, absolute paths, normalized duplicates, and case collisions.
- Project mutations are staged and journaled so failures can roll back rather than leave a half-installed state.
- Offline restore still verifies integrity.
- Offline verified-registry metadata is cached only after successful verification and is reverified against explicit trust anchors when reused.

## Threats covered by tests

The release security gate includes regression coverage for:

- SHA-256 mismatch.
- Ed25519 signed-payload tampering.
- Unknown self-signed registry bootstrap attempts.
- Revoked/expired signing-key behavior in registry/unit tests.
- Private-registry credential redaction.
- Archive traversal, normalized duplicate paths, and case collisions.
- Untrusted shell capability.
- Stale local locks and concurrent CAS writes.
- Unmanaged materialization collisions.
- Secret environment stripping.
- Transaction rollback.
- Offline exact restore and offline verified metadata reuse.

## Bundled registry signing status

AunoSkills v0.2 includes the full signed registry-v2 schema, builder, verifier, rotation/revocation logic, lock evidence, and audit integration. The bundled `auno` registry remains on the v1 static compatibility path until a real release signing key is provisioned through secure release infrastructure.

This is intentional. The repository does not include a fixture private key, deterministic private seed, or other secret material disguised as production signing infrastructure.

## Limitations

AunoSkills v0.2.0 provides a policy-level capability boundary. A portable Node.js CLI cannot provide a kernel-level sandbox consistently across Windows, macOS, and Linux. Network and process capability metadata therefore represents policy and review intent unless a future native isolation backend explicitly enforces it.

Ed25519 verification proves possession of a configured signing key; it does not by itself prove publisher identity. Publisher identity ultimately depends on how the initial trust anchor is distributed and protected.

No security score should be interpreted as proof that a skill is safe. Review concrete trust, signature state, integrity, provenance, requested capabilities, and audit findings.
