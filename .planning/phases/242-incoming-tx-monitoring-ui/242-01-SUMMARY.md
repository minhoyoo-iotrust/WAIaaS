---
phase: 242-incoming-tx-monitoring-ui
plan: 01
subsystem: ui
tags: [preact, admin, incoming-tx, monitoring, settings, wallet-toggle, filter-bar]

# Dependency graph
requires:
  - phase: 239-02
    provides: GET /v1/admin/incoming cross-wallet endpoint
  - phase: 241-01
    provides: Admin UI component patterns (FilterBar, table, pagination, settings)
provides:
  - "/incoming Admin page with settings panel, TX viewer, per-wallet monitoring toggles"
  - "apiPatch helper in client.ts"
  - "ADMIN_INCOMING and WALLET_PATCH endpoint constants"
  - "monitorIncoming field in WalletCrudResponseSchema and wallet list API"
affects: [admin-ui, wallet-api, incoming-tx-monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns: [collapsible settings panel in page, per-resource toggle table, inline apiPatch for PATCH mutations]

key-files:
  created:
    - packages/admin/src/pages/incoming.tsx
    - packages/admin/src/__tests__/incoming.test.tsx
  modified:
    - packages/admin/src/api/client.ts
    - packages/admin/src/api/endpoints.ts
    - packages/admin/src/components/layout.tsx
    - packages/admin/src/components/settings-search.tsx
    - packages/admin/src/pages/settings.tsx
    - packages/admin/src/utils/settings-search-index.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/wallets.ts

key-decisions:
  - "Collapsible settings panel (default expanded) in /incoming page instead of tabbed layout"
  - "Per-wallet monitoring toggle uses apiPatch helper for PATCH /wallets/:id"
  - "monitorIncoming field added to WalletCrudResponseSchema (daemon API schema change)"
  - "syncUrl=false for FilterBar on /incoming page (no URL query param sync needed)"
  - "Settings search index entries for incoming.* fields point to /incoming page"

patterns-established:
  - "apiPatch helper: reusable PATCH method for mutation endpoints"
  - "Per-resource toggle table: fetch list with boolean field, toggle via PATCH"

requirements-completed: [INTX-01, INTX-02, INTX-03, INTX-04]

# Metrics
duration: 6min
completed: 2026-02-23
---

# Phase 242 Plan 01: Incoming TX Monitoring UI Summary

**Admin /incoming page with collapsible settings panel (7 fields), per-wallet monitoring toggle table, cross-wallet incoming TX viewer with 4-filter FilterBar and pagination**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-22T15:34:13Z
- **Completed:** 2026-02-22T15:40:41Z
- **Tasks:** 2
- **Files modified:** 11 (9 modified + 2 created)

## Accomplishments
- New /incoming page consolidates incoming TX monitoring settings (extracted from settings.tsx), per-wallet monitoring toggles, and cross-wallet incoming transaction table
- apiPatch helper added for PATCH method support in Admin API client
- monitorIncoming field added to wallet list API response for toggle state visibility
- 8 tests covering rendering, filters, settings panel, wallet toggle, error handling, pagination

## Task Commits

Each task was committed atomically:

1. **Task 1: Create /incoming page with settings panel, TX table, filters, and wallet toggle** - `df4f1eb0` (feat)
2. **Task 2: Add tests for Incoming TX page** - `72fc5b75` (test)

## Files Created/Modified
- `packages/admin/src/pages/incoming.tsx` - New /incoming page with 3 sections (settings, wallet toggles, TX table)
- `packages/admin/src/__tests__/incoming.test.tsx` - 8 tests for incoming page
- `packages/admin/src/api/client.ts` - Added apiPatch export
- `packages/admin/src/api/endpoints.ts` - Added ADMIN_INCOMING and WALLET_PATCH constants
- `packages/admin/src/components/layout.tsx` - Route, nav item, page title/subtitle for /incoming
- `packages/admin/src/components/settings-search.tsx` - Added /incoming to PAGE_LABELS
- `packages/admin/src/pages/settings.tsx` - Removed IncomingSettings section (moved to /incoming)
- `packages/admin/src/utils/settings-search-index.ts` - 7 incoming.* search entries pointing to /incoming
- `packages/daemon/src/api/routes/openapi-schemas.ts` - monitorIncoming field in WalletCrudResponseSchema
- `packages/daemon/src/api/routes/wallets.ts` - monitorIncoming in list/create/update wallet handlers

## Decisions Made
- Collapsible settings panel (default expanded) in /incoming page keeps settings accessible without taking up permanent space
- Per-wallet monitoring toggle uses apiPatch helper for PATCH /wallets/:id (new helper reusable across future pages)
- monitorIncoming added to WalletCrudResponseSchema so wallet list API returns toggle state without extra requests
- syncUrl=false for FilterBar since /incoming is a standalone page without tab routing
- Settings search index entries redirect Ctrl+K searches for incoming.* to /incoming page

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added monitorIncoming to create and update wallet handlers**
- **Found during:** Task 1
- **Issue:** Plan only specified adding monitorIncoming to list handler, but create wallet and update wallet handlers also return WalletCrudResponseSchema, causing OpenAPI validation failure
- **Fix:** Added monitorIncoming: false to create handler and monitorIncoming: wallet.monitorIncoming ?? false to update handler
- **Files modified:** packages/daemon/src/api/routes/wallets.ts
- **Verification:** pnpm turbo run typecheck passes
- **Committed in:** df4f1eb0

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for correctness - all handlers returning WalletCrudResponseSchema must include the new field.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- /incoming page fully functional with settings, wallet toggles, and TX table
- Ready for next plan in phase 242 or subsequent phases

## Self-Check: PASSED

- [x] packages/admin/src/pages/incoming.tsx exists
- [x] packages/admin/src/__tests__/incoming.test.tsx exists
- [x] Commit df4f1eb0 exists
- [x] Commit 72fc5b75 exists

---
*Phase: 242-incoming-tx-monitoring-ui*
*Completed: 2026-02-23*
