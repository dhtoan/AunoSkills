# AunoSkills

**Explainable, policy-aware skill management for AI coding agents.**

AunoSkills scans a project, builds an evidence model of its technology stack and workspaces, recommends relevant `SKILL.md` bundles, verifies their source and integrity, and materializes them for the AI coding agents you use.

```bash
npx aunoskills
```

AunoSkills v0.2.0 is a CLI-first open-source release. It adds cryptographically verified custom registries and safer private-registry workflows. AunoSkills Cloud, hosted private-registry service, team dashboard, SSO, and enterprise RBAC are **not** part of this release.

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
npx aunoskills audit --fail-on high
```

Audit can report missing signer proof, unsigned community sources, unknown/expired signing keys, revoked keys, untrusted sources, and dangerous capabilities. A revoked signer is a CRITICAL finding. Audit threshold failures use exit code `10`; materialization check failures use exit code `8`.

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

AunoSkills v0.2.0 targets:

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
├── trust.json
├── index.json
├── manifests/
│   └── sha256/<digest>
└── blobs/
    └── sha256/<digest>
```

Verification is fail-closed:

```text
configured trust anchor
  -> signed trust.json
  -> signed index.json
  -> manifest SHA-256 + Ed25519 signature
  -> bundle SHA-256
```

The current implementation uses Ed25519 from Node.js built-in `crypto`; no runtime cryptography dependency is added.

A registry cannot make itself trusted just by publishing and self-signing a new key. The first key must be configured explicitly by the user or shipped through a trusted release channel. Key rotations/revocations must be authorized by an already trusted active key.

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

### Official registry signing status

The bundled `auno` starter registry currently remains in its v1 static compatibility format. The repository contains the v2 signing/verification/build infrastructure, but intentionally does **not** contain a private release signing key or a public fixture key masquerading as production trust. Migration of the bundled registry to signed v2 requires provisioning a real release key through secure release infrastructure.

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

Schema-v1 compatibility remains available so existing v0.1 projects continue to work while registry-v2 trust is adopted incrementally.

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
Local Trust Anchor
  -> RegistryTrustStore
  -> VerifiedRegistryClient
  -> Core lock signer evidence
  -> Audit signer-state checks
```

The scanner knows projects but does not know skills. The recommender consumes project intelligence but does not scan the filesystem. Adapters create plans; the Core transaction layer owns filesystem mutation.

See:

- [`docs/superpowers/specs/2026-09-13-aunoskills-v1-design.md`](docs/superpowers/specs/2026-09-13-aunoskills-v1-design.md)
- [`docs/superpowers/specs/2026-09-13-aunoskills-v0.2-registry-security-design.md`](docs/superpowers/specs/2026-09-13-aunoskills-v0.2-registry-security-design.md)

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

Rebuild the current bundled v1 registry deterministically:

```bash
npm run registry:build
```

The signed v2 builder is exposed programmatically as `buildSignedStaticRegistry` and requires private key material as a runtime input. Private signing keys must not be committed.

## License and clean-room boundary

AunoSkills CLI/core, schemas, adapters, and bundled original starter skills are licensed under Apache-2.0.

The project was designed after studying the general workflow and product idea of other skill installers, including AutoSkills, but this repository is a clean-room implementation: its source code, schemas, registry format, security model, CLI architecture, starter skills, documentation, and branding were written independently. Code or assets governed by AutoSkills' CC BY-NC 4.0 license are not incorporated into this repository.

See [`LICENSE`](LICENSE) and [`SECURITY.md`](SECURITY.md).
