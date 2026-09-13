# AunoSkills v0.2 Registry Security Design

## Status
Approved for implementation based on the previously approved AunoSkills architecture and the user's instruction to continue coding without further clarification.

## Goal
Upgrade AunoSkills from SHA-256-only registry integrity to a cryptographically verifiable registry trust model while keeping the CLI local-first, offline-capable, dependency-light, and compatible with static/self-hosted registries.

## Scope
v0.2.0 adds:

- Ed25519-signed registry indexes.
- Ed25519-signed skill manifests.
- Versioned signing keys identified by stable `keyId` values.
- Key validity windows and revocation metadata.
- Registry refresh with cacheable signed trust metadata.
- Offline verification using previously trusted metadata.
- Custom/private registry authentication through credentials supplied at request time, never written to project manifests or lockfiles.
- Trust-aware audit findings for unsigned, invalid, expired, unknown-key, and revoked registry artifacts.
- CLI registry management for add/remove/list/refresh/trust/show.
- Cross-platform and security regression tests.

v0.2.0 does not add:

- AunoSkills Cloud.
- SSO or enterprise RBAC.
- Hosted private registry service.
- Sigstore/keyless signing.
- Transparency log infrastructure.
- Kernel-level execution sandboxing.

## Cryptographic Model
A registry has one or more Ed25519 public keys. Every key has:

- `keyId`: stable identifier derived from or assigned to the public key.
- `algorithm`: `ed25519`.
- `publicKey`: base64-encoded raw/SPKI public-key material in the schema-defined format.
- `validFrom`: optional ISO timestamp.
- `validUntil`: optional ISO timestamp.
- `revokedAt`: optional ISO timestamp.

Registry trust metadata is stored in `trust.json`. The registry index references a `trustDigest` and includes an index signature envelope. Skill versions include a manifest digest and manifest signature envelope.

Signature envelope:

```json
{
  "keyId": "auno-root-2026-01",
  "algorithm": "ed25519",
  "signature": "BASE64_SIGNATURE"
}
```

Signatures cover canonical UTF-8 bytes created by the existing deterministic `stableStringify` serializer, excluding the signature field itself. This prevents whitespace and object-key ordering from changing verification semantics.

## Trust Bootstrapping
The bundled `auno` registry ships with its trusted public key metadata in the npm package. Custom registries are untrusted until the user explicitly configures a trust anchor.

For a custom registry, `registry add` records the registry URL and optional environment-variable credential reference, but does not mark it verified. `registry trust <name> <keyId> <publicKey>` explicitly installs a local trust anchor. Registry-provided keys cannot elevate their own trust automatically.

Trust hierarchy:

1. Locally configured trust anchor.
2. Signed registry trust metadata validated by an already trusted key.
3. Signed registry index validated by an active trusted key.
4. Signed skill manifest validated by an active trusted key.
5. SHA-256 verification of the referenced immutable bundle.

No lower layer may override a failure at a higher layer.

## Key Rotation
A trusted active key may sign `trust.json` containing replacement keys. New keys become trusted only after the trust document is verified by an already trusted, non-revoked key.

Rotation rules:

- A new key may overlap the old key validity window.
- Revoked keys remain recorded so historical verification can explain failures.
- A revoked key cannot sign new trust metadata, indexes, or skill manifests.
- Unknown keys never trigger network-based automatic trust.

## Revocation
`trust.json` may mark keys as revoked with `revokedAt` and an optional reason.

A registry index or manifest signed by a revoked key is rejected for new installs and updates. `audit` reports installed versions whose recorded signer is now revoked.

A cached lockfile is not silently rewritten when revocation is discovered. The user receives an actionable HIGH or CRITICAL finding.

## Registry Protocol v2
Static layout:

```text
registry/
├── trust.json
├── index.json
├── manifests/
│   └── sha256/<digest>.json
└── blobs/
    └── sha256/<digest>
```

`trust.json` contains keys, revocations, and a signature envelope.

`index.json` schema version 2 contains:

- registry id.
- trust digest.
- skill/version records.
- manifest digest.
- manifest signature.
- bundle digest.
- trust/publisher/provenance metadata.
- index signature.

The bundle itself remains addressed by SHA-256.

