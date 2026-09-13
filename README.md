# AunoSkills

**Explainable, policy-aware skill management for AI coding agents.**

AunoSkills scans a project, builds an evidence model of its technology stack and workspaces, recommends relevant `SKILL.md` bundles, verifies their source and integrity, and materializes them for the AI coding agents you use.

```bash
npx aunoskills
```

AunoSkills v0.3.0 is a CLI-first open-source release. It adds delegated root/release signing infrastructure, deterministic secure-publishing entrypoints, official-registry trust/status inspection, and a protected GitHub release workflow. AunoSkills Cloud, hosted private-registry service, team dashboard, SSO, and enterprise RBAC are **not** part of this release.

## Why AunoSkills

AunoSkills is built around three principles:

- **Intelligence** — detect project evidence first and explain every deterministic recommendation.
- **Trust** — keep provenance, trust tier, immutable integrity, cryptographic signer evidence, and security policy separate from relevance.
- **Control** — never silently execute skill code, never silently weaken trust, and make project mutations transactional and reversible.

AunoSkills uses the standard `SKILL.md` entrypoint. `auno.json` adds optional package-manager metadata without replacing the portable skill instructions.

## Requirements

- Node.js 22 or newer
- Windows, macOS, or Linux

## Quick start

```bash
npx aunoskills
```

With no subcommand, AunoSkills behaves like `init`: it scans the project, recommends high-confidence skills, writes `aunoskills.json`, resolves an immutable `skills-lock.json`, verifies bundles, and materializes the selected skills.

```bash
npx aunoskills --yes
```

`--yes` skips ordinary confirmation; it does **not** bypass trust, signature, integrity, or capability policy.

## Detect, recommend, and explain

```bash
npx aunoskills detect
npx aunoskills detect --json
npx aunoskills recommend
npx aunoskills explain typescript-quality
```

Recommendations retain monorepo workspace scope, so a technology found only in `apps/storefront` is not flattened into an unexplained repository-wide result.

## Install and lifecycle commands

```bash
npx aunoskills add typescript-quality@1.0.0
npx aunoskills install
npx aunoskills install --dry-run
npx aunoskills restore
npx aunoskills update
npx aunoskills remove typescript-quality
npx aunoskills rollback
```

## Reproducible CI installs

`aunoskills.json` describes project intent. `skills-lock.json` records exact versions, integrity hashes, effective trust, provenance, capabilities, dependencies, materialization records, and when available deterministic signer IDs/signature digests.

```bash
npx aunoskills install --frozen-lockfile
npx aunoskills restore --offline
```

Offline mode never disables integrity or signature verification. Verified registry metadata may be cached only after successful verification and is reverified when reused offline. Bundle bytes continue to use the content-addressed cache.

## Doctor and audit

```bash
npx aunoskills doctor
npx aunoskills doctor --check
npx aunoskills doctor --fix
npx aunoskills audit
npx aunoskills audit --registry
npx aunoskills audit --fail-on high
```

Audit can report missing signer proof, unsigned community sources, unknown/expired signing keys, revoked keys, untrusted sources, dangerous capabilities, and official-registry trust health. A revoked signer is a CRITICAL finding. Audit threshold failures use exit code `10`; materialization check failures use exit code `8`.

## Stable JSON mode

```bash
npx aunoskills recommend --json
```

The stable envelope remains versioned independently of the CLI release:

```json
{
  "schemaVersion": 1,
  "command": "recommend",
  "ok": true,
  "data": {}
}
```

Errors use the same envelope with `ok: false` and an `error` object containing a stable error code and category.

## Supported agents

AunoSkills v0.3.0 targets:

- OpenAI Codex
- Claude Code
- Cursor
- Windsurf
- GitHub Copilot
- OpenCode

Portable skills are shared where agent discovery conventions overlap:

