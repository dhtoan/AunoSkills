# `packages/registry`

`packages/registry` owns registry read/verification behavior, publisher namespace policy, deterministic intake, authenticated remote intake transport, and the existing registry build/signing pipeline.

AunoSkills v0.5 keeps four states deliberately separate:

```text
artifactValid
publisherAuthenticated
registryAccepted
registryVerified
```

They are not interchangeable.

- **artifactValid** means a `.aunoskill` container and its file hashes are internally valid.
- **publisherAuthenticated** means a publisher attestation verifies against a key authorized by registry-controlled namespace policy.
- **registryAccepted** means the registry intake policy accepted immutable package/version bytes.
- **registryVerified** means public registry metadata later verifies against configured/pinned registry trust anchors.

A publisher signature never directly assigns the `verified` trust tier.

## Read interface compatibility

The existing `RegistryClient` read interface remains unchanged in v0.5:

```text
loadIndex
listSkills
getVersion
fetchBundle
getVerification?
getSigningKeyStatus?
```

The optional intake endpoint is registry configuration metadata used by author-side submission transport; it is not a write method on the read client.

## Publisher namespace policy

`PublisherPolicyV1` is controlled by the registry operator.

Example:

```json
{
  "schemaVersion": 1,
  "namespaces": {
    "acme": {
      "requireSignature": true,
      "keys": [
        {
          "keyId": "acme-release-2026",
          "algorithm": "ed25519",
          "publicKey": "BASE64_SPKI",
          "validFrom": "2026-01-01T00:00:00Z"
        }
      ]
    }
  }
}
```

Rules:

- `<publisher>/<name>` is bound to the first package-ID segment;
- author metadata cannot authorize a new namespace key;
- unknown keys fail closed;
- revoked, expired, or not-yet-valid keys fail closed;
- unsigned intake is allowed only when the registry explicitly sets `requireSignature: false`;
- publisher-key lifecycle checks do not change public-registry trust semantics.

## Local / CI intake

```bash
npx aunoskills registry intake ./skill.aunoskill \
  --submission ./skill.submission.json \
  --attestation ./skill.attestation.json \
  --publisher-policy ./publishers.json \
  --accepted-workspace ./registry-intake
```

The intake pipeline performs verification before mutation:

```text
artifact bytes
  -> independent .aunoskill verification
submission descriptor
  -> package/version/runtime/artifact correspondence
publisher attestation
  -> canonical submission digest + artifact digest
publisher policy
  -> namespace authorization + key lifecycle + Ed25519 verification
accepted candidate
  -> deterministic serialization
  -> immutable atomic write
```

No intake step executes skill code.

## Accepted workspace

Default layout:

```text
<accepted-workspace>/
├── artifacts/
│   └── sha256/
│       └── <artifact-digest>.aunoskill
└── accepted/
    └── <publisher>/
        └── <runtime-name>/
            └── <version>.json
```

Properties:

- artifact bytes are content-addressed;
- package/version candidate records are immutable;
- identical re-intake is idempotent;
- conflicting bytes for an existing package/version fail closed;
- candidate records contain no timestamps, random request IDs, machine hostnames, or absolute host paths;
- accepted candidates are intake records, not public signed registry manifests.

## Remote intake configuration

A custom registry may configure an intake endpoint:

```json
{
  "url": "https://registry.example.com",
  "intake": {
    "url": "https://registry.example.com/v1/intake"
  },
  "auth": {
    "type": "bearer-env",
    "env": "AUNOSKILLS_COMPANY_TOKEN"
  }
}
```

`skill submit` uses a minimal two-PUT idempotent protocol.

### 1. Artifact upload

```text
PUT <intake-url>/artifacts/sha256/<artifact-digest>
Content-Type: application/vnd.aunoskills.skill+json
Idempotency-Key: sha256:<artifact-digest>
Body: exact .aunoskill bytes
```

### 2. Submission upload

```text
PUT <intake-url>/submissions/<publisher>/<runtime-name>/<version>
Content-Type: application/vnd.aunoskills.submission+json
Idempotency-Key: sha256:<submission-digest>
```

The submission body contains the validated `SkillSubmissionV1` and optional `PublisherAttestationV1`.

## Remote transport security

The client:

- verifies artifact/submission/attestation correspondence before network access;
- derives the publisher path component from the verified package namespace rather than trusting attestation metadata;
- resolves bearer credentials only from the configured environment-variable name at request time;
- never persists the bearer value;
- uses `redirect: manual` and does not forward authenticated writes to another origin;
- does not automatically retry arbitrary write failures;
- caps diagnostic response bodies before rendering errors;
- redacts bearer token values from diagnostics;
- rejects remote submission under `--offline` before invoking fetch.

The reserved `auno` registry is read-only to this workflow unless a future release explicitly advertises a writable intake endpoint.

## Public registry signing remains authoritative

Publisher intake does not replace the existing registry release hierarchy:

```text
offline root trust
  -> delegated release public key
  -> release-key-signed registry index/manifests
  -> public verification against trust anchors
```

An accepted publisher candidate can feed later deterministic registry build/signing automation, but only that existing signed registry path can establish public `registryVerified` state.

## Tests

Publisher/intake coverage is split across:

```text
packages/registry/test/publisher-policy.test.ts
packages/registry/test/publisher-determinism.test.ts
packages/registry/test/intake.test.ts
packages/registry/test/intake-client.test.ts
apps/cli/test/publisher-intake.test.ts
test/security-fixtures/publisher-intake.test.ts
```

The complete repository suite runs on Ubuntu, macOS, and Windows with Node.js 22 and 24.
