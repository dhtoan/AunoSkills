# AunoSkills v0.5.0 — Publisher Identity & Registry Intake

Status: Approved by standing user instruction to continue without further questions
Date: 2026-09-13
Target release: v0.5.0

## 1. Purpose

AunoSkills v0.5.0 closes the trust-and-transport gap between v0.4 authoring and the existing registry verification/signing pipeline.

v0.4 can create, validate, pack, verify, and prepare deterministic author submissions. v0.2/v0.3 can verify and securely sign registry metadata. The missing layer is a deterministic registry intake contract that can authenticate a publisher claim, accept an immutable artifact remotely or through CI, re-validate it independently, and hand an accepted candidate to the existing registry build/signing flow without conflating publisher identity with registry trust.

```text
skill source
  -> pack + verify
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
3. Add a registry-controlled publisher policy mapping package namespaces to allowed publisher public keys.
4. Independently verify publisher attestations without treating them as registry `verified` trust.
5. Add deterministic registry intake that validates submissions, artifacts, publisher policy, namespace ownership, provenance syntax, and immutable-version rules.
6. Produce accepted candidates that existing registry build/signing tooling can consume.
7. Add an HTTP intake client for self-hosted/private registries using existing env-based bearer authentication.
8. Make remote publication idempotent through immutable artifact hashes and deterministic submission identity.
9. Preserve zero runtime npm dependencies.
10. Preserve existing CLI/registry/install behavior and security invariants.

## 3. Non-goals

v0.5.0 does not add AunoSkills Cloud, a hosted marketplace, a long-running registry server, organization accounts, SSO, RBAC, billing, a publisher dashboard, a private-key manager, Sigstore, a transparency log, automatic domain/GitHub ownership proof, arbitrary write hooks, or a kernel-level sandbox.

The release provides contracts, libraries, CLI flows, and an HTTP client suitable for a self-hosted intake service. It intentionally does not ship that hosted service.

## 4. Chosen approach

Three directions were considered:

1. publisher identity + registry intake;
2. marketplace/search UX;
3. team/org policy.

v0.5 selects option 1 because it completes the supply-chain bridge from authoring to registry signing and provides a stronger foundation for later discovery, team controls, and hosted services.

## 5. CLI surface

Extend `skill`:

```text
aunoskills skill
├── init
├── validate
├── inspect
├── pack
├── verify
├── publish
├── attest
└── submit
```

Extend `registry`:

```text
aunoskills registry
├── list
├── show
├── refresh
├── trust
├── status
├── keys
├── verify
└── intake
```

### 5.1 `skill attest`

Signs a deterministic v0.4 submission descriptor.

```bash
AUNOSKILLS_PUBLISHER_PRIVATE_KEY='BASE64_PKCS8' \
  aunoskills skill attest ./skill.submission.json \
  --publisher-key-id acme-release-2026 \
  --output ./skill.attestation.json
```

The private key is read from environment only. The default variable is `AUNOSKILLS_PUBLISHER_PRIVATE_KEY`; `--publisher-key-env <ENV_NAME>` may point to a different variable. Raw private key values are never accepted as CLI values and are never persisted.

### 5.2 `skill submit`

Submits a verified artifact, descriptor, and optional attestation to a configured registry intake endpoint.

```bash
AUNOSKILLS_COMPANY_TOKEN=... \
  aunoskills skill submit ./dist/skill.aunoskill \
  --submission ./dist/skill.submission.json \
  --attestation ./dist/skill.attestation.json \
  --publish-registry company
```

The registry name resolves through existing user registry configuration. Bearer credentials reuse the existing `bearer-env` model.

The reserved official `auno` registry is read-only for this command unless it explicitly advertises an intake endpoint in a future release.

### 5.3 `registry intake`

Performs deterministic local/CI intake.

```bash
npx aunoskills registry intake ./incoming/acme-lint/1.2.0 \
  --publisher-policy ./registry/publishers.json \
  --accepted-workspace ./registry/intake
