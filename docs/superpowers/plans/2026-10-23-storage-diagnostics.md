# Storage and diagnostics implementation plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Deliver functional storage management and safe diagnostics in application settings.

**Architecture:** Shared Zod contracts; a server settings service owns policy,
cleanup previews and durable deletion queue. Existing artifact store owns
file deletion/quota. Read-only OCR state is produced by the worker owner.
Settings UI uses existing components, tokens and RU/EN resources.

**Tech Stack:** TypeScript, Fastify, SQLite, React, Vitest.

**Spec:** ../specs/2026-10-23-storage-diagnostics-design.md

## Global constraints

Auto cleanup defaults off. No physical commands or camera capture. Preserve
test cases, account, devices and backups. Confirm exact preview candidates.
Never expose secrets, source content or machine paths in diagnostics.

## Review focus

Active/settling runs; crash after metadata deletion; expired/stale preview;
revoked session during asynchronous work; disk errors and unknown OCR state.

### Task 1: Server storage boundary

Files: contracts/src/settings.ts; api/src/settings/service.ts; storage/migrations.ts;
test-runs/artifacts.ts and repository.ts; api/test/settings-storage.test.ts.

- [x] Add failing tests using a real temporary SQLite database/artifact store.
- [x] Implement schemas, migration, persisted settings and durable deletion queue.
- [x] Implement summary, versioned previews, explicit confirmation and expiry.
- [x] Verify safe default, age cutoff, protected runs, replay, retry and quota.

### Task 2: Diagnostics and authenticated routes

Files: api/src/settings/routes.ts, runtime.ts, app.ts, ocr/recognizer.ts;
api/test/settings-routes.test.ts and OCR worker tests.

- [x] Write and run failing auth/CSRF/validation and diagnostics tests.
- [x] Expose safe worker status, filesystem/DB checks and package versions.
- [x] Wire protected rate-limited routes and retention lifecycle timer.
- [x] Verify error paths, timer shutdown and existing runner regression tests.

### Task 3: Settings UI

Files: web/src/pages/Settings.tsx; settings-api.ts; locales/settings.ts;
i18n.ts, Home.tsx, styles.css; Settings.test.tsx.

- [x] Write failing tests for navigation, preview/confirmation and errors.
- [x] Implement three sections with common styles, translated copy and download.
- [x] Verify UI tests, typechecks, frontend build and manual design detector.

### Task 4: Delivery

- [x] Review full diff and run relevant API/frontend suites.
- [x] Verify running app through Docker-preserving deployment and built-in browser.
- [x] Report evidence and any unverified areas. Do not commit or publish unless asked.

## Execution ledger

- Scope approved by user: full variant. Execute in current clean checkout; no
  unsolicited worktree or Git commits. Shared lifetime for reports and snapshots
  preserves evidence links and avoids a second missing-artifact contract.
- Server: initial storage tests RED (missing service) -> GREEN5; auth/diagnostics
  tests RED404/missing OCR state -> GREEN. Full API suite:552/552.
- UI: initial RED missing Settings -> GREEN5; Home dirty-state regression
  reproduced without remount and passed with it. Full web suite:548/548;
  final focused UI regression suite:26/26. Contracts/API/web typechecks pass.
- Review fixes: broken-DB diagnostics and unexpected idle OCR exit reproduced
  with failing tests, then passed. Report remains available with unknown cleanup
  state when its DB query fails. Reopening Settings resets discarded edits.
- Synthetic browser: localization scenario passed; full storage/diagnostics
  scenario passed after rebuilding fresh web assets. Policy survives reload,
  empty preview cannot delete, exported JSON has only allowlisted fields,
  RU/EN work and1280px has no horizontal overflow. Screenshots saved at1440/1280.
- Manual Impeccable detector returned[]. Visual finish reviewer:ship, all five
  supplied actual/synthetic screenshots inspected; no material findings.
- Docker smoke passed all checks. Active Compose app rebuilt on its original
  port and volume; health200. Live built-in browser verified storage, empty
  preview cancellation, OCR ready, repeated diagnostics and report download.
  No production results deleted; automatic policy remains off.
- Documentation handoff preserved incumbent tokens/components; pre-existing
  missing DESIGN.md/design.json were not repaired. Historical language-only
  paragraph clarified. Diagnostics has no approved mockup; storage differences
  follow the newer feature specification. Light theme/mobile out of scope.