## Compatibility
The v0.2 client continues to read registry schema v1 for explicitly untrusted/community registries, preserving v0.1 compatibility. The bundled official registry is migrated to schema v2 and requires successful signature verification.

Lockfile version remains v1 in v0.2. New optional fields are added to each locked skill:

```json
{
  "signing": {
    "registryKeyId": "auno-root-2026-01",
    "manifestKeyId": "auno-root-2026-01",
    "verifiedAt": "2026-09-13T00:00:00.000Z"
  }
}
```

`verifiedAt` is diagnostic state and must not participate in deterministic lockfile serialization. Therefore committed lockfiles record key IDs and signature digests, while verification timestamps remain in `.aunoskills/state`.

## Authentication
Custom/private HTTP registries may define an auth configuration in user config:

```json
{
  "registries": {
    "company": {
      "url": "https://registry.example.com",
      "auth": {
        "type": "bearer-env",
        "env": "AUNOSKILLS_COMPANY_TOKEN"
      }
    }
  }
}
```

Rules:

- Tokens are read only at request time.
- Token values are never persisted by AunoSkills.
- Tokens are never written to `aunoskills.json` or `skills-lock.json`.
- Tokens are redacted from structured errors and logs.
- Missing credential environment variables produce a structured registry-auth error.

## Registry Refresh
`aunoskills registry refresh [name]` performs:

1. Fetch trust metadata.
2. Verify trust metadata using the configured trust anchor.
3. Apply valid key rotations/revocations to local user state.
4. Fetch and verify the registry index.
5. Cache verified trust/index metadata for offline verification.

`--offline` never refreshes network metadata and uses only trusted cached metadata.

## Audit Integration
New findings:

- `CRITICAL`: invalid index signature, invalid manifest signature, revoked signing key for installed artifact.
- `HIGH`: unknown signing key, expired signing key, missing signature where policy requires verified registry.
- `MEDIUM`: schema-v1 unsigned registry when policy permits community sources.
- `LOW`: key nearing expiration.

Audit remains explainable and does not reduce these findings to a single safety score.

## CLI Changes
Registry commands:

```text
aunoskills registry list
aunoskills registry show <name>
aunoskills registry add <name> <url>
aunoskills registry add <name> <url> --auth-env <ENV_NAME>
aunoskills registry trust <name> <keyId> <publicKey>
aunoskills registry refresh [name]
aunoskills registry remove <name>
```

The reserved `auno` registry cannot be removed or have its embedded root trust silently replaced.

## Module Boundaries
New focused modules:

- `packages/security/src/signatures.ts`: Ed25519 sign/verify helpers and canonical payload construction.
- `packages/registry/src/trust.ts`: trust document validation, rotation, revocation, and trust-store resolution.
- `packages/registry/src/auth.ts`: request-header construction from credential references.
- `packages/registry/src/verified-registry.ts`: schema-v2 registry verification and cached metadata lifecycle.

Existing `StaticRegistryClient` remains the compatibility client for schema-v1 registries.

## Error Contracts
New structured codes:

```text
AUNO_SIGNATURE_INVALID
AUNO_SIGNING_KEY_UNKNOWN
AUNO_SIGNING_KEY_REVOKED
AUNO_SIGNING_KEY_EXPIRED
AUNO_TRUST_METADATA_INVALID
AUNO_REGISTRY_AUTH_MISSING
AUNO_REGISTRY_AUTH_FAILED
```

Integrity/signature failures are non-retryable unless bytes are fetched from a different configured mirror and verify against the same trusted metadata.

## Testing
TDD coverage must include:

- valid Ed25519 signature verification.
- tampered signed payload rejection.
- unknown/revoked/expired key rejection.
- trust rotation from an already trusted key.
- self-signed unknown key cannot bootstrap itself.
- bearer token injection without token persistence or error leakage.
- schema-v1 compatibility.
- schema-v2 official registry verification.
- offline refresh/cache behavior.
- audit findings for revoked installed signer.
- Windows/macOS/Linux CI on Node 22 and 24.

## Release Boundary
v0.2.0 is complete when the official bundled registry is schema-v2 signed, CLI installs verify index + manifest + bundle, custom registry trust/auth flows are tested, `audit` understands signer state, and the existing v0.1 lifecycle tests continue to pass.