```

The command independently verifies the artifact, descriptor correspondence, namespace policy, publisher signature when required, provenance syntax, and immutable-version rules. It writes an accepted candidate but does not sign the public registry or assign registry `verified` trust.

## 6. Publisher attestation

Add `PublisherAttestationV1`:

```json
{
  "schemaVersion": 1,
  "publisher": "acme",
  "packageId": "acme/security-review",
  "version": "1.0.0",
  "submissionDigest": "<64 lowercase hex>",
  "artifactDigest": "<64 lowercase hex>",
  "signature": {
    "keyId": "acme-release-2026",
    "algorithm": "ed25519",
    "signature": "BASE64_SIGNATURE"
  }
}
```

Normative rules:

- persisted digest fields use bare lowercase 64-hex, matching existing AunoSkills integrity fields;
- `submissionDigest` is SHA-256 of canonical `SkillSubmissionV1` bytes produced by `stableStringify` without transport-only whitespace;
- `artifactDigest` exactly equals `submission.artifact.sha256`;
- publisher/package/version exactly match the submission;
- the signature covers a domain-separated canonical payload;
- the attestation contains no private material and no trust tier.

The signing payload is:

```json
{
  "domain": "aunoskills.publisher-attestation.v1",
  "publisher": "acme",
  "packageId": "acme/security-review",
  "version": "1.0.0",
  "submissionDigest": "<64 lowercase hex>",
  "artifactDigest": "<64 lowercase hex>"
}
```

It is serialized with the existing stable JSON serializer and signed with Ed25519.

## 7. Publisher policy

Add registry-controlled `PublisherPolicyV1`:

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

Publisher keys reuse existing signing-key lifecycle fields (`validFrom`, `validUntil`, `revokedAt`, `revocationReason`).

Rules:

- policy belongs to the registry operator, never the author;
- author-supplied public keys cannot bootstrap namespace ownership;
- `<publisher>/<name>` must match a policy namespace of `<publisher>`;
- `SkillSubmissionV1.publisher`, when present, must match the namespace;
- unknown, revoked, expired, or not-yet-valid keys fail closed when signatures are required;
- unsigned intake is allowed only where policy explicitly sets `requireSignature: false`;
- publisher authentication never changes registry trust tier by itself.

## 8. Accepted candidate

Add `RegistryIntakeCandidateV1`:

```json
{
  "schemaVersion": 1,
  "packageId": "acme/security-review",
  "runtimeName": "security-review",
  "version": "1.0.0",
  "publisher": "acme",
  "artifact": {
    "sha256": "<64 lowercase hex>",
    "path": "artifacts/sha256/<digest>.aunoskill"
  },
  "submissionDigest": "<64 lowercase hex>",
  "publisherVerification": {
    "required": true,
    "verified": true,
    "keyId": "acme-release-2026"
  },
  "provenance": {
    "sourceRepository": "https://github.com/acme/skills",
    "sourceCommit": "<exact commit SHA>"
  },
  "capabilities": {},
  "dependencies": {}
}
```

This is an intake record, not a public registry manifest and not a trust statement.

Default workspace:

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

Writes are atomic and immutable. Identical re-intake is idempotent. Different bytes for an existing package/version fail with `AUNO_REGISTRY_VERSION_EXISTS`. Accepted records contain no timestamp, random request ID, hostname, or machine-specific absolute path.

## 9. Intake pipeline

```text
artifact bytes
  -> independent .aunoskill verification
submission bytes
  -> SkillSubmissionV1 validation
  -> package/version/runtime/artifact correspondence
attestation bytes (when present/required)
  -> schema validation
  -> submission/artifact digest match
  -> namespace policy lookup
  -> key lifecycle check
  -> Ed25519 verification
provenance
  -> exact immutable commit syntax when present
  -> URL syntax only; no live ownership lookup
accepted candidate
  -> deterministic serialization
  -> immutable atomic write
```

No stage executes skill code.

## 10. Remote intake protocol

A registry configuration may optionally add:

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

Remote submission is two-step and idempotent.

### Artifact upload

```text
PUT <intake-url>/artifacts/sha256/<artifact-digest>
Content-Type: application/vnd.aunoskills.skill+json
Idempotency-Key: sha256:<artifact-digest>
Body: exact .aunoskill bytes
```

Expected statuses: `201` created, `200` identical replay, `409` immutable conflict, `401/403` auth failure, `413` size limit, other non-2xx failure.

### Submission upload

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

Expected statuses: `201` accepted, `200` identical replay, `409` immutable conflict, `422` validation/policy failure, `401/403` auth failure.

Authenticated writes fail closed on cross-origin redirects. v0.5 does not automatically retry arbitrary write failures; explicit caller retry is safe because request identity is deterministic.

## 11. Remote-client security

- reuse `bearer-env` auth;
- resolve tokens only at request time;
- never persist or render token values;
- locally verify artifact/submission/attestation before upload;
- `--offline` fails before network access;
- response error bodies are size-capped and sanitized;
- authorization headers are never echoed in errors;
- URL path components are encoded and cannot inject traversal segments;
- no cross-origin authenticated redirect following.

## 12. Architecture

```text
packages/authoring/src/
└── attest.ts

