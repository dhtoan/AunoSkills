<div align="center">

# AunoSkills

### Explainable, policy-aware skill management for AI coding agents

Detect your stack. Recommend the right skills. Verify what you install. Materialize once for the agents you actually use.

[![CI](https://github.com/dhtoan/AunoSkills/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dhtoan/AunoSkills/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.3.0-0A7AFF?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?style=flat-square&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-Apache--2.0-2F74C0?style=flat-square)
![Runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-2EA44F?style=flat-square)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-555?style=flat-square)

[Quick start](#quick-start) · [How it works](#how-it-works) · [Security](#security-by-design) · [Supported agents](#supported-agents) · [Architecture](#architecture) · [Contributing](#contributing)

</div>

---

AunoSkills is a CLI-first package manager and trust layer for `SKILL.md`-based AI coding skills.

It scans a project, builds an evidence model of the stack and workspaces, recommends relevant skills, resolves them under project security policy, verifies registry integrity and signer provenance, and materializes the result for multiple coding agents from one project-level source of truth.

```bash
npx aunoskills
```

AunoSkills is designed around three principles:

| Principle | What it means |
| --- | --- |
| **Intelligence** | Recommendations come from project evidence and remain explainable. |
| **Trust** | Relevance, provenance, integrity, signer state, and policy are evaluated separately. |
| **Control** | No silent execution, no silent trust downgrade, and project mutations are transactional. |

> **Current release:** `v0.3.0` — delegated root/release signing infrastructure, deterministic secure-publishing entrypoints, official-registry trust inspection, and a protected release workflow.

## Quick start

### 1. Run AunoSkills in a project

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

For unattended initialization:

```bash
npx aunoskills --yes
```

`--yes` skips ordinary confirmation. It does **not** bypass trust, signature, integrity, or capability policy.

### 2. Inspect before changing anything

```bash
npx aunoskills detect
npx aunoskills recommend
npx aunoskills explain typescript-quality
```

Machine-readable mode is available for automation:

```bash
npx aunoskills detect --json
npx aunoskills recommend --json
```

### 3. Install reproducibly

```bash
npx aunoskills install
npx aunoskills install --frozen-lockfile
```

For an exact offline restore when the required verified artifacts already exist in cache:

```bash
npx aunoskills restore --offline
```

Offline mode never disables integrity or signature verification.

## Why AunoSkills

AI coding agents increasingly support reusable instruction bundles, but the surrounding lifecycle is still fragmented: discovery, trust, versioning, portability, updates, rollback, and CI reproducibility are often handled manually.

AunoSkills puts those concerns behind one deterministic project contract.

| Problem | AunoSkills |
| --- | --- |
| “Which skills does this repo actually need?” | Evidence-based scanner + recommendation engine |
| “Why was this skill recommended?” | Explainable evidence and confidence model |
| “Can I trust this package?” | Trust tiers, hashes, Ed25519 signatures, provenance, signer state |
| “Will this work across my agents?” | Adapter-based materialization for six coding agents |
| “Can CI reproduce my local setup?” | Human manifest + deterministic lockfile + frozen installs |
| “What if an update goes wrong?” | Transactional writes, crash recovery, doctor, rollback |
| “Can a downloaded skill execute code silently?” | Capability-aware, default-deny execution policy |
| “Can I use private registries?” | Custom registry support with explicit trust anchors and env-based auth |

## How it works

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

That separation is intentional:

- The **scanner** understands projects, not skills.
- The **recommender** consumes evidence, but does not crawl the filesystem itself.
- The **resolver** is deterministic; AI enrichment never decides package versions.
- **Adapters** produce materialization plans; they do not own filesystem writes.
- The **core transaction layer** commits or rolls back mutations atomically.

### Project state

A normal repository uses two committed files:

```text
aunoskills.json    # human-authored project intent
skills-lock.json   # exact resolved, reproducible state
```

Generated/local state is kept separate:

```text
.aunoskills/state/    # transactions, ownership, diagnostics; gitignored
.agents/skills/       # shared portable materializations
.claude/skills/       # Claude Code materializations
```

Global caches remain outside the project:

```text
~/.aunoskills/cache/               # content-addressed bundles
~/.aunoskills/registries/<name>/   # verified registry metadata cache
```

## Supported agents

AunoSkills `v0.3.0` targets six coding-agent ecosystems.

| Agent | Portable project target | Native specialization when needed |
| --- | --- | --- |
| OpenAI Codex | `.agents/skills/` | `.agents/skills/` |
| Claude Code | `.claude/skills/` | `.claude/skills/` |
| Cursor | `.agents/skills/` | `.cursor/skills/` |
| Windsurf | `.agents/skills/` | `.windsurf/skills/` |
| GitHub Copilot | `.agents/skills/` | `.github/skills/` |
| OpenCode | `.agents/skills/` | `.opencode/skills/` |

Portable skills are shared where agent discovery conventions overlap, so one canonical skill does not need six independent copies by default.

Vendor-specific rendering is used only when a skill declares an extension that requires it.

## Security by design

AunoSkills treats a skill package as untrusted input until its source, metadata, integrity, signer state, and requested capabilities have been evaluated.

### Trust is not relevance

A skill can be highly relevant and still be blocked by security policy.

| Trust tier | Meaning |
| --- | --- |
| `verified` | Source is allowed by policy and registry-v2 verification succeeds against an explicit trust anchor. |
| `community` | Known source and integrity metadata without verified-registry endorsement. |
| `untrusted` | Local, arbitrary, or otherwise unverified source. |

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

The implementation uses Node.js built-in `crypto` for Ed25519 verification; AunoSkills has **zero runtime npm dependencies**.

A registry cannot bootstrap its own trust merely by publishing a self-signed key. Initial trust must be configured explicitly or delivered through a trusted package/release channel. Rotations and revocations must be authorized by an already trusted active key.

### Capability policy

Downloading a skill does not grant it execution rights.

Capability metadata can describe access such as:

```text
filesystem.read
filesystem.write
shell.execute
network.connect
env.read
process.spawn
git.write
agent.modify-config
secrets.request
```

Permission escalation is reviewed independently of semantic versioning. A PATCH or MINOR release cannot silently acquire new execution rights.

### Audit and repair

```bash
npx aunoskills doctor
npx aunoskills doctor --check
npx aunoskills doctor --fix

npx aunoskills audit
npx aunoskills audit --registry
npx aunoskills audit --fail-on high
```

Audit can report missing signer proof, unsigned community sources, unknown or expired signing keys, revoked keys, untrusted sources, dangerous capabilities, and official-registry trust health.

A revoked signer is a `CRITICAL` finding.

For the full security model and reporting guidance, see **[SECURITY.md](SECURITY.md)**.

## Secure publishing

AunoSkills `v0.3.0` separates long-lived root authority from routine release signing.

```text
offline root private key
        │
        │ signs trust.json
        ▼
pinned root public key
        │
        └── delegated release public key(s)
                       │
                       │ sign index + manifests
                       ▼
                  registry v2
```

Release tooling is split into explicit stages:

```bash
npm run registry:unsigned
npm run registry:sign
npm run registry:verify
npm pack
```

- `registry:unsigned` is deterministic and secret-free.
- `registry:sign` accepts protected runtime signing material.
- `registry:verify` independently verifies with public trust material only.
- Packaging occurs only after public verification succeeds.

The protected GitHub release workflow uses the `release` environment with repository permissions limited to `contents: read` during the signing job.

> **Official registry status:** the bundled `auno` starter registry currently reports `legacy-awaiting-production-trust`. The secure publishing pipeline is implemented, but this repository intentionally does not contain a fixture private key, deterministic private seed, or fake production root.

Inspect the current state with:

```bash
npx aunoskills registry status auno
npx aunoskills registry keys auno
npx aunoskills registry verify auno
npx aunoskills audit --registry
```

## Custom and private registries

Add a registry:

```bash
npx aunoskills registry add company https://registry.example.com
```

Reference a bearer token by environment variable name:

```bash
npx aunoskills registry add company https://registry.example.com \
  --auth-env AUNOSKILLS_COMPANY_TOKEN
```

The token value is read only at request time. It is never written to `aunoskills.json`, `skills-lock.json`, or AunoSkills user config.

Install an explicit Ed25519 trust anchor:

```bash
npx aunoskills registry trust company root-2026 BASE64_SPKI_PUBLIC_KEY
```

Inspect or refresh registry state:

```bash
npx aunoskills registry show company --json
npx aunoskills registry refresh company
npx aunoskills registry list
```

Custom registries without a configured anchor remain on the schema-v1 compatibility path. Registries with explicit anchors use the verified registry-v2 client.

## CLI at a glance

### Discover

```bash
npx aunoskills detect
npx aunoskills recommend
npx aunoskills explain <skill>
```

### Manage the project

```bash
npx aunoskills init
npx aunoskills add <skill>
npx aunoskills remove <skill>
npx aunoskills install
npx aunoskills update
npx aunoskills restore
npx aunoskills rollback
```

### Inspect health

```bash
npx aunoskills list
npx aunoskills outdated
npx aunoskills doctor
npx aunoskills audit
npx aunoskills sync
```

### Manage infrastructure

```bash
npx aunoskills registry list
npx aunoskills cache status
npx aunoskills config list
```

Common flags:

```text
-y, --yes
--dry-run
--json
--verbose
--quiet
--offline
--no-ai
--frozen-lockfile
--agent <name>
--project <path>
--auth-env <ENV_NAME>
```

The deterministic engine works without AI. `--no-ai` is reserved for the optional enrichment layer and does not change deterministic scanning.

## Reproducible CI

`aunoskills.json` describes intent. `skills-lock.json` records exact versions, integrity hashes, effective trust, provenance, capabilities, dependency edges, materialization records, and deterministic signer evidence when available.

Typical CI setup:

```bash
npm install --ignore-scripts
npx aunoskills install --frozen-lockfile
npx aunoskills doctor --check
npx aunoskills audit --fail-on high
```

The AunoSkills repository itself dogfoods the same model through its committed manifest and lockfile.

GitHub Actions validates the project on:

| Operating system | Node 22 | Node 24 |
| --- | :---: | :---: |
| Ubuntu | ✅ | ✅ |
| macOS | ✅ | ✅ |
| Windows | ✅ | ✅ |

The CI gate also runs security fixtures, E2E lifecycle tests, deterministic registry rebuilds, and registry reproducibility checks.

## Bundled starter registry

The repository dogfoods three original starter skills:

- `typescript-quality`
- `node-cli-quality`
- `security-review`

Schema-v1 compatibility remains available while production root trust for the official registry is provisioned. Custom verified-v2 registries can already use the signed-registry pipeline with their own explicit anchors.

## Architecture

The runtime is intentionally modular so CLI, future UI surfaces, CI integrations, and hosted services can reuse the same engine.

```text
apps/cli
   │
   ▼
packages/core
   ├── detector + evidence
   ├── recommender
   ├── resolver
   ├── registry
   ├── security
   ├── store
   ├── transaction
   ├── schema
   └── agent adapters
```

Key invariants:

- CLI contains orchestration and presentation, not duplicated business logic.
- Resolver behavior is deterministic.
- CAS content is immutable.
- Agent directories are generated outputs, never canonical source.
- Adapters plan; Core writes.
- Failed verification never mutates the project.
- Every managed materialization is integrity-tracked.
- Mutation flows are transactional and recoverable.

Design documents:

- [AunoSkills v1 design](docs/superpowers/specs/2026-09-13-aunoskills-v1-design.md)
- [Registry security design](docs/superpowers/specs/2026-09-13-aunoskills-v0.2-registry-security-design.md)
- [Secure publishing design](docs/superpowers/specs/2026-09-13-aunoskills-v0.3-secure-publishing-design.md)

## Development

### Requirements

- Node.js `>=22`
- npm `10.x` or compatible package manager behavior
- Windows, macOS, or Linux

Install development dependencies:

```bash
npm install --ignore-scripts
```

Run the complete verification pipeline:

```bash
npm run verify
```

Or run individual gates:

```bash
npm run format:check
npm run typecheck
npm run build
npm test
npm run test:security
npm run test:e2e
npm run benchmark
```

Rebuild the bundled compatibility registry deterministically:

```bash
npm run registry:build
```

Exercise unsigned secure-publishing inputs without secrets:

```bash
REGISTRY_SOURCE_COMMIT=<commit> npm run registry:unsigned
```

Production signing additionally requires externally provisioned public root/trust material and protected release signing variables. Private signing keys must never be committed.

## Contributing

Contributions are welcome across the CLI, detection rules, agent adapters, security tooling, registry infrastructure, tests, documentation, and starter skills.

Before opening a pull request:

```bash
npm install --ignore-scripts
npm run verify
npm run registry:build
git diff --exit-code -- registry/index.json registry/blobs
```

Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for repository workflow and contribution expectations.

Security issues should follow **[SECURITY.md](SECURITY.md)** rather than a public issue when disclosure could put users at risk.

## Project status

AunoSkills is currently a CLI-first open-source project.

### Available today

- Explainable project detection and skill recommendations
- Deterministic version resolution and lockfiles
- Six-agent materialization
- Content-addressed caching
- Transactional install/update/remove/restore/rollback
- Doctor and audit workflows
- Verified registry-v2 support for explicitly trusted registries
- Ed25519 signature verification and key revocation/rotation primitives
- Secure publishing pipeline with root/release key separation
- Cross-platform CI on Windows, macOS, and Linux

### Intentionally not part of `v0.3.0`

- AunoSkills Cloud
- Hosted private-registry service
- Team dashboard
- SSO / enterprise RBAC
- Production official-registry root material embedded in the repository

See **[CHANGELOG.md](CHANGELOG.md)** for release history.

## License and clean-room boundary

AunoSkills CLI/core, schemas, adapters, registry tooling, and bundled original starter skills are licensed under **[Apache-2.0](LICENSE)**.

The project was designed after studying the general workflow and product idea of other skill installers, including AutoSkills, but AunoSkills is a clean-room implementation. Its source code, schemas, registry format, security model, CLI architecture, starter skills, documentation, and branding were written independently.

Code or assets governed by AutoSkills' CC BY-NC 4.0 license are not incorporated into this repository.

---

<div align="center">

**AunoSkills** · Intelligence · Trust · Control

[Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [License](LICENSE)

</div>
