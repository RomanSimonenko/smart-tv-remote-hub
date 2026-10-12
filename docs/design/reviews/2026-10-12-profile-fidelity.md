# Profile: implementation comparison

Source: docs/design/mockups/2026-10-11/11-profile.png (1487 × 1059).
Implementation: .local/playwright/profile-profile-saves-acro-34e74-d-edits-in-both-menu-states/profile-expanded.png (1440 × 1033, full page; CSS viewport 1440 × 1024, density 1).
State: dark theme, expanded sidebar, synthetic saved profile. Source uses a cat and an editable name; implementation capture uses a robot and saved name, so disabled save is expected.

## Comparison history
Initial implementation differed in major regions: horizontal small identity, a separate rectangular tile grid, narrow fields, redundant top header, and logout outside the session. Rebuilt as one bordered form with a large identity on the left, two rows of circular choices on the right, full-width fields below, and a separate session card with logout.
Post-fix: opened source and rendered capture together in the same comparison input. Checked identity/picker, fields and session at readable size. Desktop geometry assertions verify the picker is beside the identity and the redundant header is hidden.
A second browser pass exposed horizontal overflow with 200% enlargement. Added adaptation based on actual container width; repeated both browser tests successfully.

## Fidelity surfaces
- Typography: existing system font and application heading scale (32px) retained. Raster reference uses larger display text; shared application typography is the implementation authority.
- Spacing/layout: card boundaries, identity/picker split, circular two-row grid, full-width fields and session action placement now follow the reference. Field help and saved feedback add height intentionally.
- Colors: canonical application tokens retained across cards, fields, borders and green selection. No raster texture/gradient replicated.
- Assets: shared Tabler outline icons; approved 16-icon contract retained instead of generated mixed filled artwork. No photo upload.
- Copy: reference headings and reset action restored. Actual session text avoids invented OS/browser metadata.

## Intentional scope differences
Password management remains a separately agreed implementation stage; no nonfunctional password button is added. Theme controls likewise remain postponed. These are not included in this correction's acceptance scope.

## Verification
353 web unit tests passed; web build/typecheck passed. Both browser tests passed, including saving/reload, dirty navigation and logout, keyboard selection, sidebar states, 320–1440px layouts and 200% enlargement. git diff --check passed.

## Checklist
- [x] Correct profile composition and circular choices
- [x] Restore full-width fields and session action placement
- [x] Preserve saving and unsaved-edit protection
- [x] Check responsive and enlarged layouts
- [x] Compare rendered output with visual source

final result: passed
