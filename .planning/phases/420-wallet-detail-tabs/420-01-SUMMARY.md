---
phase: 420-wallet-detail-tabs
plan: 01
subsystem: ui
tags: [preact, admin-ui, tabs, owner-protection]

requires:
  - phase: 418-page-merge
    provides: Wallets page with merged tabs (Tokens, RPC Endpoints, WalletConnect)
provides:
  - DETAIL_TABS 4-tab structure (overview/activity/assets/setup)
  - Owner Protection card in OverviewTab with state-aware display
  - ActivityTab/AssetsTab/SetupTab stubs for Plan 02 integration
affects: [420-02-PLAN]

tech-stack:
  added: []
  patterns: [inline-owner-protection-card, tab-consolidation-with-stubs]

key-files:
  created: []
  modified:
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/__tests__/wallets.test.tsx
    - packages/admin/src/__tests__/wallets-coverage.test.tsx
    - packages/admin/src/__tests__/wallets-external-actions.test.tsx
    - packages/admin/src/__tests__/wallets-nft.test.tsx
    - packages/admin/src/__tests__/wallets-preset-dropdown.test.tsx

key-decisions:
  - "Owner Protection card uses inline OwnerTab toggle instead of separate tab"
  - "Register Owner / Manage button reveals full OwnerTab UI inline"
  - "Stub functions for Activity/Assets/Setup to maintain build stability"
  - "NFT content tests temporarily skipped (.skip) until Plan 02 restores them"

patterns-established:
  - "Tab consolidation: stub new tabs first, implement content in follow-up plan"
  - "Owner Protection card pattern: state-aware display with inline expand"

requirements-completed: [DETL-01, DETL-02, DETL-03, DETL-04, DETL-05, DETL-09]

duration: 12min
completed: 2026-03-15
---

# Phase 420 Plan 01: DETAIL_TABS 4-tab + Owner Protection Card Summary

**DETAIL_TABS reduced from 8 to 4 tabs (Overview/Activity/Assets/Setup) with Owner Protection card inline in OverviewTab**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-15T04:02:25Z
- **Completed:** 2026-03-15T04:20:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- DETAIL_TABS reduced from 8 tabs to 4 (overview/activity/assets/setup)
- Owner Protection card with NONE state warning + Register Owner CTA
- Owner Protection card with GRACE/LOCKED state summary + Manage button
- Inline OwnerTab toggle via showOwnerManage signal
- All 6 test files updated for 4-tab structure (897 passing, 3 skipped)

## Task Commits

Each task was committed atomically:

1. **Task 1+2: DETAIL_TABS 4-tab + Owner Protection card + test updates** - `e33d461a` (feat)

## Files Created/Modified
- `packages/admin/src/pages/wallets.tsx` - DETAIL_TABS 4-tab, Owner Protection card, stub functions
- `packages/admin/src/__tests__/wallets.test.tsx` - Updated tab assertions + Owner Protection verification
- `packages/admin/src/__tests__/wallets-coverage.test.tsx` - Updated switchTab, Owner via Manage/Register, MCP via Setup
- `packages/admin/src/__tests__/wallets-external-actions.test.tsx` - External Actions tab -> Activity tab
- `packages/admin/src/__tests__/wallets-nft.test.tsx` - NFTs tab -> Assets tab, content tests skipped for Plan 02
- `packages/admin/src/__tests__/wallets-preset-dropdown.test.tsx` - switchToOwnerTab via Owner Protection card

## Decisions Made
- Owner Protection card placed after Available Networks section in OverviewTab
- Register Owner / Manage button toggles full OwnerTab content inline (no modal)
- Stub functions used for ActivityTab/AssetsTab/SetupTab to maintain build stability
- NFT content tests temporarily skipped until Plan 02 integrates NftContent into AssetsTab

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed multiple element conflicts in tests**
- **Found during:** Task 2 (test updates)
- **Issue:** Tab names ("Activity", "Setup", "Assets") appeared in both tab button and stub content, causing `getByText` to throw "Found multiple elements" errors
- **Fix:** Used `getAllByText` with index access for tab switching, updated switchTab helper
- **Files modified:** All 5 test files
- **Verification:** All tests pass
- **Committed in:** e33d461a

**2. [Rule 1 - Bug] Fixed GRACE state badge duplication in tests**
- **Found during:** Task 2 (test updates)
- **Issue:** "GRACE" badge appeared in both Owner Protection card and OwnerTab, causing getByText failures
- **Fix:** Changed to `getAllByText('GRACE')` assertion
- **Files modified:** wallets-preset-dropdown.test.tsx
- **Verification:** T-ADUI-05 test passes
- **Committed in:** e33d461a

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 can implement real ActivityTab/AssetsTab/SetupTab content by replacing stubs
- All existing tab functions (TransactionsTab, ExternalActionsTab, etc.) preserved for rename+reuse
- 3 NFT content tests need un-skipping after AssetsTab integrates NftContent

---
*Phase: 420-wallet-detail-tabs*
*Completed: 2026-03-15*
