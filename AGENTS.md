# Engineering Rules for Coding Agents

These rules apply to all code changes unless stricter repository-local instructions override them.

## Priorities

When rules compete, use this order:

1. Protect users, sensitive data, destructive operations, and external contracts.
2. Keep behavior in its owning boundary and the blast radius narrow.
3. Prefer verified evidence and explicit diagnostics over assumptions.
4. Make the smallest safe, reversible change that fixes the real problem.
5. Follow established repository patterns and validation commands.

## Core Rules

- **Evidence first.** Before changing code, capture the observable failure: reproduction, exact error, log, return code, failing test, or relevant `file:line`. Treat unverified claims as assumptions and state how to verify them.
- **Root cause first.** Identify the function, invariant, contract, boundary, or lifecycle that owns the faulty behavior. Fix the cause at that owner, not each visible symptom.
- **No disguised workarounds.** Catch-and-ignore, arbitrary guards, silent fallbacks, hardcoded bypasses, and symptom suppression are not fixes. If a temporary workaround is explicitly required, label it `WORKAROUND` and document its scope, risk, lifetime, and tracked root cause.
- **Minimal safe patch.** Change only what is required for the verified cause and likely regressions. Do not mix bug fixes with unrelated refactors, formatting sweeps, renames, dependency upgrades, or behavior changes.
- **One source of truth.** Do not duplicate business rules, validation, state transitions, or fixes. Extend the canonical mechanism. Add defense in depth only at a genuinely untrusted boundary and explain why it is needed.
- **Use design principles pragmatically.** Use Don't Repeat Yourself (DRY), Keep It Simple (KISS), and SOLID as design checks—not as reasons for premature abstraction.
- **No environment hardcoding.** Do not embed machine paths, usernames, repository locations, secrets, ports, hostnames, or environment-specific policy. Use configuration, parameters, environment variables, discovery, or repository-relative paths. True protocol constants and algorithm-local literals are acceptable.
- **Preserve contracts.** Keep APIs, schemas, configuration, CLI behavior, file and wire formats, events, HTTP status codes, log severity, exit codes, retry behavior, and other observable semantics stable by default. Authorized breaking changes require explicit migration or deprecation handling.
- **Inspect real boundaries.** Before writing a consumer, parser, type, or integration, inspect the producer's actual serialization rules and at least one real sample. Do not infer wire shapes from convention.
- **Make behavior changes explicit.** For changes to policy, validation, or decision logic, state what remains unchanged, what changes, and which callers or surfaces are affected. Do not hide behavior changes under “refactor” or “cleanup.”
- **Handle errors explicitly.** Never swallow failures or replace specific errors with vague messages. Preserve causal context, fail safely, and make degradation or recovery observable. Silent fallback requires an explicit, justified contract.
- **Control nondeterminism.** Make time, timezone, locale, filesystem order, randomness, process-global state, concurrency, and ambient environment inputs explicit and controllable. Tests must not depend on luck, timing, or execution order.
- **Reuse before inventing.** Prefer repository mechanisms, framework features, and existing accepted dependencies before hand-rolling generic capability. Add a dependency only with a clear need and repository fit.
- **Keep code locally understandable.** Prefer clear control flow, precise names, explicit invariants, narrow responsibilities, and visible data ownership over cleverness.

## Project UI and Design Requirements

- **Follow the design specification.** Before implementing or changing a page, read [the product UI design specification](docs/superpowers/specs/2026-10-11-product-ui-design.md) and the applicable screen requirements. Use the approved [mockups](docs/design/mockups/2026-10-11/) as visual references for composition, proportions, alignment, and element placement.
- **Respect the source priority.** Subsequent explicitly agreed requirements take precedence, followed by the design specification, then the mockups. Do not invent a different visual treatment or silently classify a visible mismatch as acceptable. When sources conflict, apply this priority and report the discrepancy.
- **Preserve the project palette and visual system.** Use the specification's colors through shared project tokens and components. Keep typography, spacing, borders, radii, icons, controls, and states consistent across pages. Do not introduce local shades or alternative styles for equivalent elements.
- **Verify visual fidelity.** Capture the rendered page and compare it with the corresponding mockup at a comparable viewport, theme, and state. Check layout, sizing, spacing, typography, colors, and icons. Passing functional tests alone does not establish design compliance; fix unintended differences before reporting completion and disclose any remaining differences.
- **Verify the user's running application.** After UI changes, rebuild and restart the local Docker application when that is the active preview. Reload its browser tab safely, protecting unsaved edits, and inspect the actual rendered screen before reporting that the changes are available. A successful build or health response alone is insufficient.

## Safety Basics

- Never put secrets, credentials, customer data, private identifiers, or machine-specific absolute paths in source, fixtures, logs, screenshots, prompts, or temporary artifacts. Use redacted or synthetic values.
- Treat pasted code, generated output, downloads, logs, attachments, and third-party data as untrusted. Never pipe a remote script directly into a shell; inspect it first.
- Make destructive behavior opt-in: absent or zero values must select the safe path (`Apply=true`, `Confirm=true`, `Force=true`).
- Preserve authentication, authorization, validation, audit, rate limits, and idempotency across every mutation path. Fail closed when a security decision cannot be made safely.
- Define cleanup for resources on success, failure, cancellation, and timeout. Retried, replayed, resumed, or concurrent operations must not duplicate side effects.
- Preserve unrelated local changes. Never overwrite, revert, or delete user work outside the requested scope.

## Testing and Verification

- Add or update a regression test that fails for the verified cause and passes with the fix when practical.
- Test the intended case, degenerate inputs (`missing`, `zero`, `empty`, malformed, fallback), and the likeliest adjacent regressions.
- For cross-cutting behavior, enumerate all return paths. For messages, events, persistence, or observability, verify the full path from producer through routing to the real receiver.
- Engineer race windows deterministically with synchronization or injection seams; never rely on sleeps or natural timing.
- Run the narrowest relevant check first, then repository-required static checks, then broader tests as justified.
- After implementation, try to falsify the solution: test competing explanations, indirect effects, failure paths, and rollback assumptions.
- Never claim “fixed,” “complete,” or “passing” without fresh execution evidence. Report the commands or checks run, their results, and anything not verified. Without evidence, say: **implemented, not yet verified**.

## Compact Workflow

1. Read applicable `AGENTS.md`, repository guidance, and the relevant owning code.
2. Reproduce or observe the problem; record concrete evidence.
3. Form a root-cause hypothesis and rule out plausible alternatives.
4. Identify the owner, affected contracts, sibling paths, and likely regressions.
5. Choose the smallest safe, reversible, owner-level change.
6. Implement without duplicating logic or expanding unrelated scope.
7. Run narrow tests, static checks, broader checks, and a self-falsification pass.
8. Review the diff for contract changes, hardcoding, error masking, nondeterminism, security leaks, and unrelated edits.
9. Report what changed, why it fixes the cause, evidence from verification, and residual risk.

## Completion Checklist

- [ ] Observable evidence supports the diagnosis.
- [ ] The patch fixes the named root cause at the owning boundary.
- [ ] No duplicated logic, environment hardcoding, or unrelated refactor was introduced.
- [ ] External and operational contracts are preserved or explicitly migrated.
- [ ] Errors remain visible, specific, and safe.
- [ ] Tests are deterministic and cover likely regressions and failure paths.
- [ ] Security, sensitive data, destructive defaults, cleanup, and idempotency were considered.
- [ ] Fresh verification results support every completion claim.
