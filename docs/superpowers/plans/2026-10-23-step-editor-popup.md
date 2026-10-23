# Step editor popup implementation plan

> **For agentic workers:** Execute inline with superpowers:executing-plans.

**Goal:** Implement the selected single-dialog step editor with existing remote.
**Architecture:** Parent editor retains step staging and case persistence. Existing
SettingsDialog owns modality/focus; shared remote shell and RemoteLayout own keys.
StepKeySequence owns append/reorder and a single-line action layout.
**Tech Stack:** React, TypeScript, CSS, Vitest, Playwright.
**Spec:** ../specs/2026-10-23-step-editor-popup-design.md

## Global constraints

No physical commands; no new persistence/API contracts; preserve unsaved user tab,
current palette, RU/EN and action limits. No unsolicited commit.

## Review focus

Cancel/Escape with pending fields; blank new steps; duplicate identities; invalid
hold/pause/conditions; focus, scrolling and one-line rows at1280px in both locales.

### Tasks

- [x] Add failing behavioral tests for single dialog, inline remote append, apply,
  cancel protection, new-step cancellation and focus return.
- [x] Extract shared remote shell; replace nested add dialog in StepKeySequence,
  append canonical UUID/default pause and retain existing edits/limits.
- [x] Replace side panel with modal and preserve parent draft/validation ownership.
- [x] Implement chosen composition, compact fields, RU/EN copy and keyboard states.
- [x] Update affected regressions to the new interaction; run focused tests,
  typecheck/build, then justified frontend and synthetic browser checks.
- [x] Review, run manual design detector, deploy original Docker/volume, inspect
  separate live tab, preserve user's unsaved source tab and report evidence.

## Ledger

- Existing uncommitted64px hold input is from the user's prior accepted change
  and remains part of this work. Work in current checkout; no worktree/commit.
- Frontend 553 passed, focused final regressions31 passed, typecheck/build
  passed; dedicated synthetic browser scenario passed. Legacy7 browser
  scenarios blocked before UI by child API startup exit1. See `design-qa.md`.
- Review focus-restoration finding fixed and regression-verified. Manual
  detector, screenshot comparison and original Docker live-tab acceptance done.
