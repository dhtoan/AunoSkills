# AunoSkills

**Explainable, policy-aware skill management for AI coding agents.**

AunoSkills scans a project, builds an evidence model of its technology stack and workspaces, recommends relevant `SKILL.md` bundles, verifies their source and integrity, and materializes them for the AI coding agents you use.

```bash
npx aunoskills
```

AunoSkills v0.1.0 is a CLI-first open-source release. The hosted Cloud, private-registry service, team dashboard, SSO, and enterprise RBAC described in the long-term architecture are **not** part of this release.

## Why AunoSkills

AunoSkills is built around three principles:

- **Intelligence** — detect project evidence first and explain every deterministic recommendation.
- **Trust** — keep provenance, trust tier, immutable SHA-256 integrity, and security policy separate from relevance.
- **Control** — never silently execute skill code, never silently weaken trust, and make project mutations transactional and reversible.

AunoSkills uses the standard `SKILL.md` entrypoint. `auno.json` adds optional package-manager metadata without replacing the portable skill instructions.

## Requirements

- Node.js 22 or newer
- Windows, macOS, or Linux

## Quick start

Run AunoSkills in a project root:

```bash
npx aunoskills
```

With no subcommand, AunoSkills behaves like `init`: it scans the project, recommends high-confidence skills, writes `aunoskills.json`, resolves an immutable `skills-lock.json`, verifies bundles, and materializes the selected skills.

For unattended initialization:

```bash
npx aunoskills --yes
```

`--yes` skips ordinary confirmation; it does **not** bypass trust or capability policy.

## Detect, recommend, and explain

Inspect project intelligence without modifying the project:

```bash
npx aunoskills detect
npx aunoskills detect --json
```

See relevant skills:

```bash
npx aunoskills recommend
```

Explain why a skill is or is not relevant:

```bash
npx aunoskills explain typescript-quality
```

Recommendations retain monorepo workspace scope, so a technology found only in `apps/storefront` is not flattened into an unexplained repository-wide result.

## Install and lifecycle commands

Add an explicit skill:

```bash
npx aunoskills add typescript-quality@1.0.0
```

Resolve and install the project manifest:

```bash
npx aunoskills install
```

Preview without persistent mutation:

```bash
npx aunoskills install --dry-run
```

Recreate the exact locked state:

```bash
npx aunoskills restore
```

Update within the manifest, trust, compatibility, and capability policy:

```bash
npx aunoskills update
```

Remove a skill while protecting dependency relationships:

```bash
npx aunoskills remove typescript-quality
```

Restore the previous committed transaction:

```bash
npx aunoskills rollback
```

## Reproducible CI installs

`aunoskills.json` describes project intent. `skills-lock.json` records the exact resolved versions, integrity hashes, effective trust, provenance, capabilities, dependencies, and materialization records.

Fail instead of changing a stale lockfile:

```bash
npx aunoskills install --frozen-lockfile
```

Recreate the exact lockfile state without network access when every required bundle exists in the content-addressed cache:

```bash
npx aunoskills restore --offline
```

Offline mode never disables integrity verification.

## Doctor and audit

Check managed materializations for missing or modified files:

```bash
npx aunoskills doctor
npx aunoskills doctor --check
npx aunoskills doctor --fix
```

Audit installed trust and capability state:

```bash
npx aunoskills audit
npx aunoskills audit --fail-on high
```

Audit threshold failures use exit code `10`, while materialization check failures use exit code `8`.

## Stable JSON mode

Commands support machine-readable output:

```bash
npx aunoskills recommend --json
```

The v1 envelope is:

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

AunoSkills v0.1.0 targets:

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

- `verified` — curated source with immutable registry metadata, integrity, and provenance.
- `community` — known source and integrity metadata without official verified status.
- `untrusted` — local, arbitrary, or otherwise unverified source.

A skill can be highly relevant and still be blocked by project policy.

## Capability policy

Downloading a skill does not grant it execution rights. Capability metadata can describe filesystem, shell, network, environment, process, Git, agent-config, and secret access. Project policy decides whether a requested capability is allowed, denied, or requires review.

A permission escalation during an update is reviewed independently of semantic versioning. A PATCH or MINOR bump cannot bypass capability policy.

## Project files

A typical project contains:

```text
aunoskills.json       # human-authored project intent
skills-lock.json      # deterministic resolved state
.aunoskills/state/    # machine-local transaction and ownership state; ignored
.agents/skills/       # generated or vendored portable materializations
.claude/skills/       # generated or vendored Claude Code materializations
```

The global cache is content-addressed by SHA-256 and is not the source of truth for the project.

## Registry

The bundled v0.1.0 verified registry contains three original starter skills:

- `typescript-quality`
- `node-cli-quality`
- `security-review`

The repository dogfoods all three through its own `aunoskills.json` and `skills-lock.json`.

A read-only registry is intentionally simple: an `index.json` plus immutable blobs under `blobs/sha256/<digest>`. Custom static registries can therefore be hosted on object storage or a static web server.

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
```

The v0.1.0 deterministic engine works without AI. `--no-ai` is reserved for the optional enrichment layer and does not change deterministic scanning.

## Architecture

The main runtime boundaries are:

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

The scanner knows projects but does not know skills. The recommender consumes project intelligence but does not scan the filesystem. Adapters create plans; the Core transaction layer owns filesystem mutation.

See [`docs/superpowers/specs/2026-09-13-aunoskills-v1-design.md`](docs/superpowers/specs/2026-09-13-aunoskills-v1-design.md) for the approved design specification.

## Development

The repository intentionally has no runtime npm dependencies. Development requires TypeScript and Node type definitions.

```bash
npm install --ignore-scripts
npm run format:check
npm run typecheck
npm test
npm run build
```

Security and E2E gates can be run independently:

```bash
npm run test:security
npm run test:e2e
npm run benchmark
```

Rebuild the bundled registry deterministically:

```bash
npm run registry:build
```

## License and clean-room boundary

AunoSkills CLI/core, schemas, adapters, and bundled original starter skills are licensed under Apache-2.0.

The project was designed after studying the general workflow and product idea of other skill installers, including AutoSkills, but this repository is a clean-room implementation: its source code, schemas, registry format, security model, CLI architecture, starter skills, documentation, and branding were written independently. Code or assets governed by AutoSkills' CC BY-NC 4.0 license are not incorporated into this repository.

See [`LICENSE`](LICENSE) and [`SECURITY.md`](SECURITY.md).
