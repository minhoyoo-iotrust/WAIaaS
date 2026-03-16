---
phase: 434-testnet-toggle
plan: 01
subsystem: database, api
tags: [sqlite, migration, defi-positions, testnet, environment]

requires:
  - phase: 433-multichain-positions
    provides: PositionQueryContext with environment field
provides:
  - Migration v59 adding environment column to defi_positions
  - PositionWriteQueue environment persistence
  - Admin API includeTestnets filter
  - PositionTracker environment passthrough
affects: [434-02, admin-ui, defi-dashboard]

tech-stack:
  added: []
  patterns: [ALTER TABLE ADD COLUMN with DEFAULT for backfill]

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/services/defi/position-write-queue.ts
    - packages/core/src/interfaces/position-provider.types.ts
    - packages/daemon/src/api/routes/admin-wallets.ts
    - packages/daemon/src/services/defi/position-tracker.ts

key-decisions:
  - "ALTER TABLE ADD COLUMN with NOT NULL DEFAULT 'mainnet' auto-backfills existing rows (SQLite behavior)"
  - "includeTestnets defaults to 'false' via z.enum(['true','false']).default('false')"
  - "environment filter uses SQL WHERE rather than post-query filtering for performance"

patterns-established:
  - "Environment column pattern: NOT NULL DEFAULT 'mainnet' for backward compatibility"

requirements-completed: [TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-08]

duration: 5min
completed: 2026-03-16
---

# Phase 434 Plan 01: DB Migration v59 + Admin API includeTestnets Filter Summary

**Migration v59 adds environment column to defi_positions with auto-backfill; admin API defaults to mainnet-only with includeTestnets=true option**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T13:52:22Z
- **Completed:** 2026-03-16T13:57:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Migration v59 adds environment TEXT NOT NULL DEFAULT 'mainnet' to defi_positions (auto-backfills existing rows)
- PositionWriteQueue stores environment field from wallet metadata (defaults to 'mainnet')
- Admin API GET /admin/defi/positions filters to mainnet-only by default; includeTestnets=true returns all
- PositionTracker passes wallet.environment through to each PositionUpdate before enqueue

## Task Commits

1. **Task 1: DB migration v59 + schema + PositionWriteQueue environment column** - `e80b3950` (feat)
2. **Task 2: Admin API includeTestnets filter + PositionTracker environment passthrough** - `cc5f156a` (feat)
3. **Migration chain test fix** - `57a6a7c8` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - Migration v59, DDL update, LATEST_SCHEMA_VERSION=59
- `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle schema environment column
- `packages/daemon/src/services/defi/position-write-queue.ts` - environment in UPSERT_SQL + PositionUpsert
- `packages/core/src/interfaces/position-provider.types.ts` - Optional environment field in PositionUpdate
- `packages/daemon/src/api/routes/admin-wallets.ts` - includeTestnets query param + environment in response
- `packages/daemon/src/services/defi/position-tracker.ts` - Attach wallet.environment to each position
- `packages/daemon/src/__tests__/migration-chain.test.ts` - Version assertions updated to 59

## Decisions Made
- Used ALTER TABLE ADD COLUMN with NOT NULL DEFAULT instead of 12-step table recreation (no CHECK constraint change needed)
- includeTestnets as z.enum(['true','false']) rather than z.boolean() since query params are strings
- Environment filter applied at SQL level (WHERE clause) rather than post-query for efficiency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration chain test version assertions**
- **Found during:** Verification after Task 2
- **Issue:** 6 migration chain tests asserted LATEST_SCHEMA_VERSION=58, now 59
- **Fix:** Updated all assertions from 58 to 59
- **Files modified:** packages/daemon/src/__tests__/migration-chain.test.ts
- **Committed in:** 57a6a7c8

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test fixture update required by version bump. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin API ready with includeTestnets param for Plan 434-02 UI toggle
- OpenAPI types regenerated for typed client usage

---
*Phase: 434-testnet-toggle*
*Completed: 2026-03-16*