```text
.agents/skills/<skill>/
  Codex
  Cursor
  Windsurf
  GitHub Copilot
  OpenCode

.claude/skills/<skill>/
  Claude Code
```

Agent-specific rendering is used only when a skill declares an extension that actually requires it.

## Trust tiers

AunoSkills keeps relevance and trust separate.

- `verified` — source is allowed by policy and, for registry v2, index/manifest cryptographic verification succeeds against an explicit trust anchor.
- `community` — known source/integrity metadata without verified-registry endorsement.
- `untrusted` — local, arbitrary, or otherwise unverified source.

A skill can be highly relevant and still be blocked by trust or capability policy.

## Signed registry v2

A registry v2 uses:

```text
registry/
├── root.json           # official registry only when production root trust is active
├── trust.json
├── index.json
├── manifests/
│   └── sha256/<digest>
└── blobs/
    └── sha256/<digest>
```

Runtime verification is fail-closed:

```text
configured/pinned trust anchor
  -> signed trust.json
  -> signed index.json
  -> manifest SHA-256 + Ed25519 signature
  -> bundle SHA-256
```

The implementation uses Ed25519 from Node.js built-in `crypto`; no runtime cryptography dependency is added.

A registry cannot make itself trusted merely by publishing and self-signing a new key. Initial trust must be configured explicitly or delivered through a trusted package/release channel. Key rotations and revocations must be authorized by an already trusted active key.

## Secure official publishing in v0.3

AunoSkills v0.3 separates long-lived root authority from routine release signing:

```text
offline root private key
        |
        | signs trust.json
        v
pinned root public key
        |
        +--> delegated release public key(s)
                   |
                   | sign index + manifests
                   v
             registry v2
```

The root private key is never needed by the CLI, normal CI, or package builds. The release private key is accepted only at release runtime through:

```text
AUNOSKILLS_RELEASE_PRIVATE_KEY
AUNOSKILLS_RELEASE_KEY_ID
```

The selected release private key must match an active public key delegated by the root-signed trust document. Missing, mismatched, revoked, expired, or undelegated keys fail closed.

The release pipeline is deliberately split into stages:

```bash
npm run registry:unsigned
npm run registry:sign
npm run registry:verify
npm pack
```

`registry:unsigned` is secret-free and deterministic. `registry:sign` consumes protected runtime signing material. `registry:verify` independently validates the result with public trust material only; it does not receive the private key.

GitHub Actions includes `.github/workflows/release.yml`. Its signing job uses the protected `release` environment, repository permissions remain `contents: read`, and packaging happens only after public verification succeeds.

### Official registry activation status

The bundled `auno` starter registry currently reports `legacy-awaiting-production-trust`. Secure v0.3 publishing and official verified-v2 activation code are implemented, but this repository intentionally does **not** contain a fixture private key, deterministic private seed, or fake production root.

Activation requires authentic externally provisioned public root metadata plus a root-signed `trust.json`, with the corresponding delegated release private key configured in the protected GitHub `release` environment. Once that material exists, the v0.3 pipeline can activate official signed-v2 operation without redesigning the runtime.

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

For bearer authentication, store only an environment-variable reference:

```bash
npx aunoskills registry add company https://registry.example.com \
  --auth-env AUNOSKILLS_COMPANY_TOKEN
```

The token value is read only at request time. It is never stored in `aunoskills.json`, `skills-lock.json`, or AunoSkills user config.

Install an explicit Ed25519 trust anchor:

```bash
npx aunoskills registry trust company root-2026 BASE64_SPKI_PUBLIC_KEY
```

Inspect or refresh:

```bash
npx aunoskills registry show company --json
npx aunoskills registry refresh company
npx aunoskills registry list
```

A custom registry with no configured anchor remains on the schema-v1 compatibility path. A custom registry with anchors is handled by the verified registry-v2 client.

## Capability policy

Downloading a skill does not grant it execution rights. Capability metadata can describe filesystem, shell, network, environment, process, Git, agent-config, and secret access. Project policy decides whether a requested capability is allowed, denied, or requires review.

