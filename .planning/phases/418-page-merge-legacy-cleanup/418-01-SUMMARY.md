---
phase: 418-page-merge-legacy-cleanup
plan: 01
subsystem: ui
tags: [preact, tabs, navigation, tokens, walletconnect]

requires:
  - phase: 417-sidebar-renaming-routes
    provides: NAV_SECTIONS sectioned sidebar, route redirects, TabNav pattern
provides:
  - Wallets page 4-tab layout (Wallets/Tokens/RPC Endpoints/WalletConnect)
  - TokensContent named export (tokens.tsx default export removed)
  - /tokens redirect to /wallets with Tokens tab activation
affects: [418-02, 420-wallet-detail]

tech-stack:
  added: []
  patterns: [Tab merge via named export + parent page TabNav integration]

key-files:
  modified:
    - packages/admin/src/pages/tokens.tsx
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/pages/walletconnect.tsx
    - packages/admin/src/components/layout.tsx
    - packages/admin/src/__tests__/tokens.test.tsx
    - packages/admin/src/__tests__/walletconnect.test.tsx

key-decisions:
  - "TokensContent removes page wrapper div since it renders inside Wallets page container"
  - "pendingNavigation used for /tokens redirect tab activation (same pattern as /walletconnect)"

patterns-established:
  - "Tab merge pattern: remove default export, add named export, import in parent page, add to TABS array"

requirements-completed: [MERG-01, MERG-02, MERG-05, LGCY-02, ROUT-01]

duration: 8min
completed: 2026-03-15
---

# Phase 418 Plan 01: Tokens Tab Wallets Merge Summary

**Tokens page merged into Wallets as 4th tab (Wallets/Tokens/RPC Endpoints/WalletConnect), with /tokens redirect and WalletConnect default export removal**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-15T03:37:32Z
- **Completed:** 2026-03-15T03:45:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Wallets page now has 4-tab layout with Tokens tab rendering TokensContent
- /tokens redirects to /wallets with Tokens tab automatically activated via pendingNavigation
- walletconnect.tsx default export removed (WalletConnectPage is now named export)
- All 907 admin tests pass

## Task Commits

1. **Task 1: Tokens tab merge + Wallets 4-tab** - `3cd2b24b` (feat)
2. **Task 2: /tokens redirect + layout cleanup** - `b1152ea9` (feat)

## Files Created/Modified
- `packages/admin/src/pages/tokens.tsx` - Changed default export to named TokensContent, removed page wrapper
- `packages/admin/src/pages/wallets.tsx` - Added tokens tab to WALLETS_TABS, imported and rendered TokensContent
- `packages/admin/src/pages/walletconnect.tsx` - Removed default export, kept named WalletConnectPage
- `packages/admin/src/components/layout.tsx` - Redirect /tokens to /wallets with pendingNavigation, removed TokensPage import
- `packages/admin/src/__tests__/tokens.test.tsx` - Updated to use named TokensContent import
- `packages/admin/src/__tests__/walletconnect.test.tsx` - Updated to use named WalletConnectPage import

## Decisions Made
- TokensContent removes outer `<div class="page">` wrapper since it renders inside Wallets page container
- Used pendingNavigation signal for tab activation on redirect (consistent with existing /walletconnect pattern)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed tokens.test.tsx default import**
- **Found during:** Task 2 (test verification)
- **Issue:** tokens.test.tsx imported TokensPage as default export which was removed
- **Fix:** Changed to named import `{ TokensContent as TokensPage }`
- **Files modified:** packages/admin/src/__tests__/tokens.test.tsx
- **Verification:** All 907 tests pass
- **Committed in:** b1152ea9

**2. [Rule 1 - Bug] Fixed pendingNavigation type mismatch**
- **Found during:** Task 2 (typecheck)
- **Issue:** pendingNavigation type is `{ tab, fieldName }` not `{ page, tab, fieldName }`
- **Fix:** Removed `page` property from pendingNavigation value, imported pendingNavigation from settings-search
- **Files modified:** packages/admin/src/components/layout.tsx
- **Verification:** tsc --noEmit passes for layout.tsx
- **Committed in:** b1152ea9

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## Next Phase Readiness
- Wallets 4-tab structure complete, ready for Plan 02 (Settings 3-tab + RPC Proxy merge)
- Pattern established for tab merge can be applied to Settings page

---
*Phase: 418-page-merge-legacy-cleanup*
*Completed: 2026-03-15*
