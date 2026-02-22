---
phase: 224-core-types-db-foundation
plan: 02
subsystem: database
tags: [sqlite, drizzle, migration, incoming-tx, schema]

# Dependency graph
requires:
  - phase: 224-01
    provides: "INCOMING_TX_STATUSES, CHAIN_TYPES enums from @waiaas/core"
provides:
  - "DB v21 migration (incoming_transactions + incoming_tx_cursors + wallets.monitor_incoming)"
  - "Drizzle ORM schema for incomingTransactions and incomingTxCursors tables"
  - "pushSchema DDL for 18 tables with 4 new indexes"
affects: [225-chain-subscriber, 226-incoming-tx-queue, 227-subscriber-manager, 228-rest-api-mcp]

# Tech tracking
tech-stack:
  added: []
  patterns: ["v21 migration uses IF NOT EXISTS for pushSchema DDL compatibility"]

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/__tests__/migration-chain.test.ts

key-decisions:
  - "v21 migration uses CREATE TABLE IF NOT EXISTS for compatibility with pushSchema DDL execution order"
  - "wallets.monitor_incoming placed between suspension_reason and owner_approval_method in DDL column order"

patterns-established:
  - "New table migrations use IF NOT EXISTS to handle pushSchema DDL pre-creation gracefully"

requirements-completed: [STO-01]

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 224 Plan 02: DB v21 Migration Summary

**DB v21 migration with incoming_transactions (13 cols), incoming_tx_cursors (6 cols), wallets.monitor_incoming column, 4 indexes, and Drizzle ORM schema definitions**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-21T14:57:40Z
- **Completed:** 2026-02-21T15:03:26Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- DB schema version bumped from 20 to 21 with incoming TX monitoring tables
- pushSchema DDL creates 18 tables (was 16) with synchronized indexes for fresh and existing DBs
- Drizzle ORM schema defines incomingTransactions and incomingTxCursors with CHECK constraints from SSoT enums
- All 46 migration chain tests pass (including schema equivalence T-2/T-6)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add v21 migration + update pushSchema DDL + bump LATEST_SCHEMA_VERSION** - `35de861` (feat)
2. **Task 2: Add Drizzle schema tables + update migration chain tests + re-exports** - `f671e62` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - v21 migration, pushSchema DDL for 18 tables, 4 new indexes, INCOMING_TX_STATUSES import
- `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle incomingTransactions (13 cols, 5 indexes, 2 CHECKs) + incomingTxCursors (6 cols) + wallets.monitorIncoming
- `packages/daemon/src/infrastructure/database/index.ts` - Re-exports incomingTransactions and incomingTxCursors
- `packages/daemon/src/__tests__/migration-chain.test.ts` - Updated EXPECTED_INDEXES (+4), ALL_TABLES (+2), version assertions to 21

## Decisions Made
- v21 migration uses `CREATE TABLE IF NOT EXISTS` (not bare `CREATE TABLE`) because pushSchema DDL executes before migrations, creating the tables via DDL first. Without IF NOT EXISTS, the migration fails on existing DBs where pushSchema already created the new tables.
- wallets.monitor_incoming placed after suspension_reason in DDL column order to maintain logical grouping before owner_approval_method.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] v21 migration DDL changed to IF NOT EXISTS**
- **Found during:** Task 2 (migration chain test execution)
- **Issue:** Plan specified `CREATE TABLE` (without IF NOT EXISTS) in v21 migration, but pushSchema executes `CREATE TABLE IF NOT EXISTS` DDL before running migrations. For existing DBs, pushSchema creates the new tables first, then v21 migration tries to create them again -- causing "table already exists" error.
- **Fix:** Changed migration DDL to `CREATE TABLE IF NOT EXISTS` and indexes to `CREATE INDEX IF NOT EXISTS` for idempotency.
- **Files modified:** packages/daemon/src/infrastructure/database/migrate.ts
- **Verification:** All 46 migration chain tests pass (T-1 through T-16h)
- **Committed in:** f671e62 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correctness. Consistent with existing migration patterns (v4, v5, v15, v16 all use IF NOT EXISTS). No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- incoming_transactions and incoming_tx_cursors tables ready for IncomingTxQueue (Phase 226) flush operations
- Drizzle schema ready for repository layer implementation
- wallets.monitor_incoming column ready for REST API opt-in endpoint (Phase 228)

---
*Phase: 224-core-types-db-foundation*
*Completed: 2026-02-22*
