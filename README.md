<div align="center">

# AunoSkills

### Explainable, policy-aware skill management for AI coding agents

Detect your stack. Recommend the right skills. Author portable skills. Verify what you install. Materialize once for the agents you actually use.

[![CI](https://github.com/dhtoan/AunoSkills/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dhtoan/AunoSkills/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.4.0-0A7AFF?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?style=flat-square&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-Apache--2.0-2F74C0?style=flat-square)
![Runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-2EA44F?style=flat-square)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-555?style=flat-square)

[Quick start](#quick-start) · [Author skills](#author-and-publish-skills) · [Security](#security-by-design) · [Supported agents](#supported-agents) · [Architecture](#architecture) · [Contributing](#contributing)

</div>

---

AunoSkills is a CLI-first package manager, authoring toolkit, and trust layer for `SKILL.md`-based AI coding skills.

It can inspect a project and recommend skills, resolve and materialize them reproducibly, verify registry provenance and artifact integrity, and now take a skill author through a deterministic `init → validate → inspect → pack → verify → publish` workflow.

```bash
npx aunoskills
```

AunoSkills is designed around three principles:

| Principle | What it means |
| --- | --- |
| **Intelligence** | Recommendations come from project evidence and remain explainable. |
| **Trust** | Relevance, author claims, provenance, integrity, signer state, and policy are evaluated separately. |
| **Control** | No silent execution, no silent trust elevation, and project mutations are transactional. |

> **Current release:** `v0.4.0` — skill authoring, deterministic `.aunoskill` artifacts, independent verification, publication submissions, and the existing secure registry/release trust pipeline.

## Quick start

### Install or initialize skills for a project

```bash
npx aunoskills
```

With no subcommand, AunoSkills behaves like `init`:

```text
scan project
    ↓
build evidence graph
    ↓
recommend relevant skills
    ↓
resolve versions + trust policy
    ↓
verify registry / bundle integrity
    ↓
write manifest + lockfile
    ↓
materialize skills for selected agents
```

Inspect before changing anything:

```bash
npx aunoskills detect
npx aunoskills recommend
npx aunoskills explain typescript-quality
```

Install reproducibly:

```bash
npx aunoskills install
npx aunoskills install --frozen-lockfile
npx aunoskills restore --offline
```

`--yes` can skip ordinary confirmation. It does **not** bypass trust, signature, integrity, path-safety, or capability policy.

## Why AunoSkills

Reusable AI-agent instructions are becoming common, but discovery, authoring, trust, versioning, portability, updates, rollback, and CI reproducibility are still fragmented.

AunoSkills puts those concerns behind deterministic contracts.

| Problem | AunoSkills |
| --- | --- |
| “Which skills does this repo actually need?” | Evidence-based scanner + recommendation engine |
| “Why was this skill recommended?” | Explainable evidence and confidence model |
| “How do I create a portable skill correctly?” | `skill init`, source validation, inspection, capability inference |
| “Can I package the same bytes on every OS?” | Canonical `.aunoskill` container + cross-platform golden digest |
| “Is this artifact structurally valid?” | Independent artifact verification |
| “Can I trust this package?” | Trust tiers, hashes, Ed25519 signatures, provenance, signer state |
| “Will this work across my agents?” | Adapter-based materialization for six coding agents |
| “Can CI reproduce my local setup?” | Human manifest + deterministic lockfile + frozen installs |
| “What if an update goes wrong?” | Transactional writes, crash recovery, doctor, rollback |
| “Can a downloaded skill execute code silently?” | Capability-aware policy; authoring checks never execute skill code |
| “Can I use private registries?” | Custom registry support with explicit trust anchors and env-based auth |

## Author and publish skills

AunoSkills v0.4 adds a first-class author workflow without creating a hosted marketplace or weakening the registry trust boundary.

```text
skill source
    ↓
init
    ↓
validate
    ↓
inspect
    ↓
pack
    ↓
verify
    ↓
publish submission / workspace
    ↓
registry review + signing
```

### Create a portable skill

```bash
npx aunoskills skill init acme/security-review
```

The default source remains standard-first:

```text
security-review/
├── SKILL.md
└── auno.json
```

`SKILL.md` is the agent-facing source of truth. `auno.json` carries package-manager metadata such as package identity, version, publisher, compatibility, capabilities, and skill dependencies.

For v0.4, `auno.json.id` is the package ID and the runtime name is derived from its final path segment:

```text
acme/security-review
     └──────┬──────┘
        runtimeName
```

### Validate and inspect

```bash
npx aunoskills skill validate ./security-review
npx aunoskills skill inspect ./security-review
npx aunoskills skill inspect ./security-review --json
```

Validation covers metadata, portable identity, semver, source paths, secret-like files, symlinks, dependencies, compatibility, capability declarations, and security findings.

Capability inference is intentionally explainable and conservative. It can flag evidence such as network URLs, shell/process instructions, environment-variable reads, Git mutation, filesystem writes, and possible secret access. Inference is a review signal — never permission to execute.

### Pack deterministically

```bash
npx aunoskills skill pack ./security-review --output ./dist/security-review.aunoskill
```

`.aunoskill` v1 is a canonical JSON distribution container with exact file bytes encoded as base64.

Its artifact identity excludes volatile host metadata:

```text
normalized POSIX paths
+ lexical file ordering
+ exact file bytes
+ per-file SHA-256
+ canonical metadata
- timestamps
- uid / gid
- host absolute paths
- platform path separators
= deterministic artifact SHA-256
```

The repository locks one normalized fixture to the same golden artifact digest across Ubuntu, macOS, and Windows.

### Verify independently

```bash
npx aunoskills skill verify ./dist/security-review.aunoskill
npx aunoskills skill verify ./dist/security-review.aunoskill --json
```

Verification treats the artifact as untrusted input and independently checks container schema, paths, duplicate/case-colliding entries, canonical base64, file sizes/hashes, manifest correspondence, embedded `auno.json`, `SKILL.md`, dependencies, and capabilities.

> **Important:** `artifactValid: true` does **not** mean registry `verified`. Artifact validity and registry trust are separate security properties.

### Prepare publication

Create a deterministic registry submission:

```bash
npx aunoskills skill publish ./security-review --output submission.json
```

Or publish into an explicitly writable local registry workspace:

```bash
npx aunoskills skill publish ./security-review \
  --registry-workspace ../registry-workspace
```

Publication is immutable by version: identical existing bytes are idempotent; different bytes at the same package/version are rejected.

Authoring does not mint official registry signatures, store private signing keys, or assign `verified` trust. The registry still performs independent review, validation, signing, and publication.

See [`packages/authoring/README.md`](packages/authoring/README.md) for the package boundary and artifact format.

## How installation works

AunoSkills separates project intelligence from package resolution and filesystem mutation.

```text
Project Scanner
      │
      ▼
Evidence Graph
      │
      ▼
Recommendation Engine
      │
      ▼
Policy-aware Resolver
      │
      ▼
Registry / Trust / Integrity
      │
      ▼
Content-addressed Store
      │
      ▼
Agent Adapter Planner
      │
      ▼
Transactional Materialization
```

A normal project uses two committed contracts:

```text
aunoskills.json    # human-authored project intent
skills-lock.json   # exact resolved, reproducible state
```

Machine-local state remains separate:

```text
.aunoskills/state/                 # transactions / ownership / diagnostics
~/.aunoskills/cache/               # content-addressed bundles
~/.aunoskills/registries/<name>/   # verified registry metadata cache
```

## Supported agents

AunoSkills v0.4 targets six coding-agent ecosystems.

| Agent | Portable project target | Native specialization when needed |
| --- | --- | --- |
| OpenAI Codex | `.agents/skills/` | `.agents/skills/` |
| Claude Code | `.claude/skills/` | `.claude/skills/` |
| Cursor | `.agents/skills/` | `.cursor/skills/` |
| Windsurf | `.agents/skills/` | `.windsurf/skills/` |
| GitHub Copilot | `.agents/skills/` | `.github/skills/` |
| OpenCode | `.agents/skills/` | `.opencode/skills/` |

Portable skills are shared where agent conventions overlap. Native fan-out is used only when an extension actually requires it.

## Security by design

AunoSkills separates relevance, author claims, artifact validity, registry trust, authenticity, integrity, and requested capability.

### Authoring source boundary

Authoring operations never execute skill code. Publishable inventories reject symlinks and block common credential-like files such as `.env`, private-key files, SSH keys, credential JSON, and service-account files.

`.aunoignore` can exclude additional content, but cannot re-include security-blocked paths.

### Registry trust is external

| Trust tier | Meaning |
| --- | --- |
| `verified` | Registry-v2 verification succeeds against an explicit/pinned trusted anchor. |
| `community` | Known source/integrity metadata without verified-registry endorsement. |
| `untrusted` | Local, arbitrary, author-produced, or otherwise unverified source. |

A skill cannot become `verified` by putting that word in `auno.json`, a `.aunoskill` artifact, or a publication submission.

### Registry-v2 verification

```text
configured / pinned trust anchor
            ↓
      signed trust.json
            ↓
       signed index.json
            ↓
manifest SHA-256 + Ed25519 signature
            ↓
       bundle SHA-256
```

A registry cannot bootstrap its own trust with an unknown self-signed key. Rotations and revocations require authorization from an already trusted active key.

### Audit and repair

```bash
npx aunoskills doctor --check
npx aunoskills audit --registry
npx aunoskills audit --fail-on high
```

A revoked signer is a `CRITICAL` finding.

For the complete security model and disclosure guidance, see **[SECURITY.md](SECURITY.md)**.

## Secure registry publishing

Long-lived root authority is separated from routine release signing:

```text
offline root private key
        ↓ signs trust.json
pinned root public key
        ↓ delegates
release public key(s)
        ↓ sign index + manifests
registry v2
```

Release tooling is explicitly staged:

```bash
npm run registry:unsigned
npm run registry:sign
npm run registry:verify
npm pack
```

The protected GitHub release workflow uses a `release` environment and verifies public output before packaging.

> **Official registry status:** the bundled `auno` starter registry remains `legacy-awaiting-production-trust` until authentic production public root/trust material is externally provisioned. No fixture private key or fake production root is committed.

## Custom and private registries

```bash
npx aunoskills registry add company https://registry.example.com
npx aunoskills registry add company https://registry.example.com \
  --auth-env AUNOSKILLS_COMPANY_TOKEN
npx aunoskills registry trust company root-2026 BASE64_SPKI_PUBLIC_KEY
npx aunoskills registry refresh company
```

Only the credential environment-variable name is stored; token values are read at request time and are not persisted in project/lock/user registry config.

## CLI at a glance

### Discover and install

```bash
npx aunoskills detect
npx aunoskills recommend
npx aunoskills explain <skill>
npx aunoskills add <skill>
npx aunoskills install
npx aunoskills update
npx aunoskills restore
npx aunoskills rollback
```

### Author skills

```bash
npx aunoskills skill init <publisher>/<skill>
npx aunoskills skill validate <dir>
npx aunoskills skill inspect <dir>
npx aunoskills skill pack <dir>
npx aunoskills skill verify <artifact>
npx aunoskills skill publish <dir>
```

### Inspect health and infrastructure

```bash
npx aunoskills list
npx aunoskills outdated
npx aunoskills doctor
npx aunoskills audit
npx aunoskills registry list
npx aunoskills cache status
npx aunoskills config list
```

Machine-readable JSON output is available across the command surface through the existing versioned envelope.

## Reproducible CI

The AunoSkills repository itself dogfoods its manifest/lockfile and verifies the full project on:

| Operating system | Node 22 | Node 24 |
| --- | :---: | :---: |
| Ubuntu | ✅ | ✅ |
| macOS | ✅ | ✅ |
| Windows | ✅ | ✅ |

Release gates include:

```text
format
→ typecheck
→ compiled build
→ unit/contract tests
→ authoring tests
→ security fixtures
→ E2E lifecycle
→ cross-platform authoring determinism
→ deterministic registry rebuild
→ registry diff gate
```

## Architecture

AunoSkills keeps authoring, installation, trust, and agent rendering behind focused boundaries.

```text
                         ┌──────────────────────┐
                         │      apps/cli        │
                         └──────────┬───────────┘
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
                 ▼                                     ▼
       packages/authoring                       packages/core
   init/validate/inspect                   detect/recommend/resolve
     pack/verify/publish                     transact/materialize
                 │                                     │
                 └──────────────┬──────────────────────┘
                                ▼
                 schema / security / registry
                      store / adapters / shared
```

Boundary rules:

- CLI parses arguments and renders structured results; authoring business logic lives in `packages/authoring`.
- Scanner knows projects, not skill packages.
- Recommender consumes evidence, not the filesystem directly.
- Resolver behavior is deterministic.
- Registry trust/signing remains outside authoring.
- CAS objects are immutable.
- Adapters plan materialization; Core owns filesystem mutation.
- Failed verification never mutates the project.

Design documents:

- [AunoSkills v1 design](docs/superpowers/specs/2026-09-13-aunoskills-v1-design.md)
- [Registry security design](docs/superpowers/specs/2026-09-13-aunoskills-v0.2-registry-security-design.md)
- [Secure publishing design](docs/superpowers/specs/2026-09-13-aunoskills-v0.3-secure-publishing-design.md)
- [Skill authoring design](docs/superpowers/specs/2026-09-13-aunoskills-v0.4-skill-authoring-design.md)

## Development

Requirements:

- Node.js `>=22`
- npm `10.x` or compatible behavior
- Windows, macOS, or Linux

```bash
npm install --ignore-scripts
npm run verify
```

Individual gates:

```bash
npm run format:check
npm run typecheck
npm run build
npm test
npm run test:security
npm run test:e2e
npm run benchmark
```

Rebuild the compatibility registry deterministically:

```bash
npm run registry:build
```

## Contributing

Contributions are welcome across authoring, the CLI, project detection, recommendation, agent adapters, security tooling, registry infrastructure, tests, documentation, and starter skills.

Before opening a pull request:

```bash
npm install --ignore-scripts
npm run verify
npm run registry:build
git diff --exit-code -- registry/index.json registry/blobs
```

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** for repository workflow. Report sensitive security issues through the process in **[SECURITY.md](SECURITY.md)**.

## Project status

### Available today

- Explainable project detection and skill recommendations
- Deterministic version resolution and lockfiles
- Six-agent materialization
- Transactional install/update/remove/restore/rollback
- Content-addressed caching, doctor, and audit
- Ed25519 verified-registry v2 support with rotation/revocation primitives
- Root/release secure publishing infrastructure
- Portable skill initialization, validation, and inspection
- Deterministic `.aunoskill` packing and independent artifact verification
- Immutable publication submissions/local registry workspaces
- Cross-platform CI and golden authoring artifact determinism

### Intentionally not part of v0.4.0

- AunoSkills Cloud
- Hosted marketplace or private-registry service
- Publisher/team dashboard
- SSO / enterprise RBAC / billing
- Transparency log
- Private signing-key manager
- Kernel-level sandboxing
- Fake or fixture production official-registry trust material

See **[CHANGELOG.md](CHANGELOG.md)** for release history.

## License and clean-room boundary

AunoSkills CLI/core, authoring toolkit, schemas, adapters, registry tooling, and bundled original starter skills are licensed under **[Apache-2.0](LICENSE)**.

AunoSkills is a clean-room implementation. The source code, schemas, registry/artifact formats, security model, CLI architecture, starter skills, documentation, and branding are written independently; third-party non-compatible source/assets are not incorporated into the repository.

---

<div align="center">

**AunoSkills** · Intelligence · Trust · Control

[Security](SECURITY.md) · [Authoring](packages/authoring/README.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [License](LICENSE)

</div>
