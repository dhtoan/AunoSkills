# `packages/authoring`

`packages/authoring` implements the local publisher-side workflow for AunoSkills skill packages.

It owns source-skill initialization, secure inventory, validation, explainable capability inference, inspection, deterministic `.aunoskill` packaging, independent artifact verification, deterministic publication descriptors, and publisher attestation creation.

## Boundary

The package deliberately does **not** own registry trust, registry namespace policy, registry intake decisions, or public-registry release signing.

```text
skill source
  -> init / validate / inspect
  -> deterministic pack
  -> independent verify
  -> publish submission/workspace
  -> publisher attest
  -> registry intake / policy verification (packages/registry)
  -> registry release signing (existing registry tooling)
```

A valid `.aunoskill` artifact is not automatically trusted. A valid publisher signature authenticates a publisher claim only when a registry-controlled namespace policy authorizes that publisher key. Registry `verified` trust remains separate and authoritative only through the registry verification/signing pipeline.

## Public workflow

```text
aunoskills skill init
aunoskills skill validate
aunoskills skill inspect
aunoskills skill pack
aunoskills skill verify
aunoskills skill publish
aunoskills skill attest
aunoskills skill submit
```

The CLI routes these commands into focused packages. Authoring business logic stays here; remote registry transport and intake policy stay in `packages/registry` rather than being duplicated in `apps/cli`.

## Identity

- `auno.json.id` is the package ID, for example `acme/security-review`.
- the runtime/materialization name is derived from the final package-ID segment, for example `security-review`.
- `publisher` is author metadata, not a trust assertion.
- package namespace ownership is decided by registry-controlled publisher policy, not by author metadata.
- runtime-name aliases remain intentionally unsupported.

## `.aunoskill` v1 container

The distribution container is canonical JSON serialized with the repository's deterministic `stableStringify()` implementation.

Conceptually:

```json
{
  "schemaVersion": 1,
  "manifest": {
    "schemaVersion": 1,
    "packageId": "acme/security-review",
    "runtimeName": "security-review",
    "version": "1.0.0",
    "metadataDigest": "<sha256>",
    "files": [
      { "path": "SKILL.md", "sha256": "<sha256>", "size": 123 }
    ]
  },
  "files": [
    {
      "path": "SKILL.md",
      "sha256": "<sha256>",
      "size": 123,
      "contentBase64": "..."
    }
  ]
}
```

Rules:

- paths are normalized POSIX-style relative paths;
- files are ordered deterministically;
- exact file bytes are preserved and encoded as base64;
- timestamps, uid/gid, absolute host paths, and local separators are excluded;
- the external artifact SHA-256 hashes the exact canonical container bytes and is not embedded recursively inside the container.

The canonical JSON/base64 format favors portability and inspectability over compression. It avoids platform-specific archive metadata and additional runtime dependencies.

## Security invariants

Authoring operations never execute skill scripts.

Publishable inventories reject or block:

- path traversal and absolute paths;
- case-insensitive collisions;
- symlinks;
- credential-like files such as `.env`, private keys, SSH keys, credential JSON, and service-account files;
- malformed dependency metadata;
- high-severity capability declaration/inference mismatches.

`.aunoignore` can exclude additional files but cannot re-include security-blocked paths. `--yes` never bypasses these invariants.

## Determinism

The same normalized fixture has one golden cross-platform artifact digest, verified in GitHub Actions across Linux, macOS, and Windows. Pack output intentionally excludes volatile filesystem metadata.

v0.5 additionally locks deterministic publisher-side inputs:

- canonical submission digest;
- domain-separated publisher-attestation payload digest;
- accepted registry-candidate digest.

These values are verified across the GitHub Actions OS matrix without committing a publisher private key fixture.

## Publication

`publish` produces deterministic `SkillSubmissionV1` metadata and optionally an immutable local registry-workspace layout. Publishing is idempotent when existing bytes are identical and fails on same-version byte conflicts.

`publish` does **not** mint registry signatures, assign `verified` trust, or persist private signing keys.

## Publisher attestation

`skill attest` signs the exact canonical publication submission using Ed25519.

```bash
AUNOSKILLS_PUBLISHER_PRIVATE_KEY='BASE64_PKCS8' \
  aunoskills skill attest ./skill.submission.json \
  --publisher-key-id acme-release-2026 \
  --output ./skill.attestation.json
```

The signature covers a domain-separated payload:

```text
aunoskills.publisher-attestation.v1
```

The private key is a runtime-only environment input. By default it is read from `AUNOSKILLS_PUBLISHER_PRIVATE_KEY`; `--publisher-key-env` may name another environment variable. AunoSkills never accepts a raw private key as a CLI argument and never persists it to project or user configuration.

An attestation binds:

- publisher;
- package ID;
- version;
- canonical submission SHA-256;
- artifact SHA-256;
- publisher key ID and Ed25519 signature.

It contains no registry trust tier.

## Remote submission

`skill submit` hands a locally verified artifact/submission/attestation to a configured self-hosted/private registry intake endpoint.

```bash
aunoskills skill submit ./skill.aunoskill \
  --submission ./skill.submission.json \
  --attestation ./skill.attestation.json \
  --publish-registry company
```

Remote transport is owned by `packages/registry`. It re-verifies immutable correspondence before network access, uses deterministic idempotency keys, reuses environment-based bearer authentication, and fails closed on redirects rather than forwarding credentials to another origin.

The reserved `auno` registry is not writable through this flow unless it explicitly advertises an intake endpoint in a future release.

## Tests

Coverage lives in:

```text
packages/authoring/test/
packages/registry/test/publisher-*.test.ts
packages/registry/test/intake*.test.ts
apps/cli/test/publisher-intake.test.ts
test/e2e/authoring-*.test.ts
test/security-fixtures/authoring-*.test.ts
test/security-fixtures/publisher-intake.test.ts
```

The repository CI matrix runs the full suite on Ubuntu, macOS, and Windows with Node.js 22 and 24.
