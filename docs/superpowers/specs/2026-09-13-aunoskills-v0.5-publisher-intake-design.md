# AunoSkills v0.5.0 — Publisher Identity & Registry Intake

Status: Approved by standing user instruction to continue without further questions
Date: 2026-09-13
Target release: v0.5.0

## 1. Purpose

AunoSkills v0.5.0 closes the trust-and-transport gap between the v0.4 authoring workflow and the existing registry verification/signing pipeline.

v0.4 can create, validate, pack, verify, and prepare deterministic author submissions. v0.2/v0.3 can verify and securely sign registry metadata. The missing layer is a deterministic registry intake contract that can authenticate a publisher claim, accept an immutable artifact remotely or through CI, re-validate it independently, and hand an accepted candidate to the existing registry build/signing flow without conflating publisher identity with registry trust.

Primary lifecycle:

```text
skill source
  -> v0.4 pack + verify
  -> publication submission
  -> publisher attestation
  -> registry intake
  -> namespace/publisher policy validation
  -> independent artifact verification
  -> immutable accepted candidate
  -> existing unsigned registry build
  -> existing delegated registry signing
  -> public registry verification
```

v0.5 remains local-first and self-hostable. It does not introduce AunoSkills Cloud or a hosted marketplace.

## 2. Goals

v0.5.0 must:

1. Add a deterministic publisher-attestation format over an exact v0.4 submission digest.
2. Sign attestations with Ed25519 using runtime-only private key material and never persist private keys.
3. Add a registry-controlled publisher policy mapping namespaces to allowed publisher public keys.
4. Independently verify publisher attestations without treating them as registry `verified` trust.
5. Add a deterministic registry-intake library that validates submissions, artifacts, publisher policy, namespace ownership, provenance syntax, and immutable-version rules.
6. Produce accepted candidates that existing registry build/signing tooling can consume.
7. Add an HTTP intake client for self-hosted/private registries using existing env-based bearer authentication.
8. Make remote publication idempotent and safe to retry by using immutable artifact hashes and deterministic submission identity.
9. Preserve zero runtime npm dependencies.
10. Preserve existing CLI/registry/install behavior and all security invariants from v0.1-v0.4.

## 3. Non-goals

v0.5.0 does not add:

- AunoSkills Cloud.
- A hosted public marketplace.
- A long-running registry server implementation.
- Organization accounts, SSO, RBAC, billing, publisher dashboards, or web UI.
- A private-key manager or key-generation custody service.
- Registry trust elevation from publisher signatures alone.
- Transparency logs or Sigstore/keyless signing.
- Automatic domain/GitHub ownership verification.
- Arbitrary registry write hooks.
- A kernel-level sandbox.

The release provides contracts, libraries, CLI flows, and an HTTP client suitable for a self-hosted intake service. It intentionally does not ship that hosted service.

## 4. Design choice

Three directions were considered:

1. **Publisher identity + registry intake** — complete the supply-chain bridge from authoring to registry signing.
2. Marketplace/search — improve discovery before the publisher/registry handoff is fully defined.
3. Team/org policy — add enterprise policy before the package supply chain is complete.

v0.5 selects option 1. It provides the strongest foundation for later discovery, team controls, and hosted services while keeping trust boundaries explicit.

## 5. New CLI surface

Extend the existing `skill` namespace:

```text
aunoskills skill
├── init
├── validate
├── inspect
├── pack
├── verify
├── publish
├── attest        # new
└── submit        # new remote intake client
```

Extend the `registry` namespace:

```text
aunoskills registry
├── list
├── show
├── refresh
├── trust
├── status
├── keys
├── verify
└── intake        # new deterministic local/CI intake
```

### 5.1 `skill attest`

Signs an existing deterministic submission descriptor.

Example:

```bash
AUNOSKILLS_PUBLISHER_PRIVATE_KEY='BASE64_PKCS8' \
  aunoskills skill attest ./my-skill-1.0.0.submission.json \
  --publisher-key-id acme-release-2026 \
  --output ./my-skill-1.0.0.attestation.json
```

Required inputs:

- exact submission descriptor;
- `--publisher-key-id`;
- private key from an environment variable, default `AUNOSKILLS_PUBLISHER_PRIVATE_KEY`, overridable only by an explicit environment-variable name flag.

The command must never accept raw private key material as a positional argument or persist it to config.

### 5.2 `skill submit`

Submits a verified artifact + descriptor + optional publisher attestation to a configured registry intake endpoint.

Example:

```bash
AUNOSKILLS_COMPANY_TOKEN=... \
  aunoskills skill submit ./dist/my-skill.aunoskill \
  --submission ./dist/my-skill.submission.json \
  --attestation ./dist/my-skill.attestation.json \
  --publish-registry company
```

