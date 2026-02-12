---
phase: 89-db-migration
plan: 01
subsystem: database
tags: [sqlite, drizzle, migration, schema-rename, backward-compat]

# Dependency graph
requires:
  - phase: 85-db-migration
    provides: "Migration runner infrastructure, v2 migration pattern"
provides:
  - "v3 migration: agents table renamed to wallets in SQLite"
  - "Drizzle schema with wallets table, walletId FK columns"
  - "Backward-compat agents alias in barrel export"
  - "LATEST_SCHEMA_VERSION constant for fresh DB optimization"
affects: [90-core-rename, 91-daemon-rename, 92-api-mcp-rename]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pushSchema records all migration versions for fresh DBs (skip incremental)"
    - "DROP INDEX before index rename (SQLite ALTER TABLE RENAME keeps old index names)"
    - "Backward-compat table alias via re-export"

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/__tests__/migration-runner.test.ts

key-decisions:
  - "DDL uses latest names (wallets/wallet_id), pushSchema records LATEST_SCHEMA_VERSION to skip migrations for fresh DBs"
  - "Explicit DROP INDEX for idx_agents_* before creating idx_wallets_* (SQLite RENAME TABLE does not rename indexes)"
  - "AGENT_STATUSES import kept in schema.ts (Phase 90 renames it)"
  - "wallets as agents backward-compat alias exported from index.ts (removed in Phase 91)"

patterns-established:
  - "Fresh DB optimization: pushSchema records all migration versions so runMigrations is a no-op"
  - "Table rename migration pattern: ALTER TABLE RENAME + DROP old indexes + recreate FK tables + recreate indexes"

# Metrics
duration: 8min
completed: 2026-02-13
---

# Phase 89 Plan 01: DB Migration Summary

**SQLite v3 migration renames agents table to wallets with FK column/index/enum updates, Drizzle schema wallets definition, and backward-compat agents alias**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-12T15:24:52Z
- **Completed:** 2026-02-12T15:32:27Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- v3 migration implemented: renames agents->wallets, 5 FK tables agent_id->wallet_id, all indexes renamed, AGENT_* enum data updated to WALLET_*
- Drizzle schema.ts uses wallets table name, walletId field names, wallet-based index names
- Barrel export provides both `wallets` (canonical) and `agents` (backward-compat alias)
- pushSchema optimized: fresh DBs get latest schema + all version records, skipping migrations
- 19 migration tests pass (7 new v3 tests + 12 existing updated)
- FK integrity verified post-migration

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED -- Write failing tests for v3 migration** - `d9df1b9` (test)
2. **Task 2: TDD GREEN -- Implement v3 migration + update Drizzle schema + backward-compat alias** - `bc17415` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - v3 migration (9 steps), updated DDL to wallets/wallet_id, LATEST_SCHEMA_VERSION, pushSchema optimization
- `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle schema: wallets table, walletId FK columns, wallet-based indexes
- `packages/daemon/src/infrastructure/database/index.ts` - Barrel export: wallets + backward-compat agents alias + LATEST_SCHEMA_VERSION
- `packages/daemon/src/__tests__/migration-runner.test.ts` - 7 new v3 migration tests + existing tests updated for wallets table

## Decisions Made
- **DDL latest schema**: getCreateTableStatements/getCreateIndexStatements use wallets/wallet_id (latest state). pushSchema records all migration versions so runMigrations is a no-op for fresh DBs.
- **Explicit DROP INDEX**: SQLite ALTER TABLE RENAME TO does not rename indexes. Added explicit DROP INDEX for idx_agents_* before creating idx_wallets_* in v3 migration.
- **AGENT_STATUSES kept**: The status CHECK constraint values (CREATING, ACTIVE, SUSPENDED...) are status states, not agent/wallet terms. Phase 90 will rename the constant.
- **Backward-compat alias**: `export { wallets as agents }` in index.ts allows existing daemon code to compile until Phase 91 migrates all references.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SQLite ALTER TABLE RENAME does not rename indexes**
- **Found during:** Task 2 (v3 migration implementation)
- **Issue:** After `ALTER TABLE agents RENAME TO wallets`, the indexes `idx_agents_*` remained with their old names on the wallets table. Test 3 (index rename verification) caught this.
- **Fix:** Added explicit `DROP INDEX IF EXISTS idx_agents_*` statements after the table rename, before creating new `idx_wallets_*` indexes.
- **Files modified:** packages/daemon/src/infrastructure/database/migrate.ts
- **Verification:** All 19 migration tests pass, including index rename verification
- **Committed in:** bc17415 (Task 2 commit)

**2. [Rule 1 - Bug] pushSchema needed to record all migration versions for fresh DBs**
- **Found during:** Task 2 (pushSchema update)
- **Issue:** pushSchema creates latest DDL (wallets table) but only recorded version 1. When runMigrations ran, it attempted v2+v3 against the already-correct wallets schema, causing failures.
- **Fix:** pushSchema now records all migration versions (from MIGRATIONS array) for fresh DBs via INSERT OR IGNORE, so runMigrations skips them.
- **Files modified:** packages/daemon/src/infrastructure/database/migrate.ts
- **Verification:** Fresh DB tests pass without running migrations
- **Committed in:** bc17415 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness. SQLite index behavior is a known quirk. No scope creep.

## Issues Encountered
- 332 daemon tests fail with "no such table: agents" -- expected behavior. These tests reference the old agents table in raw SQL. Phase 91 will migrate all daemon code from agents to wallets terminology.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DB layer complete: wallets table, wallet_id FK columns, wallet-based indexes
- Phase 90 (core-rename) can proceed: rename @waiaas/core enums and types
- Phase 91 (daemon-rename) can proceed: migrate all daemon code from agents/agentId to wallets/walletId
- Backward-compat agents alias available for gradual migration

## Self-Check: PASSED

- All 5 key files exist on disk
- Commit d9df1b9 (Task 1) verified
- Commit bc17415 (Task 2) verified
- 19 migration tests pass

---
*Phase: 89-db-migration*
*Completed: 2026-02-13*
