---
name: typescript-quality
description: Review and improve TypeScript code for type safety, maintainability, deterministic behavior, and clear module boundaries. Use when implementing or reviewing TypeScript libraries, CLIs, Node.js applications, APIs, or refactors where unsafe casts, ambiguous contracts, hidden mutation, or weak tests could create regressions.
---

# TypeScript Quality

## Workflow

1. Read the public API and its tests before changing implementation details.
2. Prefer precise domain types over `any`, broad object types, or unchecked casts.
3. Keep parsing and validation at trust boundaries; keep internal functions strongly typed.
4. Separate pure decision logic from filesystem, network, process, and clock side effects.
5. Preserve deterministic ordering for serialized output and user-visible machine contracts.
6. Add a failing regression test before changing behavior, then make the smallest implementation change that passes it.
7. Re-run focused tests, then the package or repository test suite and typecheck.

## Review priorities

- Reject impossible states early instead of carrying partially valid objects.
- Make exhaustive unions explicit when a finite set of states or commands exists.
- Avoid non-null assertions when a normal control-flow check can prove safety.
- Avoid type assertions that hide unvalidated external data.
- Keep exported functions small enough that their contracts are understandable without reading their internals.
- Treat JSON, environment variables, registry payloads, CLI arguments, and file contents as untrusted input.
- Keep error codes and machine-readable result shapes stable once public.

## Output

When reviewing code, report concrete findings ordered by correctness and regression risk. Include the affected file or interface, the failure mode, and the smallest safe fix. Do not recommend stylistic churn that does not improve correctness or maintainability.