The registry name is resolved through existing user registry configuration. Bearer credentials reuse the existing `bearer-env` model.

`skill submit` must not submit to the reserved official `auno` registry unless that registry explicitly advertises an intake endpoint in future metadata. v0.5 does not assume the bundled official registry accepts direct author writes.

### 5.3 `registry intake`

Performs deterministic local/CI intake from a submission directory or explicit artifact/descriptor/attestation paths.

Example:

```bash
npx aunoskills registry intake ./incoming/acme-lint/1.2.0 \
  --publisher-policy ./registry/publishers.json \
  --accepted-workspace ./registry/intake
```

The command:

1. verifies the artifact independently;
2. validates the submission descriptor;
3. verifies exact artifact/submission correspondence;
4. validates publisher namespace policy;
5. verifies publisher signature when policy requires it;
6. applies immutable version checks;
7. writes a deterministic accepted candidate.

It does not sign the public registry index or mark the skill as registry `verified`.

## 6. Publisher attestation schema

Add `PublisherAttestationV1`:

```json
{
  "schemaVersion": 1,
  "publisher": "acme",
  "packageId": "acme/security-review",
  "version": "1.0.0",
  "submissionDigest": "sha256:...",
  "artifactDigest": "sha256:...",
  "signature": {
    "keyId": "acme-release-2026",
    "algorithm": "ed25519",
    "signature": "BASE64_SIGNATURE"
  }
}
```

Normative rules:

- `submissionDigest` is SHA-256 of exact canonical submission bytes without trailing transport metadata.
- `artifactDigest` must equal the artifact digest in the submission descriptor.
- `publisher`, `packageId`, and `version` must exactly match the submission descriptor.
- signature input is a domain-separated canonical payload, not the JSON bytes containing the signature itself.
- the domain string is `aunoskills.publisher-attestation.v1`.
- signature algorithm is Ed25519 only in v0.5.
- attestation contains no private material and no trust tier.

## 7. Publisher policy schema

Add a registry-controlled `PublisherPolicyV1` document:

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

Optional key lifecycle fields reuse existing signing-key semantics:

- `validFrom`;
- `validUntil`;
- `revokedAt`;
- `revocationReason`.

Rules:

- policy is controlled by the registry operator, not the skill author;
- a publisher cannot embed a new key and thereby authorize itself;
- namespace `<publisher>/<name>` requires policy namespace equal to the first package-ID segment;
- when `SkillSubmissionV1.publisher` is present it must match the namespace;
- unknown, revoked, expired, or not-yet-valid keys fail closed when signature is required;
- an unsigned submission may be accepted only when the namespace policy explicitly sets `requireSignature: false`;
- publisher policy authenticates a publisher claim but does not assign registry trust tier.

## 8. Domain-separated signing payload

The attestation signature covers canonical JSON of:

```json
{
  "domain": "aunoskills.publisher-attestation.v1",
  "publisher": "acme",
  "packageId": "acme/security-review",
  "version": "1.0.0",
  "submissionDigest": "sha256:...",
  "artifactDigest": "sha256:..."
}
```

The payload is serialized with the existing stable JSON serializer and encoded as UTF-8 before Ed25519 signing.

This prevents a valid signature from being reused as another AunoSkills signature type.

## 9. Registry intake candidate schema

Accepted intake output is deterministic and unsigned:

```json
{
  "schemaVersion": 1,
  "packageId": "acme/security-review",
  "runtimeName": "security-review",
  "version": "1.0.0",
  "publisher": "acme",
  "artifact": {
    "sha256": "...",
    "path": "artifacts/sha256/<digest>.aunoskill"
  },
  "submissionDigest": "...",
  "publisherVerification": {
    "required": true,
    "verified": true,
    "keyId": "acme-release-2026"
  },
  "provenance": {
    "sourceRepository": "https://github.com/acme/skills",
    "sourceCommit": "<40-hex commit>"
  },
  "capabilities": {},
  "dependencies": {}
}
```

The candidate is an intake record, not a public registry manifest and not a trust statement.

## 10. Accepted workspace layout

Default deterministic local layout:

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

Rules:

- artifact content is immutable by digest;
- package/version accepted record is immutable by bytes;
- identical re-intake is idempotent;
- different artifact or candidate bytes for the same package/version fails with `AUNO_REGISTRY_VERSION_EXISTS`;
- writes use atomic temp + rename patterns already used elsewhere;
- accepted records contain no timestamps, request IDs, machine paths, or mutable transport data.

## 11. Intake validation pipeline

