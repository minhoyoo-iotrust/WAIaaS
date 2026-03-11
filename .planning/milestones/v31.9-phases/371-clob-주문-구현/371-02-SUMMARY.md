---
phase: 371-clob-주문-구현
plan: 02
subsystem: database
tags: [sqlite, migration, drizzle, polymarket]

requires:
  - phase: 370-polymarket-설계
    provides: design doc 80 DB schema specification

provides:
  - DB v53 migration (polymarket_orders table, 26 columns, 5 indexes, 3 CHECK constraints)
  - DB v54 migration (polymarket_positions + polymarket_api_keys tables)
  - Drizzle ORM definitions for 3 Polymarket tables

affects: [371-03, 371-04, 372-ctf-position]

tech-stack:
  added: []
  patterns: [incremental-migration, idempotent-schema-push]

key-files:
  created:
    - packages/daemon/src/__tests__/migration-v53-v54.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts

key-decisions:
  - "Split into v53 (orders) and v54 (positions + api_keys) for granular rollback"
  - "3 CHECK constraints on polymarket_orders: side, order_type, status"

patterns-established:
  - "Forward-compatible migration tests using toBeGreaterThanOrEqual"

requirements-completed: [INTG-06]

duration: 15min
completed: 2026-03-11
---

# Phase 371 Plan 02: DB Migration v53-v54 Summary

**SQLite migrations for polymarket_orders (26 cols, 3 CHECK constraints), polymarket_positions (14 cols), and polymarket_api_keys (8 cols) with Drizzle ORM definitions**

## Performance

- **Duration:** 15 min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- DB v53: polymarket_orders table with 26 columns, 5 indexes, 3 CHECK constraints (side, order_type, status)
- DB v54: polymarket_positions (14 cols, unique wallet+token) and polymarket_api_keys (8 cols, unique wallet_id)
- Drizzle ORM definitions matching SQL DDL exactly
- 15 migration tests (CRUD, constraints, indexes, incremental migration, idempotency)

## Task Commits

1. **Tasks 1-2 (combined):** `75789797` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - v53+v54 migrations, DDL, LATEST_SCHEMA_VERSION=54
- `packages/daemon/src/infrastructure/database/schema.ts` - 3 Drizzle table definitions
- `packages/daemon/src/__tests__/migration-v53-v54.test.ts` - 15 migration tests

## Decisions Made
- Split into 2 migration versions for granular rollback capability
- Forward-compatible test assertions (toBeGreaterThanOrEqual)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing v52 migration test**
- **Found during:** Task 2
- **Issue:** migration-v52.test.ts had hardcoded `toBe(52)` that broke with LATEST_SCHEMA_VERSION=54
- **Fix:** Changed to `toBeGreaterThanOrEqual(52)` for forward compatibility
- **Files modified:** packages/daemon/src/__tests__/migration-v52.test.ts
- **Committed in:** 75789797

**2. [Rule 1 - Bug] Fixed T15 INSERT missing asset_index column**
- **Found during:** Task 2
- **Issue:** Test INSERT for hyperliquid_orders was missing required `asset_index` column
- **Fix:** Added `asset_index` column with value `1` to INSERT statement
- **Committed in:** 75789797

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DB tables ready for OrderProvider and ApiKeyService (371-03)

---
*Phase: 371-clob-주문-구현*
*Completed: 2026-03-11*
