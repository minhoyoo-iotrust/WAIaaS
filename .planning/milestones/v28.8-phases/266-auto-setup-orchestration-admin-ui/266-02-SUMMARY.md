---
phase: 266-auto-setup-orchestration-admin-ui
plan: 02
subsystem: admin-ui
tags: [admin, dropdown, wallet-type, preset, owner-registration]

requires:
  - phase: 266-auto-setup-orchestration-admin-ui
    plan: 01
    provides: PresetAutoSetupService + wallet_type API parameter support

provides:
  - Admin UI wallet type dropdown in Owner registration form
  - WALLET_PRESETS constant mirroring @waiaas/core BUILTIN_PRESETS
  - walletType badge display for preset wallets
  - walletType field in WalletDetail interface
  - 5 Admin UI tests covering dropdown rendering, API integration, backward compat

affects: [admin-ui, owner-registration]

tech-stack:
  added: []
  patterns: [preact-signals, testing-library-preact]

key-files:
  created:
    - packages/admin/src/__tests__/wallets-preset-dropdown.test.tsx
  modified:
    - packages/admin/src/pages/wallets.tsx

key-decisions:
  - "WALLET_PRESETS defined as static constant in wallets.tsx since Admin SPA cannot import @waiaas/core"
  - "Dropdown only shown when ownerState is NONE (first registration), not during address edits"
  - "walletType badge uses WALLET_PRESETS lookup for display name, falls back to raw value"

patterns-established:
  - "Tab switching in tests: must click Owner tab before accessing owner section elements"

requirements-completed: [ADUI-01]

duration: 8min
completed: 2026-02-26
---

# Plan 266-02: Admin UI Dropdown Summary

**Admin UI wallet type dropdown in Owner registration form with API wallet_type integration and 5 test cases**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- WALLET_PRESETS constant with D'CENT preset (label, value, description)
- walletTypeSelect signal for dropdown state management
- Wallet Type dropdown rendered before Address input when ownerState is NONE
- handleSaveOwner conditionally includes wallet_type in API body
- walletType badge displayed next to owner state badge
- WalletDetail interface extended with walletType field
- 5 Admin UI tests: dropdown rendering, preset API call, Custom omission, conditional display, badge display
- All 66 existing wallet tests preserved (backward compatible)

## Task Commits

1. **Task 1: Dropdown UI + API integration + walletType in OpenAPI** - `18d750f8` (feat)
2. **Task 2: Admin UI dropdown tests (5 cases)** - `0e930831` (test)

## Files Created/Modified
- `packages/admin/src/pages/wallets.tsx` - WALLET_PRESETS, walletTypeSelect signal, dropdown UI, handleSaveOwner changes, walletType badge
- `packages/admin/src/__tests__/wallets-preset-dropdown.test.tsx` - 5 test cases (T-ADUI-01 through T-ADUI-05)

## Decisions Made
- Dropdown is a native HTML `<select>` element, consistent with Admin UI patterns
- Description text shown below dropdown when a preset is selected
- Different toast messages for preset ("Owner set with D'CENT Wallet auto-setup") vs Custom ("Owner address updated")

## Deviations from Plan

### Auto-fixed Issues

**1. [Test rendering] Owner tab navigation required in tests**
- **Found during:** Task 2 (test creation)
- **Issue:** Tests couldn't find "Set Owner Address" because it's inside the Owner tab, not the default Overview tab
- **Fix:** Added `switchToOwnerTab()` helper that clicks Owner tab and waits for "Owner Wallet" heading
- **Files modified:** packages/admin/src/__tests__/wallets-preset-dropdown.test.tsx
- **Verification:** All 5 tests pass
- **Committed in:** 0e930831

**2. [API mock paths] Admin API paths required for balance/transactions/staking**
- **Found during:** Task 2 (test creation)
- **Issue:** Mock API paths used wallet paths instead of admin paths (e.g., `/v1/admin/wallets/{id}/balance`)
- **Fix:** Updated setupApiMocks to use correct admin API paths and reject WC session (matching existing test patterns)
- **Files modified:** packages/admin/src/__tests__/wallets-preset-dropdown.test.tsx
- **Verification:** All 5 tests pass
- **Committed in:** 0e930831

---

**Total deviations:** 2 auto-fixed (test infrastructure)
**Impact on plan:** None. Same functionality, better test reliability.

## Issues Encountered
None

## User Setup Required
None

## Next Phase Readiness
- Full Admin UI + API + auto-setup pipeline complete
- Phase 266 ready for closure

---
*Phase: 266-auto-setup-orchestration-admin-ui*
*Completed: 2026-02-26*
