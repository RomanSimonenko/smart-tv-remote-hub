# RU/EN implementation plan

> Use superpowers:subagent-driven-development to implement the independent surface translations and review the integrated result. No commits or pushes unless requested.

**Goal:** Full Russian/English interface with persisted switching using i18next/react-i18next.
**Spec:** ../specs/2026-10-23-interface-localization-design.md; user selected i18next in chat.
**Architecture:** One initialized i18next instance, bundled dictionaries in common/devices/cases/runs/auth namespaces; React useTranslation subscriptions. Locale persistence is independent of menu collapse. Dates/numbers use current Intl locale. No DOM translation, schema changes, or translation of user content.

## Constraints and review focus

- Russian default; only explicit ru/en accepted from localStorage. Storage failure remains visible.
- Switch without reload/remount, preserving unsaved inputs and running lifecycle. Translate visible notices by code/key rather than freezing translated text in state.
- Errors from the API use existing codes, never change wire payloads for localization.
- Cases, OCR, device/profile names and imported scenario prose stay unchanged.
- Verify permission/connection errors, stale async results, plural counts, long English labels, keyboard names and persisted history.
- Keep active checkout and current Docker volume/config; no device commands or physical camera access for tests.

## Tasks

- [x] Core: add i18next/react-i18next, locale persistence/subscriptions, bundled namespace catalogues, locale formatting helper and test isolation. Add Settings → Interface and auth-screen language control. Cover invalid storage, reload, storage error, ru/en parity.
- [x] Devices: translate TV list/add/pairing/control/settings, camera/recording/OCR, device status/error hooks, remote key labels and tooltips. Own locales/devices.ts. Keep all protocols and request identifiers unchanged.
- [x] Cases: translate case list/editor/import, step setup, action queues and text conditions; keep actual case data untouched. Own locales/cases.ts. Verify draft safety and plurals.
- [x] Runs: translate preparation/execution/history/reports/evidence and run helpers. Own locales/runs.ts. Check date/number formatting, state/error codes, unchanged OCR/case content.
- [x] Integration: translate auth/profile/navigation/common dialogs and API-friendly errors. Register settings route and preserve leave guards. Add English E2E covering switching/reload/navigation/editor/TV/runner, error states and reverse switching.
- [x] Verify: namespace completeness and TypeScript, existing Russian tests/E2E, English E2E; inspect 1280/1440 English screenshots, detector and diff. Build/update active Docker preserving volume; inspect running app. Report exact scope and unverified hardware areas.

Implementation ledger: .local/interface-localization-progress.md. User authorized implementation and selected library; continue within this scope without additional approval for routine reversible choices.
