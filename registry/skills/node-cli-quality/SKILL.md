---
name: node-cli-quality
description: Design, implement, and review production Node.js command-line tools with stable commands, exit codes, machine-readable output, cross-platform filesystem behavior, and safe failure handling. Use when building or changing a Node.js CLI, package-manager-style command surface, automation command, or CI-facing terminal tool.
---

# Node CLI Quality

## Workflow

1. Define command behavior and exit codes before implementation.
2. Keep argument parsing separate from business logic and output rendering.
3. Provide a stable machine-readable mode for CI and integrations; never require scraping ANSI output.
4. Send normal output to stdout and diagnostics to stderr unless a documented JSON envelope says otherwise.
5. Make filesystem mutations atomic or transactional and report whether a failed command changed state.
6. Resolve paths with platform-safe APIs; test Windows path semantics as first-class behavior.
7. Keep non-interactive operation explicit and ensure convenience flags never bypass security policy.
8. Test the command through its public entrypoint plus focused tests for parsing and orchestration.

## Contract rules

- Unknown flags and invalid combinations fail with a stable usage error.
- `--help` and `--version` must not require project setup or network access.
- Dry-run modes perform zero persistent mutation and zero executable setup hooks.
- Offline modes fail clearly when required immutable artifacts are absent; they do not silently skip work.
- A successful command exits zero. Document every non-zero category that external automation may rely on.

## Output

For CLI reviews, identify user-visible contract breaks before internal style issues. Recommend exact command behavior, exit code, and output shape for each finding.
