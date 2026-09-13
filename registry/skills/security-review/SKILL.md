---
name: security-review
description: Review code and agent-skill workflows for trust-boundary, supply-chain, filesystem, command-execution, credential, integrity, and policy-bypass risks. Use before releases or when code downloads artifacts, parses untrusted metadata, executes commands, writes files, handles secrets, installs extensions, or changes authorization and trust decisions.
---

# Security Review

## Workflow

1. Map trust boundaries before looking for isolated dangerous strings.
2. Trace untrusted input from source to filesystem, network, process, credential, or authorization sinks.
3. Verify integrity and authenticity before any project mutation or execution.
4. Check path normalization against traversal, absolute paths, symlink escapes, and case collisions.
5. Check command execution for explicit capability grants, constrained environment exposure, and policy enforcement.
6. Check updates for permission, publisher, trust, dependency, and provenance changes rather than version changes alone.
7. Verify failure paths leave no partially trusted or partially installed state.
8. Write or require a regression test that demonstrates each confirmed vulnerability before applying a fix.

## Severity guidance

Treat signature or hash bypass, credential exposure, unrestricted execution from untrusted content, authorization bypass, and path escape outside an approved root as high or critical depending on exploitability. Treat broad but declared permissions, stale provenance, and defense-in-depth gaps according to their actual reachable impact.

## Review rules

- Do not equate "verified publisher" with permission to execute arbitrary code.
- Do not trust metadata fields that let an artifact self-assert its own trust level.
- Do not weaken a higher-level policy because a project or command-line option requests it.
- Do not accept mutable "latest" URLs as integrity identities.
- Do not log tokens, credentials, `.env` values, cookies, or raw authorization headers.

## Output

Report only actionable findings with severity, attack path, affected boundary, and concrete remediation. Distinguish confirmed vulnerabilities from hardening suggestions.
