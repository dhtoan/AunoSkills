# AunoSkills v0.3 Secure Publishing & Official Signed Registry Design

## Status
Approved for implementation by the user on 2026-09-13 with instruction to continue coding without further clarification.

## Goal
Close the remaining v0.2 supply-chain gap by making the official `auno` registry cryptographically verifiable in production and by introducing a secure release-signing workflow that never commits a private signing key.

## Scope
v0.3.0 adds:

- a two-tier signing hierarchy: offline root trust key + delegated release signing key;
- root-signed `trust.json` that authorizes active release keys;
- release-key-signed registry index and skill manifests;
- official bundled `auno` registry migrated from schema v1 to signed schema v2;
- release-side commands/scripts to build unsigned deterministic registry payloads, sign them, and independently verify the result;
- official-registry verification wired into the CLI by default;
- release-key rotation and revocation support using the existing trust-store semantics;
- registry verification/status/key-inspection CLI commands;
- GitHub Actions release workflow that consumes signing material only from protected runtime secrets;
- CI/release gates proving that generated signed registry bytes verify and that no private key is present in repository artifacts;
- v0.3 package/version/docs updates.

v0.3.0 does not add:

- AunoSkills Cloud;
- hosted private registry service;
- SSO/RBAC;
- transparency-log infrastructure;
- Sigstore/keyless signing;
- automatic root-key generation or storage;
- a kernel-level execution sandbox.

## Security architecture

The official trust hierarchy is:

```text
offline root private key
        |
        | signs trust.json
        v
root public key pinned in AunoSkills package
        |
        +--> active release public key(s)
                   |
                   | sign manifest payloads
                   | sign index.json
                   v
            official registry v2
                   |
                   v
             SHA-256 bundles
```

The root private key is never required by the CLI, normal CI, package build, or release-signing job. Only the root public key is embedded/pinned in source control.

The release private key is supplied at release time from a protected GitHub Environment secret or equivalent external secret provider. It is never written to repository files, registry output, lockfiles, logs, cache, or build artifacts.

## Trust document ownership

v0.2 `buildSignedStaticRegistry()` can self-sign `trust.json` with the same key that signs registry content. That is acceptable for custom test registries with an explicit external trust anchor, but is not sufficient for the official registry hierarchy.

v0.3 separates trust production from registry-content signing:

- `trust.json` is an input to the official signing pipeline and is signed by the offline root key outside the normal release job;
- the release job validates that `trust.json` is signed by the pinned root public key;
- the release job extracts an active delegated release key from the verified trust document;
- only that delegated key may sign manifests and `index.json`;
- a release private key whose public key/keyId is not currently delegated must fail closed.

The existing single-key builder remains usable for tests/custom registries, but the official pipeline uses a new delegated builder.

## Official trust bootstrap

Source control contains a non-secret official root public-key descriptor:

```json
{
  "keyId": "auno-root-2026-01",
  "algorithm": "ed25519",
  "publicKey": "..."
}
```

The CLI must construct the reserved `auno` registry as a `VerifiedRegistryClient`, never as a legacy `StaticRegistryClient`, when the bundled registry is schema v2.

The reserved root anchor cannot be replaced from user config. Custom registries retain their explicit user-configured anchors.

## Release-key delegation

A root-signed trust document may contain multiple release public keys with validity/revocation metadata.

The signing pipeline receives:

- signed `trust.json`;
- pinned root public key;
- release private key;
- expected release `keyId`;
- skill source directory;
- repository/commit provenance.

Before signing content, it must:

1. verify `trust.json` using the pinned root key;
2. resolve the expected delegated release key;
3. ensure the key is active at signing time;
4. derive/import the public key from the supplied private key and prove it matches the delegated public key;
5. refuse to sign if any check fails.

## Deterministic registry pipeline

The official pipeline is split into three explicit stages:

```text
source skills
  -> deterministic unsigned payload generation
  -> release-key signature application
  -> independent verification
```

Unsigned generation produces canonical manifest bytes, immutable bundle bytes, digests, provenance, and unsigned index payload. Signatures must not affect bundle identities.

Signature application signs canonical manifest bytes and canonical index payload using the delegated release key.

Independent verification uses only public trust material and the generated registry directory. It must not reuse the release private key.

## Registry layout

Official registry remains the v2 static layout:

```text
registry/
├── root.json
├── trust.json
├── index.json
├── manifests/
│   └── sha256/<digest>
└── blobs/
    └── sha256/<digest>
```

`root.json` is the pinned public root descriptor and is not itself secret.

`trust.json` is root-signed.

`index.json` and each manifest signature are release-key-signed.

Bundles remain immutable SHA-256-addressed payloads.

## Release key input

Release signing accepts private key material only at runtime. Supported v0.3 source:

```text
AUNOSKILLS_RELEASE_PRIVATE_KEY
```

The value is expected to be the existing Ed25519 private-key format accepted by the security package.

The release keyId is supplied separately:

```text
AUNOSKILLS_RELEASE_KEY_ID
```

This prevents implicit selection of an arbitrary delegated key.

Errors and debug output must never include private key bytes or complete secret environment values.

## Root trust operations

AunoSkills does not generate/store the root private key in v0.3. Root operations are offline administrative actions.

The repository documents a deterministic trust-document shape and a verification command. Publishing a new root-signed `trust.json` is an intentional administrator action.

Release-key rotation flow:

1. generate new release keypair externally;
2. add new public key to trust document;
3. root-sign updated trust document offline;
4. commit the new `trust.json` and public metadata;
5. configure new release private key in protected release environment;
6. release pipeline verifies delegation and signs registry content;
7. later root-sign a trust document revoking the old release key.

The old release private key is never needed to authorize the replacement.

## CLI behavior

The reserved official registry becomes verified-v2 by default.

New/expanded commands:

```text
aunoskills registry verify [auno|name|path|url]
aunoskills registry status [auno|name]
aunoskills registry keys [auno|name]
aunoskills audit --registry
```

`registry verify auno` verifies root trust, trust delegation, index, manifests on demand and reports signer IDs and schema version.

`registry status auno` reports the active trusted release keys and key validity/revocation status without revealing secrets.

`registry keys auno` reports public key IDs only/public metadata.

`audit --registry` includes registry trust health in addition to installed-skill audit findings.

The normal install/recommend/update path uses the verified official client automatically.

## Error contracts

v0.3 reuses v0.2 signing/trust errors and adds focused release errors:

```text
AUNO_RELEASE_KEY_MISSING
AUNO_RELEASE_KEY_NOT_DELEGATED
AUNO_RELEASE_KEY_MISMATCH
AUNO_OFFICIAL_TRUST_INVALID
AUNO_REGISTRY_VERIFY_FAILED
```

All are structured `AunoError` instances with redacted details.

## GitHub Actions release workflow

Add `.github/workflows/release.yml` with explicit manual/tag release execution.

Security properties:

- `permissions: contents: read` for verification/build jobs;
- signing job uses a protected `environment: release`;
- release private key is read only from environment secret at runtime;
- workflow never echoes the secret;
- signing occurs after deterministic build/tests pass;
- a second verification step validates signed registry output using only public trust material;
- artifact packaging happens only after verification;
- normal PR CI never requires signing secrets.

The v0.3 implementation does not automatically publish npm/GitHub Release unless the repository already exposes an approved credential/action path. The first goal is a secure, reproducible, independently verified signed artifact pipeline.

## CI behavior

Normal `.github/workflows/ci.yml` continues to run without secrets. It must verify the committed official signed registry using public root trust.

Registry reproducibility changes from rebuilding v1 registry bytes to verifying the committed signed-v2 registry plus deterministically rebuilding unsigned content digests. CI must not attempt to reproduce Ed25519 signatures without the release private key.

A test fixture may generate ephemeral in-memory root/release keypairs. Fixture private keys must never be committed as production keys.

## Module boundaries

New focused modules/scripts:

- `packages/registry/src/delegated-build.ts` — delegated release-key validation and official signed-v2 build;
- `packages/registry/src/official.ts` — official root descriptor loading and official verified client construction;
- `scripts/registry-build-unsigned.mjs` — deterministic unsigned official payload build entry;
- `scripts/registry-sign.mjs` — release-secret consuming signing entry;
- `scripts/registry-verify.mjs` — public-only independent verification entry;
- `.github/workflows/release.yml` — protected release-signing workflow.

Existing modules retained:

- `packages/security/src/signatures.ts` — Ed25519 primitives;
- `packages/registry/src/trust.ts` — trust validation/rotation/revocation;
- `packages/registry/src/verified-registry.ts` — runtime verification;
- `packages/registry/src/build.ts` — legacy v1 and single-key/custom registry builders.

## Official registry migration

Migration must preserve the three bundled starter skills and their immutable bundle semantics.

The committed official registry must become schema v2 and include:

- pinned `root.json`;
- valid root-signed `trust.json`;
- release-signed `index.json`;
- immutable manifest blobs;
- existing immutable skill bundles.

Because the root private key cannot be safely generated and committed by ChatGPT/GitHub code changes, production root/release key material must be provisioned externally. Until such real key material exists, code/tests/workflows may use ephemeral keys, but `main` must not falsely label an ephemeral/fixture key as a production root.

Therefore v0.3 code is allowed to merge in two phases:

1. secure publishing infrastructure and verified-official client support;
2. activation of production official v2 registry once real root-signed trust material is supplied.

The package must clearly report the activation state instead of silently downgrading verification.

## Testing

Required TDD coverage:

- root-signed trust delegates a release key;
- release private key must match delegated public key;
- undelegated/wrong/revoked/expired release key fails signing;
- root trust tampering fails before signing;
- deterministic unsigned registry payload generation;
- signed index/manifests verify independently with public keys only;
- private release key never appears in generated files/errors/log-like return values;
- official client uses `VerifiedRegistryClient` when production v2 trust material is active;
- official registry refuses silent trust-anchor replacement;
- `registry verify/status/keys` output is public-only and deterministic;
- `audit --registry` reports official registry trust health;
- CI works with no release secrets;
- release workflow fails clearly when signing secret/keyId is absent;
- release workflow verification uses only public material;
- Windows/macOS/Linux with Node 22/24 retain existing lifecycle behavior.

## Versioning

Package version becomes `0.3.0` only after the secure publishing infrastructure, CLI commands, tests, workflows, and documentation pass exact-head CI.

## Release boundary

v0.3 infrastructure is complete when:

- delegated root/release signing is implemented;
- official registry verification can be activated without code changes once real public trust material is provided;
- normal CI validates the trust pipeline without secrets;
- protected release workflow signs only with a currently delegated release key;
- public-only verification independently validates output;
- no private key is committed or emitted;
- all previous lifecycle/security tests remain green;
- exact-head PR CI and post-merge `main` CI pass across the existing OS/Node matrix.