Permission escalation during an update is reviewed independently of semantic versioning. A PATCH or MINOR bump cannot bypass capability policy.

## Project files

```text
aunoskills.json       # human-authored project intent
skills-lock.json      # deterministic resolved state
.aunoskills/state/    # machine-local transaction and ownership state; ignored
.agents/skills/       # generated or vendored portable materializations
.claude/skills/       # generated or vendored Claude Code materializations
```

Global state may additionally contain:

```text
~/.aunoskills/cache/               # content-addressed bundles
~/.aunoskills/registries/<name>/   # verified registry metadata cache
```

## Bundled starter registry

The repository currently dogfoods three original starter skills:

- `typescript-quality`
- `node-cli-quality`
- `security-review`

Schema-v1 compatibility remains available while official production root trust is provisioned. Custom verified-v2 registries can already use the signed registry pipeline with their own explicit anchors.

## CLI commands

```text
init
detect
recommend
explain
add
remove
install
update
restore
rollback
list
outdated
doctor
audit
sync
registry
cache
config
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

The deterministic engine works without AI. `--no-ai` remains reserved for the optional enrichment layer and does not change deterministic scanning.

## Architecture

```text
Project Scanner
  -> Evidence Graph
  -> Recommendation Engine
  -> Policy-aware Resolver
  -> Registry / Trust / Integrity
  -> Content-addressed Store
  -> Agent Adapter Planner
  -> Transactional Materialization
```

For signed registry v2, the registry boundary adds:

```text
Local/Pinned Trust Anchor
  -> RegistryTrustStore
  -> VerifiedRegistryClient
  -> Core lock signer evidence
  -> Audit signer-state checks
```

For official secure publishing, v0.3 adds:

```text
Deterministic Unsigned Builder
  -> Root-Authorized Release Signer
  -> Public-Only Registry Verifier
  -> Protected Release Packaging
```

The scanner knows projects but does not know skills. The recommender consumes project intelligence but does not scan the filesystem. Adapters create plans; the Core transaction layer owns filesystem mutation.

See:

- [`docs/superpowers/specs/2026-09-13-aunoskills-v1-design.md`](docs/superpowers/specs/2026-09-13-aunoskills-v1-design.md)
- [`docs/superpowers/specs/2026-09-13-aunoskills-v0.2-registry-security-design.md`](docs/superpowers/specs/2026-09-13-aunoskills-v0.2-registry-security-design.md)
- [`docs/superpowers/specs/2026-09-13-aunoskills-v0.3-secure-publishing-design.md`](docs/superpowers/specs/2026-09-13-aunoskills-v0.3-secure-publishing-design.md)

## Development

The repository intentionally has no runtime npm dependencies.

```bash
npm install --ignore-scripts
npm run format:check
npm run typecheck
npm test
npm run build
```

Security and E2E gates:

```bash
npm run test:security
npm run test:e2e
npm run benchmark
```

Rebuild the current bundled compatibility registry deterministically:

```bash
npm run registry:build
```

Exercise the secure publishing inputs without signing secrets:

```bash
REGISTRY_SOURCE_COMMIT=<commit> npm run registry:unsigned
```

Production signing additionally requires externally provisioned public root/trust material and protected release signing variables. Private signing keys must never be committed.

## License and clean-room boundary

AunoSkills CLI/core, schemas, adapters, registry tooling, and bundled original starter skills are licensed under Apache-2.0.

The project was designed after studying the general workflow and product idea of other skill installers, including AutoSkills, but this repository is a clean-room implementation: its source code, schemas, registry format, security model, CLI architecture, starter skills, documentation, and branding were written independently. Code or assets governed by AutoSkills' CC BY-NC 4.0 license are not incorporated into this repository.

See [`LICENSE`](LICENSE) and [`SECURITY.md`](SECURITY.md).
