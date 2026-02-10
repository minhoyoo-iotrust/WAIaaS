---
phase: 49-daemon-infra
plan: 01
subsystem: database
tags: [sqlite, drizzle-orm, better-sqlite3, uuidv7, wal, pragma, check-constraints]

# Dependency graph
requires:
  - phase: 48-monorepo-scaffold-core
    provides: "@waiaas/core enum SSoT arrays (CHAIN_TYPES, AGENT_STATUSES, etc.)"
provides:
  - "7-table Drizzle ORM schema (agents, sessions, transactions, policies, pending_approvals, audit_log, key_value_store)"
  - "createDatabase() with 7 PRAGMAs (WAL, foreign_keys, etc.)"
  - "closeDatabase() with WAL checkpoint(TRUNCATE)"
  - "pushSchema() for idempotent schema creation"
  - "generateId() UUID v7 with ms-precision time ordering"
affects:
  - "49-02 (keystore -- uses database for key metadata)"
  - "49-03 (config/lifecycle -- uses database connection)"
  - "50-solana-transfer (stores transactions in DB)"

# Tech tracking
tech-stack:
  added: ["better-sqlite3 ^12.6.0", "drizzle-orm ^0.45.0", "uuidv7 ^1.0.2", "@types/better-sqlite3 ^7.6.0", "drizzle-kit ^0.30.0"]
  patterns: ["buildCheckSql() derives CHECK constraints from SSoT arrays", "pushSchema() raw SQL for programmatic schema creation", "DatabaseConnection type for sqlite+db pair"]

key-files:
  created:
    - "packages/daemon/src/infrastructure/database/schema.ts"
    - "packages/daemon/src/infrastructure/database/connection.ts"
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/daemon/src/infrastructure/database/id.ts"
    - "packages/daemon/src/infrastructure/database/index.ts"
    - "packages/daemon/src/__tests__/database.test.ts"
  modified:
    - "packages/daemon/package.json"
    - "packages/core/src/enums/transaction.ts"
    - "pnpm-lock.yaml"

key-decisions:
  - "TD-09 confirmed: uuidv7 npm package for UUID v7 generation (correctness over manual implementation)"
  - "pushSchema() uses raw SQL (CREATE TABLE IF NOT EXISTS) instead of drizzle-kit CLI for programmatic daemon startup"
  - "PARTIAL_FAILURE added to core TRANSACTION_STATUSES SSoT (was missing from v0.10 enum update)"
  - "In-memory SQLite for tests (no filesystem side effects); file-based tests added for WAL/mmap verification"

patterns-established:
  - "buildCheckSql(): derives SQL CHECK constraints from readonly string arrays imported from @waiaas/core"
  - "DatabaseConnection interface: typed pair of raw sqlite + Drizzle ORM instance with schema type parameter"
  - "pushSchema() idempotent: safe to call on every daemon startup"

# Metrics
duration: 8min
completed: 2026-02-10
---

# Phase 49 Plan 01: SQLite Database Schema Summary

**7-table Drizzle ORM schema with WAL mode, CHECK constraints from enum SSoT, UUID v7 IDs, and 37 comprehensive tests**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-09T16:58:05Z
- **Completed:** 2026-02-09T17:06:06Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- 7 Drizzle ORM table definitions (agents, sessions, transactions, policies, pending_approvals, audit_log, key_value_store) with all columns, indexes, and foreign keys matching doc 25
- CHECK constraints dynamically derived from @waiaas/core enum SSoT arrays (CHAIN_TYPES, NETWORK_TYPES, AGENT_STATUSES, TRANSACTION_STATUSES, TRANSACTION_TYPES, POLICY_TYPES, POLICY_TIERS, severity literals)
- createDatabase() applies 7 PRAGMAs (WAL, synchronous=NORMAL, foreign_keys=ON, busy_timeout=5000, cache_size=-64000, mmap_size=268435456, temp_store=MEMORY)
- 37 tests covering schema creation, PRAGMA verification (in-memory + file-based), CHECK constraints, UUID v7 ordering, FK behavior (CASCADE/RESTRICT/SET NULL), and close behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies + Drizzle 7-table schema** - `2b20890` (feat)
2. **Task 2: Database tests (37 tests)** - `53a1781` (test)

