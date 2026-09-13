# Contributing to AunoSkills

AunoSkills welcomes focused bug fixes, detectors, agent adapters, security hardening, registry improvements, tests, and documentation.

## Development setup

Use Node.js 22 or newer:

```bash
npm install --ignore-scripts
npm run typecheck
npm test
```

The project has no runtime npm dependencies. Development dependencies are pinned in `package.json`.

## Development workflow

Use a feature branch or isolated worktree. Keep changes scoped to one concern and use test-driven development for behavior changes:

1. Add the smallest failing test that demonstrates the desired behavior or regression.
2. Confirm it fails for the intended reason.
3. Implement the minimum change required to pass it.
4. Refactor only while the tests remain green.
5. Run the focused suite, then the full verification gates.

Before opening a pull request:

```bash
npm run format:check
npm run typecheck
npm test
npm run build
npm run registry:build
git diff --exit-code -- registry/index.json registry/blobs
```

## Architectural boundaries

Keep these boundaries intact:

- Detector/scanner code emits project evidence and does not select skills.
- Recommender code consumes project intelligence and does not scan the filesystem.
- Resolver code selects immutable versions and does not write project files.
- Agent adapters return declarative materialization plans and do not mutate the filesystem.
- Core/transaction code owns project mutation and rollback.
- Skill metadata never decides its own trust tier.

## Adding or changing a bundled skill

Bundled skills live in `registry/skills/<id>/` and must contain `SKILL.md` and `auno.json`. Keep instructions original, concise, and standard-first. Validate the skill, then update `registry/source-revision.txt` to a commit that contains the reviewed skill source and run:

```bash
npm run registry:build
```

Generated registry bytes must be deterministic. The registry index must reference immutable SHA-256 identities.

## Security-sensitive changes

Changes touching integrity, path normalization, execution, environment exposure, trust, policy inheritance, registry resolution, locking, or transactions require a regression test in the security or E2E gate. Do not weaken a security invariant merely to make an installer more convenient.

## Commit style

Use compact imperative commit subjects, for example:

```text
feat(resolver): add policy-aware deterministic resolution
fix(core): keep lockfile materializations portable
test: add cross-platform security and e2e release gates
```
