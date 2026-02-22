---
phase: 243-wallet-list-wallet-detail
plan: 01
subsystem: ui
tags: [preact, signals, search, filter, balance, admin-ui]

# Dependency graph
requires:
  - phase: 240-wallet-detail-tabs
    provides: WalletListContent base structure and Table component
provides:
  - SearchInput for real-time name/publicKey text search in wallet list
  - FilterBar with chain/environment/status dropdown filters
  - Balance column showing native token balance per wallet
  - Combined search+filter computed filtering
affects: [243-wallet-list-wallet-detail]

# Tech tracking
tech-stack:
  added: []
  patterns: [useComputed for combined filter, lazy parallel balance fetch]

key-files:
  created: []
  modified:
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/__tests__/wallets.test.tsx

key-decisions:
  - "walletColumns moved inside WalletListContent to reference balances signal"
  - "syncUrl=false for FilterBar (wallets page uses hash routing for tabs)"
  - "Balance fetch limited to first 50 wallets to avoid excessive API calls"
  - "Balance column shows native token only (no USD — balance API lacks amountUsd)"

patterns-established:
  - "useComputed for combined multi-signal filtering (search + dropdown filters)"
  - "Lazy parallel balance fetch with Promise.allSettled and cap limit"

requirements-completed: [WLST-01, WLST-02, WLST-03]

# Metrics
duration: 5min
completed: 2026-02-23
---

# Phase 243 Plan 01: Wallet List Search, Filter, and Balance Summary

**SearchInput + FilterBar + Balance column added to wallet list with real-time client-side filtering and lazy parallel balance fetch**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-22T15:49:44Z
- **Completed:** 2026-02-22T15:54:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- SearchInput for real-time name/publicKey text search with debounce
- FilterBar with chain/environment/status dropdown filters (syncUrl=false)
- Balance column showing native token balance per wallet's default network
- 5 new tests covering search, filter, balance display, loading state, and chain filter
- Existing tests updated to handle FilterBar label duplication with table headers

## Task Commits

Each task was committed atomically:

1. **Task 1: Add search, filter, and balance+USD column to wallet list** - `fb53ea5c` (feat)
2. **Task 2: Add tests for wallet list search, filter, and balance** - `ed08b7b3` (test)

## Files Created/Modified
- `packages/admin/src/pages/wallets.tsx` - Added SearchInput, FilterBar, Balance column, useComputed filtering, lazy balance fetch
- `packages/admin/src/__tests__/wallets.test.tsx` - 5 new test cases + fixed 2 existing tests for FilterBar text duplication

## Decisions Made
- Moved walletColumns inside WalletListContent to reference balances signal (module-level array cannot access component signals)
- syncUrl=false for FilterBar since wallets page uses hash-based tab routing
- Balance fetch capped at first 50 wallets via BALANCE_FETCH_LIMIT constant
- No USD conversion in balance column (balance API does not return amountUsd)
- Used useComputed for combined search+filter results (reactive and efficient)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing tests broken by FilterBar text duplication**
- **Found during:** Task 2 (test writing)
- **Issue:** Existing tests used `screen.getByText('Chain')` which now finds both FilterBar label and table header
- **Fix:** Changed to `screen.getAllByText('Chain').length` assertions and updated apiGet mocks to handle balance API calls
- **Files modified:** packages/admin/src/__tests__/wallets.test.tsx
- **Verification:** All 15 tests pass
- **Committed in:** ed08b7b3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary fix for test compatibility with new FilterBar. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wallet list now has search, filter, and balance features ready
- Plan 243-02 can build on this for wallet detail enhancements

## Self-Check: PASSED

- FOUND: packages/admin/src/pages/wallets.tsx
- FOUND: packages/admin/src/__tests__/wallets.test.tsx
- FOUND: fb53ea5c (Task 1 commit)
- FOUND: ed08b7b3 (Task 2 commit)

---
*Phase: 243-wallet-list-wallet-detail*
*Completed: 2026-02-23*
