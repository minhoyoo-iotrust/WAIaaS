---
phase: 469-admin-ui-radio-group
plan: 01
subsystem: ui
tags: [preact, radio-group, wallet-type, signing, admin-ui]

# Dependency graph
requires:
  - phase: 467-db-migration-backend-service
    provides: DB v61 partial unique index + WalletAppService exclusive toggle
  - phase: 468-signrequestbuilder-query-transition
    provides: wallet_type + signing_enabled=1 query transition
provides:
  - wallet_type group layout in Human Wallet Apps page
  - signing radio buttons replacing checkboxes
  - "None" radio option to disable all signing in a group
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - groupAppsByWalletType utility for Map<string, WalletAppApi[]> grouping
    - Radio group per wallet_type section for exclusive signing selection

key-files:
  created: []
  modified:
    - packages/admin/src/pages/human-wallet-apps.tsx
    - packages/admin/src/__tests__/human-wallet-apps.test.tsx

key-decisions:
  - "Radio group labels show app display_name for clarity"
  - "Group header uses wallet_type as-is (lowercase), matching DB values"
  - "Signing badge shown on app card when signing_enabled=true for at-a-glance status"

patterns-established:
  - "groupAppsByWalletType: groups apps into Map by wallet_type (fallback to name)"
  - "handleSigningRadioChange: radio handler that routes to PUT signing_enabled true/false"

requirements-completed: [ADM-01, ADM-02, ADM-03, ADM-04]

# Metrics
duration: 8min
completed: 2026-04-02
---

# Phase 469 Plan 01: Admin UI Radio Group Summary

**wallet_type group layout with signing radio buttons replacing checkboxes for explicit signing app selection**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-02T12:21:08Z
- **Completed:** 2026-04-02T12:29:29Z
- **Tasks:** 2 (1 auto + 1 checkpoint auto-approved)
- **Files modified:** 2

## Accomplishments

### Task 1: wallet_type group layout + signing radio buttons (TDD)

- Added `groupAppsByWalletType()` utility that groups apps into `Map<string, WalletAppApi[]>` by wallet_type (falls back to app name)
- Added `handleSigningRadioChange()` handler for radio button onChange events
  - "none" value: disables the currently signing-enabled app in the group
  - app ID value: enables signing for the selected app (backend handles exclusive toggle)
- Replaced flat app card list with grouped rendering:
  - Each wallet_type gets a section with `data-testid="group-{walletType}"` and header `data-testid="group-header-{walletType}"`
  - Radio group with "None" + per-app options for signing primary selection
  - App cards nested within their group section
- Removed signing_enabled checkbox from individual app cards
- Added "Signing" badge on app card when signing_enabled=true
- Preserved all existing functionality: alerts toggle, test notification, test sign, subscription token, push relay URL
- 6 new tests (T-ADM-01 through T-ADM-06) + 27 existing tests updated and passing

### Task 2: Admin UI visual verification (auto-approved)

## Test Results

- **Total tests:** 33 (all passing)
- **New tests:** 6 (T-ADM-01 ~ T-ADM-06)
- **Updated tests:** T-HWUI-03, T-HWUI-04, T-HWUI-05 (adapted for radio-based signing control)

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 54b0f3df | test(469-01): add failing tests for wallet_type radio group UI |
| 2 | 8156083b | feat(469-01): wallet_type group layout + signing radio buttons |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing tests for getAllByText due to duplicate text**
- **Found during:** Task 1 GREEN phase
- **Issue:** Radio labels and app card h4 both contain display_name text, causing getByText to find multiple elements
- **Fix:** Changed `screen.getByText()` to `screen.getAllByText().length > 0` for display names that appear in both radio labels and card titles
- **Files modified:** packages/admin/src/__tests__/human-wallet-apps.test.tsx

## Known Stubs

None.

## Self-Check: PASSED