packages/registry/src/
├── publisher-policy.ts
├── intake.ts
├── intake-client.ts
└── intake-types.ts

packages/schema/src/
├── types.ts
└── validate.ts

apps/cli/src/
├── args.ts
├── skill.ts
└── main.ts
```

Boundary rules:

- schema owns normative contracts;
- authoring owns author-side attestation creation;
- registry owns publisher-policy verification, deterministic intake, and remote transport;
- shared/security own generic primitives only where already appropriate;
- CLI parses/routes/renders;
- public registry signing remains in existing delegated release tooling.

## 13. Trust semantics

v0.5 distinguishes:

```text
artifactValid
publisherAuthenticated
registryAccepted
registryVerified
```

These are independent. A valid publisher signature never directly sets `TrustLevel` to `verified`.

## 14. Error contracts

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

Existing global exit-code categories remain stable.

## 15. CLI flags

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

No flag accepts a raw private key.

## 16. JSON output

All new commands use the existing versioned envelope.

`skill attest` reports paths/digests/key ID only. `skill submit` reports registry, artifact/submission digests, HTTP outcomes, and optional remote reference. `registry intake` reports accepted package/version, digests, publisher-verification evidence, and workspace-relative paths. Secrets never appear.

## 17. Testing

Unit/contract tests cover attestation schema, canonical submission digest, domain separation, Ed25519 sign/verify, publisher policy, key lifecycle, namespace matching, candidate serialization, and URL encoding.

Integration tests cover `publish -> attest -> intake`, accepted-candidate output, idempotent repeat intake, conflicting same-version rejection, remote artifact/submission PUT using injected fetch, bearer-env auth, and offline rejection.

Adversarial tests cover wrong submission/artifact digests, unknown/self-supplied/revoked/expired/not-yet-valid keys, namespace mismatch, tampered artifacts, traversal-like remote components, cross-origin redirects, token redaction, oversized/malformed error bodies, and remote `409` conflicts.

Cross-platform tests require deterministic signing payload digest and accepted-candidate bytes on Ubuntu/macOS/Windows under Node 22/24.

## 18. CI release gates

All existing gates remain mandatory. v0.5 adds:

```text
publisher attestation round-trip
publisher policy negative fixtures
registry intake immutability fixture
remote intake mock transport fixture
credential redaction fixture
cross-platform candidate digest fixture
```

Exact-head PR CI and post-merge `main` CI are release requirements.

## 19. Compatibility and versioning

Target release is `0.5.0` because the release adds public CLI commands, schema contracts, registry intake configuration, and public registry-intake APIs.

Backward compatibility:

- v0.4 `skill publish` output remains valid;
- registries without `intake` stay read-only from the CLI;
- existing `RegistryClient` read interface remains unchanged;
- existing registry signing/trust remains authoritative;
- `SkillSubmissionV1` remains valid and is signed by digest rather than replaced.

## 20. Documentation

Update `README.md`, `SECURITY.md`, `CHANGELOG.md`, `packages/authoring/README.md`, and registry package documentation. Document `publish -> attest -> submit`, publisher policy, local intake, self-hosted HTTP contract, and the four separate trust states.

## 21. Completion criteria

v0.5.0 is complete when:

- deterministic publisher attestations are created without persisting private keys;
- attestations verify only against registry-controlled namespace policy;
- self-supplied/unknown/inactive publisher keys fail closed;
- `registry intake` emits deterministic immutable accepted candidates;
- `skill submit` performs idempotent remote artifact/submission writes using env-based auth;
- remote errors redact credentials;
- no runtime dependency is added;
- publisher authentication never self-assigns registry `verified` trust;
- existing v0.4 authoring, registry, install, resolver, materialization, and security suites stay green;
- Ubuntu/macOS/Windows Node 22/24 matrix passes;
- exact-head PR CI and post-merge `main` CI pass.

## 22. Invariants

1. Publisher authentication is not registry verification.
2. Registry policy, not author data, decides which publisher keys are authorized for a namespace.
3. Private publisher keys are runtime-only inputs and are never persisted by AunoSkills.
4. Publisher signatures are domain-separated from registry signatures.
5. Public registry trust anchors remain authoritative for `verified` trust.
6. Intake re-verifies artifacts independently.
7. Package/version immutability is enforced before mutation.
8. Remote writes use immutable hashes and deterministic request identity.
9. Auth tokens are referenced by environment-variable name only and never persisted or rendered.
10. Authoring/intake never executes skill code.
11. CLI remains a routing/rendering layer.
12. Existing v0.4 submission descriptors remain backward compatible.
