# `packages/authoring`

`packages/authoring` implements the local, publisher-side workflow introduced in AunoSkills v0.4.0.

It owns source-skill initialization, secure inventory, validation, explainable capability inference, inspection, deterministic `.aunoskill` packaging, independent artifact verification, and publication-submission/workspace output.

## Boundary

The package deliberately does **not** own registry trust or release signing.

```text
skill source
  -> init / validate / inspect
  -> deterministic pack
  -> independent verify
  -> publish submission/workspace
  -> registry review + signing (outside this package)
```

A valid `.aunoskill` artifact is not automatically trusted. Registry trust remains external and can only become authoritative through the existing registry verification and signing pipeline.

## Public workflow

```text
aunoskills skill init
aunoskills skill validate
aunoskills skill inspect
aunoskills skill pack
aunoskills skill verify
aunoskills skill publish
```

The CLI routes these commands into this package. Business logic must stay here rather than being duplicated in `apps/cli`.

## Identity

For v0.4:

- `auno.json.id` is the package ID, for example `acme/security-review`.
- the runtime/materialization name is derived from the final package-ID segment, for example `security-review`.
- `publisher` is author metadata, not a trust assertion.
- runtime-name aliases are intentionally unsupported in v0.4.

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

The canonical JSON/base64 format favors portability and inspectability over compression. It adds encoding overhead, but avoids platform-specific archive metadata and additional runtime dependencies.

## Security invariants

Authoring operations never execute skill scripts.

Publishable inventories reject or block:

- path traversal and absolute paths;
- case-insensitive collisions;
- symlinks;
- credential-like files such as `.env`, private keys, SSH keys, credential JSON, and service-account files;
- malformed dependency metadata;
- high-severity capability declaration/inference mismatches.

`.aunoignore` can exclude additional files but cannot re-include security-blocked paths.

`--yes` never bypasses these invariants.

## Determinism

The same normalized fixture has one golden cross-platform artifact digest, verified in GitHub Actions across Linux, macOS, and Windows. Pack output intentionally excludes volatile filesystem metadata.

## Publication

`publish` supports two v0.4 outputs:

1. deterministic submission metadata for registry automation;
2. an immutable local registry-workspace layout.

Publishing is idempotent when existing bytes are identical and fails on same-version byte conflicts. It does not mint registry signatures, persist private signing keys, or assign `verified` trust.

## Tests

Coverage lives in:

```text
packages/authoring/test/
test/e2e/authoring-*.test.ts
test/security-fixtures/authoring-*.test.ts
```

The repository CI matrix runs the full suite on Ubuntu, macOS, and Windows with Node.js 22 and 24.