## Files Created/Modified

- `packages/daemon/src/infrastructure/database/schema.ts` - 7 Drizzle ORM table definitions with CHECK constraints from enum SSoT
- `packages/daemon/src/infrastructure/database/connection.ts` - createDatabase() with 7 PRAGMAs, closeDatabase() with WAL checkpoint
- `packages/daemon/src/infrastructure/database/migrate.ts` - pushSchema() creates tables via raw SQL (idempotent)
- `packages/daemon/src/infrastructure/database/id.ts` - generateId() using uuidv7 package (TD-09)
- `packages/daemon/src/infrastructure/database/index.ts` - Barrel export for database module
- `packages/daemon/src/__tests__/database.test.ts` - 37 tests across 7 categories
- `packages/daemon/package.json` - Added better-sqlite3, drizzle-orm, uuidv7, @types/better-sqlite3, drizzle-kit
- `packages/core/src/enums/transaction.ts` - Added PARTIAL_FAILURE to TRANSACTION_STATUSES
- `pnpm-lock.yaml` - Updated with new dependencies

## Decisions Made

- **TD-09 confirmed:** Used `uuidv7` npm package for UUID v7 generation. Manual implementation was rejected for correctness reasons
- **pushSchema() approach:** Used raw SQL `CREATE TABLE IF NOT EXISTS` statements instead of drizzle-kit CLI push. This is more reliable for programmatic daemon startup and avoids CLI dependency at runtime
- **PARTIAL_FAILURE addition:** Added to core TRANSACTION_STATUSES SSoT array. This status was defined in doc 25 (v0.10 update) but was missing from the core enum. Required for CHECK constraint derivation to include all 9 transaction statuses
- **Test strategy:** In-memory SQLite for most tests (fast, no filesystem side effects), with dedicated file-based tests for WAL journal_mode and mmap_size verification since these PRAGMAs behave differently in memory mode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added PARTIAL_FAILURE to core TRANSACTION_STATUSES**
- **Found during:** Task 1 (schema creation)
- **Issue:** Doc 25 section 2.3 specifies 9 transaction statuses including PARTIAL_FAILURE (v0.10 addition), but @waiaas/core enum only had 8 statuses
- **Fix:** Added 'PARTIAL_FAILURE' to TRANSACTION_STATUSES array in packages/core/src/enums/transaction.ts
- **Files modified:** packages/core/src/enums/transaction.ts
- **Verification:** Core builds successfully, CHECK constraint includes PARTIAL_FAILURE, test confirms valid INSERT
- **Committed in:** 2b20890 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed self-referential FK type annotation for transactions.parentId**
- **Found during:** Task 1 (schema creation)
- **Issue:** TypeScript circular reference error when using `(): typeof transactions.id => transactions.id` for self-referential FK
- **Fix:** Used `AnySQLiteColumn` type import from drizzle-orm/sqlite-core for proper self-referential FK typing
- **Files modified:** packages/daemon/src/infrastructure/database/schema.ts
- **Verification:** tsc --noEmit passes without errors
- **Committed in:** 2b20890 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correct schema definition. No scope creep.

## Issues Encountered

- **In-memory SQLite PRAGMA behavior:** WAL journal_mode reports 'memory' for in-memory databases (WAL requires a file). mmap_size pragma returns empty result array in memory mode. Solved by adding file-based PRAGMA tests for WAL and mmap verification, while accepting memory-mode behavior in in-memory tests
- **Pre-existing keystore files:** Untracked keystore files from plan 49-02 exist in the daemon package and cause tsc build failures (missing sodium-native types, incorrect error code). These are not part of this plan. Verified database files compile cleanly by isolating the build check

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Database module complete and tested, ready for plan 49-02 (keystore) and 49-03 (config/lifecycle) to build upon
- createDatabase() and pushSchema() are ready to be called from daemon startup sequence
- better-sqlite3 native addon compiled successfully on this platform
- Pre-existing keystore files (plan 49-02) need TypeScript fixes when that plan executes

## Self-Check: PASSED

---
*Phase: 49-daemon-infra*
*Completed: 2026-02-10*
