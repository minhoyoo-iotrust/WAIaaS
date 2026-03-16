---
phase: 435-n-plus-one-query
plan: 02
subsystem: api
tags: [drizzle, inArray, batch-query, token-registry, formatTxAmount, n-plus-one]

requires:
  - phase: 435-n-plus-one-query
    provides: established batch query pattern with inArray
provides:
  - buildTokenMap batch helper for token registry lookups
  - tokenMap parameter on formatTxAmount for batch-aware formatting
  - All 4 formatTxAmount call sites using pre-fetched tokenMap
affects: [admin-wallets, admin-monitoring, admin-auth]

tech-stack:
  added: []
  patterns: [buildTokenMap batch helper, optional tokenMap parameter for backward compat]

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/admin-wallets.ts
    - packages/daemon/src/api/routes/admin-monitoring.ts
    - packages/daemon/src/api/routes/admin-auth.ts

key-decisions:
  - "Made tokenMap parameter optional for backward compatibility"
  - "Used address:network composite key with :* fallback for network-agnostic lookup"

patterns-established:
  - "Token batch pattern: collect unique addresses, single IN() query, Map with composite key"

requirements-completed: [NQ-04, NQ-05, NQ-07]

duration: 17min
completed: 2026-03-17
---

# Phase 435 Plan 02: formatTxAmount Token Batch Query Conversion Summary

**Converted formatTxAmount per-row token_registry lookups to pre-batch IN() query with optional tokenMap parameter across 4 call sites**

## Performance

- **Duration:** 17 min (including full test suite verification)
- **Started:** 2026-03-16T17:00:00Z
- **Completed:** 2026-03-16T17:17:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created buildTokenMap() batch helper for single IN() token registry lookups
- formatTxAmount accepts optional tokenMap parameter (backward compatible)
- All 4 call sites (admin-wallets, admin-monitoring x2, admin-auth) pre-batch token lookups
- Full test suite passes: 5034 tests across 314 files, 0 failures

## Task Commits

1. **Task 1: Add tokenMap parameter to formatTxAmount and batch helper** - `be066e1c` (refactor)
2. **Task 2: Update remaining 3 call sites to use batch tokenMap** - `01704295` (refactor)

## Files Created/Modified
- `packages/daemon/src/api/routes/admin-wallets.ts` - buildTokenMap helper, formatTxAmount tokenMap param, wallet transactions batch
- `packages/daemon/src/api/routes/admin-monitoring.ts` - transactions and incoming routes pre-batch token lookups
- `packages/daemon/src/api/routes/admin-auth.ts` - status recent transactions pre-batch token lookups

## Decisions Made
- Made tokenMap parameter optional for backward compatibility with any future callers
- Used composite key `${address}:${network ?? '*'}` with wildcard fallback for network-agnostic lookup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 435 complete: all 7 NQ requirements satisfied
- Phase 436 (pagination) ready to execute

---
*Phase: 435-n-plus-one-query*
*Completed: 2026-03-17*
