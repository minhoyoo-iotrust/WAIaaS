---
phase: 85-db-migration
plan: 01
subsystem: database
tags: [sqlite, migration, check-constraint, evm, 12-step-recreation]

# Dependency graph
requires:
  - phase: 82-evm-chain-types
    provides: CHAIN_TYPES and NETWORK_TYPES SSoT arrays with EVM networks
provides:
  - Migration.managesOwnTransaction flag for 12-step table recreations
  - schema_version v2 migration expanding agents.network CHECK for EVM
  - Expanded agents table accepting all EVM network values
affects: [86-evm-routes, future schema migrations needing 12-step recreation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "managesOwnTransaction migration pattern: runner disables FK, up() manages own BEGIN/COMMIT"
    - "12-step table recreation for SQLite CHECK constraint changes"
    - "FK integrity check after table recreation (PRAGMA foreign_key_check)"

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/__tests__/migration-runner.test.ts
    - packages/daemon/src/__tests__/database.test.ts
    - packages/daemon/src/__tests__/notification-log.test.ts

key-decisions:
  - "v2 migration uses managesOwnTransaction=true: runner sets FK OFF, up() does BEGIN/COMMIT/ROLLBACK"
  - "v2 up() re-enables FK and runs foreign_key_check before returning (defense-in-depth)"
  - "Runner restores foreign_keys=ON in catch block on failure (best-effort)"
  - "Existing migration runner tests bumped to version 10+ to avoid conflict with real v2 migration"
  - "v2 test suite uses dedicated v1-only DB setup (manual schema creation without runMigrations)"

patterns-established:
  - "managesOwnTransaction: Migration flag that delegates PRAGMA/txn management to up() function"
  - "v1-only test DB: manual CREATE TABLE with hardcoded v1 constraints for migration path testing"

# Metrics
duration: 7min
completed: 2026-02-12
---

# Phase 85 Plan 01: DB Migration v2 Summary

**schema_version v2 migration with managesOwnTransaction flag expanding agents.network CHECK to accept EVM networks via 12-step table recreation**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-12T11:05:42Z
- **Completed:** 2026-02-12T11:12:56Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 4

## Accomplishments
- Migration.managesOwnTransaction flag enables 12-step table recreation migrations that need PRAGMA foreign_keys=OFF
- v2 migration recreates agents table with expanded network CHECK accepting all NETWORK_TYPES (Solana + EVM)
- FK integrity verified after table recreation via PRAGMA foreign_key_check
- Existing Solana agent data 100% preserved through migration (tested with 3 networks)
- 627/627 daemon tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED -- managesOwnTransaction + v2 migration tests** - `1096a60` (test)
2. **Task 2: TDD GREEN -- Migration.managesOwnTransaction + v2 migration implementation** - `5cd4407` (feat)

_TDD: RED phase wrote 5 failing tests, GREEN phase implemented + fixed all to pass_

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - Added managesOwnTransaction to Migration interface, runMigrations branching, v2 migration (12-step agents table recreation)
- `packages/daemon/src/__tests__/migration-runner.test.ts` - 5 new tests: PRAGMA management, failure recovery, data preservation, EVM CHECK expansion, FK integrity
- `packages/daemon/src/__tests__/database.test.ts` - 2 new tests: ethereum-mainnet and polygon-amoy CHECK acceptance
- `packages/daemon/src/__tests__/notification-log.test.ts` - Updated pushSchema idempotency test for schema_version v2

## Decisions Made
- **managesOwnTransaction delegation**: Runner sets PRAGMA foreign_keys=OFF before calling up(), up() manages its own BEGIN/COMMIT. Runner restores foreign_keys=ON after return or in catch block.
- **Defense-in-depth FK check**: v2 up() re-enables FK and runs foreign_key_check before returning (even though runner also restores FK). Ensures integrity verified while FK is active.
- **Test isolation for v2 path**: v2 migration tests use a dedicated v1-only DB (manual CREATE TABLE with Solana-only CHECK constraints) rather than using pushSchema(), which now auto-runs v2.
- **Existing test version bump**: Migration runner unit tests bumped from version 2/3/4 to 10/11/12 to avoid collision with real v2 migration that pushSchema auto-runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed notification-log.test.ts regression from v2 auto-migration**
- **Found during:** Task 2 (full daemon test suite verification)
- **Issue:** `notification-log.test.ts` expected schema_version to have exactly 1 row, but pushSchema now auto-runs v2 migration (2 rows)
- **Fix:** Updated assertion from `toHaveLength(1)` to `toBeGreaterThanOrEqual(2)` with version value checks
- **Files modified:** `packages/daemon/src/__tests__/notification-log.test.ts`
- **Verification:** 627/627 tests pass
- **Committed in:** `5cd4407` (part of Task 2 commit)

**2. [Rule 1 - Bug] Fixed existing migration runner tests conflicting with real v2 migration**
- **Found during:** Task 2 (implementing v2 migration)
- **Issue:** Existing tests used version numbers 2/3/4 which now conflict with the real v2 migration auto-run by pushSchema
- **Fix:** Bumped all test migration versions to 10+ range and updated assertions for new baseline (getMaxVersion() = 2 instead of 1)
- **Files modified:** `packages/daemon/src/__tests__/migration-runner.test.ts`
- **Verification:** 12/12 migration-runner tests pass
- **Committed in:** `5cd4407` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness -- existing tests needed to account for new v2 migration. No scope creep.

## Issues Encountered
None beyond the auto-fixed test regressions documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- agents table now accepts EVM network values (ethereum-mainnet, polygon-amoy, etc.)
- chain='ethereum' agents can be stored in the database
- Migration infrastructure (managesOwnTransaction) ready for future 12-step recreations
- No blockers for subsequent phases

## Self-Check: PASSED

---
*Phase: 85-db-migration*
*Completed: 2026-02-12*
