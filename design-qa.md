# Step editor popup — design QA

Scope: the approved single step dialog, shared existing remote, direct action
append, compact pause/hold rows, conditions, apply/discard and focus.
Authority: `docs/superpowers/specs/2026-10-23-step-editor-popup-design.md`.

## Evidence

- Synthetic Playwright scenario passed in RU at 1650×1248, 1440×1024 and
  1280×1024, and EN at 1280×1024. Geometry assertions verify a single row
  and no horizontal overflow. One dialog, repeated independent actions,
  apply/persistence, discard/resume, focus and no TV command requests checked.
- Screenshots: `.local/step-popup/synthetic-ru-1650.png` and
  `.local/step-popup/synthetic-en-1280.png`. Reviewed against the selected
  mockup; no material unintended composition mismatch. At 1280×1024 the
  lower remote keys require content scrolling; actions stay visible.
- Live Docker application inspected separately: the saved demo case opens
  the new popup, existing keys and pause values remain, hold duration fits
  on the same row, and discard confirmation works. Temporary verification
  edits discarded. Original unsaved browser tab preserved and inspected.
- Original data volume and published port preserved; container healthy and
  `/api/health` returned `status: ok`.
- Frontend: 553 unit tests passed; focused final regression 31 passed;
  typecheck and production build passed. Review found a removed-row focus
  target on new-step cancellation; fixed with surviving insertion trigger
  fallback and verified by regression assertion.
- Impeccable manual detector scanned changed TSX/CSS without findings.
  This was regex analysis; parsed-page contrast/a11y rules did not run.
  Browser geometry, keyboard and screenshot checks provide separate evidence.
- Applied workflows: Impeccable, UI UX Pro Max, project UI acceptance,
  Product Design image-to-code and local deployment.

## Limitations

Icon centering follow-up: all five step action buttons had a 1 px horizontal
and −2.5 px vertical SVG offset in 32×39 px buttons. Condition removal had
−1.5 px vertical offset in a 54×49 px button. Explicit grid centering with
32×32 px step controls and a 40×40 px condition control removes inline SVG
baseline sizing. Existing popup close, remote, drag, press removal and spinner
controls were already centered. Browser regression failed on condition removal
before the CSS fix, then passed with center deltas below0.5 px and compact rows
at 955, 1024, 1100 and 1280 px. Build and manual CSS detector passed.

Follow-up popup comments: width reduced from 1240 to 1000 px; hold and pause
share the styled duration input and native 100 ms stepping, preserving bounds
and exact manual values. Removed unavailable-hold dash; restored “Сохранить
шаг” / “Save step”. Focused37 tests, production build and RU/EN browser scenario
passed, including width, aligned rows, styled controls and hold increment.
CSS/TSX detector reported no findings (regex-only limitations still apply).

Follow-up row regression: removed obsolete sidebar breakpoints that forced
actions below the selected step at 901–1100 px. The synthetic browser check
failed before the fix (105 px instead of 60 px at 955 px), then passed at
955, 1024, 1100 and 1280 px, with aligned controls inside the row bounds.
Manual CSS detector and production build passed; no full-suite rerun was
needed for this bounded CSS correction.

The seven legacy `test-cases.spec.ts` scenarios could not reach the UI:
their child API exited before listening (exit 1, diagnostic cause unavailable).
Their assertions were adapted but have no successful execution evidence in
this run. The dedicated popup browser scenario uses the existing synthetic
runtime fixture and passed. The OCR execution scenarios were not rerun;
physical TV and OCR engine behavior are outside this UI change.