```text
artifact bytes
  -> verify .aunoskill schema/path/hash integrity
  -> extract and validate metadata
submission bytes
  -> canonical submission validation
  -> verify package/version/runtime/artifact match
attestation bytes (optional/required by policy)
  -> schema validation
  -> canonical digest match
  -> namespace policy lookup
  -> key lifecycle validation
  -> Ed25519 verification
provenance
  -> exact commit syntax when present
  -> URL syntax only; no live network ownership proof
accepted candidate
  -> deterministic serialization
  -> immutable write
```

No stage executes skill code.

## 12. Remote intake protocol

v0.5 defines a minimal client protocol for self-hosted registries.

A registry configuration may optionally contain:

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

Remote submit is a two-step idempotent protocol:

### 12.1 Artifact upload

```text
PUT <intake-url>/artifacts/sha256/<artifact-digest>
Content-Type: application/vnd.aunoskills.skill+json
Idempotency-Key: sha256:<artifact-digest>
Body: exact .aunoskill bytes
```

Expected statuses:

- `201` created;
- `200` already present with identical bytes;
- `409` immutable digest collision/server inconsistency;
- `401/403` authentication/authorization failure;
- `413` server artifact limit;
- other non-2xx is failure.

### 12.2 Submission creation

```text
PUT <intake-url>/submissions/<publisher>/<runtime-name>/<version>
Content-Type: application/vnd.aunoskills.submission+json
Idempotency-Key: sha256:<submission-digest>
```

Body:

```json
{
  "schemaVersion": 1,
  "submission": { "...": "SkillSubmissionV1" },
  "attestation": { "...": "PublisherAttestationV1" }
}
```

Expected statuses:

- `201` accepted for intake;
- `200` idempotent replay;
- `409` same package/version with conflicting immutable bytes;
- `422` semantic/policy validation failure;
- `401/403` authentication/authorization failure.

No automatic redirect to a different origin is followed for authenticated write requests unless the HTTP implementation can prove same-origin safety. v0.5 should fail closed on cross-origin redirect for authenticated submission.

## 13. Remote client security

- existing bearer-env auth is reused;
- token values are resolved at request time only;
- token values never appear in structured errors, JSON output, or persisted config beyond the env variable name;
- remote write requests are not automatically retried on arbitrary 5xx responses;
- idempotent replay is safe when the caller explicitly retries the same immutable bytes;
- artifact bytes are locally verified before upload;
- submission/attestation are validated locally before upload;
- HTTP response bodies are size-capped before being included in errors;
- response error text is sanitized and never echoes request authorization headers;
- `--offline` rejects remote submit before network access.

## 14. Registry/client architecture

Add focused modules instead of growing the CLI:

```text
packages/authoring/src/
├── attest.ts
└── publish.ts          # existing publication descriptor/workspace behavior remains

packages/registry/src/
├── publisher-policy.ts
├── intake.ts
├── intake-client.ts
└── intake-types.ts

packages/schema/src/
├── types.ts
└── validate.ts

apps/cli/src/
├── skill.ts
├── args.ts
└── main.ts
```

Boundary rules:

- schema owns normative documents;
- authoring owns author-side attestation creation;
- registry owns publisher-policy verification, deterministic intake, and remote intake transport;
- security/shared provide generic crypto/hash/path helpers where already appropriate;
- CLI only parses flags/routes/renders;
- public registry signing remains in existing registry release tooling.

## 15. Trust semantics

v0.5 explicitly distinguishes four states:

```text
artifactValid
publisherAuthenticated
registryAccepted
registryVerified
```

They are not interchangeable.

- `artifactValid`: `.aunoskill` structure and hashes are valid.
- `publisherAuthenticated`: attestation verifies against registry-controlled publisher policy.
- `registryAccepted`: intake policy accepted the immutable candidate.
- `registryVerified`: public registry v2 metadata later verifies against registry trust anchors.

A valid publisher signature never directly changes `TrustLevel` to `verified`.

## 16. Error contracts

Add stable errors as needed:

```text
AUNO_PUBLISHER_ATTESTATION_INVALID
AUNO_PUBLISHER_KEY_REQUIRED
AUNO_PUBLISHER_KEY_UNKNOWN
AUNO_PUBLISHER_KEY_INACTIVE
AUNO_PUBLISHER_SIGNATURE_INVALID
AUNO_PUBLISHER_NAMESPACE_DENIED
AUNO_REGISTRY_INTAKE_INVALID
AUNO_REGISTRY_INTAKE_CONFLICT
AUNO_REGISTRY_INTAKE_AUTH
AUNO_REGISTRY_INTAKE_UNAVAILABLE
AUNO_REGISTRY_INTAKE_RESPONSE_INVALID
AUNO_REGISTRY_VERSION_EXISTS
```

Existing exit-code categories remain stable. Authentication/network failures map to existing registry/network categories; policy/signature/integrity failures remain fail-closed.

## 17. CLI flags

Add:

```text
--publisher-key-id <id>
--publisher-key-env <ENV_NAME>
--submission <path>
--attestation <path>
--publish-registry <name>
--publisher-policy <path>
--accepted-workspace <path>
```

Default publisher-key environment variable:

```text
AUNOSKILLS_PUBLISHER_PRIVATE_KEY
```

No flag may accept a raw private key value.

## 18. JSON output

All new commands use the existing envelope.

`skill attest` data includes:

```text
attestationPath
publisher
packageId
version
submissionDigest
artifactDigest
keyId
```

`skill submit` data includes:

```text
registry
artifactDigest
submissionDigest
artifactStatus
submissionStatus
remoteReference?
```

`registry intake` data includes:

```text
accepted
packageId
version
artifactDigest
submissionDigest
publisherVerification
acceptedRecordPath
artifactPath
```

No secret or raw authorization data appears in outputs.

## 19. Testing strategy

### Unit/contract

- attestation schema validation;
- deterministic submission digest;
- domain-separated signing payload;
- Ed25519 attestation sign/verify;
- publisher policy parsing;
- key validity/revocation handling;
- namespace matching;
- accepted candidate serialization;
- intake URL path encoding.

### Integration

- v0.4 publish -> attest -> intake;
- intake -> accepted candidate;
- repeated identical intake idempotency;
- conflicting same-version intake rejection;
- remote artifact PUT + submission PUT using injected fetch;
- bearer-env authorization header added only at request time;
- offline remote submit rejected before fetch.

### Adversarial

- attestation over wrong submission digest;
- attestation over wrong artifact digest;
- unknown/self-supplied publisher key;
- revoked/expired/not-yet-valid publisher key;
- publisher namespace mismatch;
- tampered artifact after attestation;
- path traversal in remote submission path components;
- cross-origin redirect attempt;
- token redaction from errors;
- huge/malformed error response;
- remote 409 immutable conflict.

### Cross-platform

Deterministic attestation payload digest and accepted-candidate bytes must match across Ubuntu/macOS/Windows on Node 22/24.

## 20. CI release gates

Existing gates remain mandatory. v0.5 adds:

```text
publisher attestation round-trip
publisher policy negative fixtures
registry intake immutability fixture
remote intake mock transport fixture
credential redaction fixture
cross-platform candidate digest fixture
```

Exact-head PR CI and post-merge `main` CI are release requirements.

## 21. Compatibility and versioning

Target release: `0.5.0`.

Reasons:

- new public CLI commands;
- new schema contracts;
- new registry configuration field for intake endpoints;
- new public registry-intake library APIs.

Backward compatibility:

- existing v0.4 `skill publish` output remains valid;
- existing registries without `intake` configuration remain read-only from the CLI;
- existing `RegistryClient` read interface remains unchanged;
- existing registry signing/trust model remains authoritative;
- `SkillSubmissionV1` remains valid and is signed by digest rather than replaced.

## 22. Documentation changes

Update:

- `README.md`;
- `SECURITY.md`;
- `CHANGELOG.md`;
- `packages/authoring/README.md`;
- registry package documentation.

Add a concise publisher/intake guide covering:

```text
publish -> attest -> submit
publisher policy
registry intake
trust-state distinctions
self-hosted HTTP contract
```

## 23. Completion criteria

v0.5.0 is complete when:

- deterministic publisher attestations can be created without persisting private keys;
- publisher attestations verify against registry-controlled policy;
- self-supplied/unknown/inactive publisher keys fail closed;
- `registry intake` produces deterministic immutable accepted candidates;
- `skill submit` performs idempotent remote artifact/submission writes using existing env-based auth;
- remote errors redact credentials;
- no new runtime npm dependency is added;
- no author/publisher signature assigns registry `verified` trust;
- existing v0.4 authoring, registry, install, resolver, materialization, and security suites remain green;
- Ubuntu/macOS/Windows Node 22/24 matrix passes;
- exact-head PR CI and post-merge `main` CI both pass.

## 24. Invariants

1. Publisher authentication is not registry verification.
2. Registry policy, not author data, decides which publisher keys are authorized for a namespace.
3. Private publisher keys are runtime-only inputs and are never persisted by AunoSkills.
4. Publisher signatures are domain-separated from registry signatures.
5. Existing public registry trust anchors remain authoritative for `verified` trust.
6. Intake re-verifies artifacts independently; it never trusts author-side verification claims.
7. Package/version immutability is enforced before accepted candidate mutation.
8. Remote writes use immutable hashes and deterministic submission identity.
9. Auth tokens are referenced by environment-variable name only and are never persisted or rendered.
10. Authoring/intake operations never execute skill code.
11. The CLI remains a routing/rendering layer, not a business-logic owner.
12. Existing v0.4 submission descriptors stay backward compatible.
