---
phase: 76-infra-pipeline-foundation
plan: 02
subsystem: database, infra
tags: [sqlite, migration, zod, discriminatedUnion, schema-version, alter-table]

# Dependency graph
requires:
  - phase: 76-01
    provides: ChainError 25-code enum + INSUFFICIENT_FOR_FEE error code move
provides:
  - runMigrations() incremental migration runner with schema_version tracking
  - Migration interface + MIGRATIONS registry array
  - TransactionRequestSchema discriminatedUnion 5-type (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)
  - 5 individual type schemas (TransferRequestSchema, TokenTransferRequestSchema, etc.)
affects:
  - Phase 77 (token transfer pipeline -- uses TokenTransferRequestSchema)
  - Phase 78 (contract call pipeline -- uses ContractCallRequestSchema)
  - Phase 79 (approve pipeline -- uses ApproveRequestSchema)
  - Phase 80 (batch pipeline -- uses BatchRequestSchema)
  - Phase 81 (Stage 1 migration to TransactionRequestSchema)
  - All future DB schema changes (must use MIGRATIONS array)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Incremental migration runner: schema_version-based, individual transaction per migration, rollback on failure"
    - "discriminatedUnion 5-type schema: z.discriminatedUnion('type', [...]) for pipeline type routing"

key-files:
  created:
    - packages/daemon/src/__tests__/migration-runner.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/core/src/schemas/transaction.schema.ts
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/core/src/__tests__/schemas.test.ts
    - packages/daemon/src/__tests__/notification-log.test.ts

key-decisions:
  - "TransferRequestInput type name (not TransferRequest) to avoid conflict with IChainAdapter.TransferRequest interface"
  - "runMigrations() accepts optional migrations array parameter for testability"
  - "schema_version v1 description changed from 'Add notification_logs table' to 'Initial schema (9 tables)' for accuracy"
  - "BATCH instructions use z.union (not discriminatedUnion) since inner type field is optional"

patterns-established:
  - "Migration runner: version > currentMax, ascending order, individual BEGIN/COMMIT per migration"
  - "Schema naming: XxxRequestSchema for Zod schemas, XxxRequest for inferred types (except when conflicting with interface types)"

# Metrics
duration: 6min
completed: 2026-02-12
---

# Phase 76 Plan 02: Migration Runner + discriminatedUnion 5-type Schema Summary

**schema_version-based incremental migration runner + z.discriminatedUnion 5-type TransactionRequestSchema for pipeline type routing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-11T17:16:20Z
- **Completed:** 2026-02-11T17:22:34Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Implemented runMigrations() with schema_version-based incremental migration: sequential execution, skip already-applied, rollback on failure
- Defined TransactionRequestSchema as z.discriminatedUnion('type', [...]) with 5 transaction types
- Kept SendTransactionRequestSchema for backward compatibility
- All exports available from @waiaas/core barrel
- 20 new tests (7 migration runner + 13 discriminatedUnion schema)

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration runner + tests** - `04f2a99` (feat)
2. **Task 2: discriminatedUnion 5-type schema + tests** - `b3f0380` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - Added Migration interface, MIGRATIONS array, runMigrations() function; updated pushSchema() to call runMigrations()
- `packages/daemon/src/infrastructure/database/index.ts` - Added exports for runMigrations, MIGRATIONS, Migration
- `packages/daemon/src/__tests__/migration-runner.test.ts` - 7 tests: empty array, sequential execution, skip applied, rollback, order guarantee, v1 skip, description recording
- `packages/core/src/schemas/transaction.schema.ts` - Added 5 type-specific schemas + TransactionRequestSchema discriminatedUnion + type exports
- `packages/core/src/schemas/index.ts` - Added exports for all new schemas and types
- `packages/core/src/index.ts` - Added exports for all new schemas and types (TransferRequestInput to avoid name conflict)
- `packages/core/src/__tests__/schemas.test.ts` - 13 new discriminatedUnion tests
- `packages/daemon/src/__tests__/notification-log.test.ts` - Fixed schema_version v1 description assertion

## Decisions Made
- **TransferRequestInput type name:** Existing `TransferRequest` interface in `chain-adapter.types.ts` (IChainAdapter internal type with bigint amounts) conflicts with the new Zod-inferred type. Named schema-inferred type `TransferRequestInput` to differentiate.
- **Testable runMigrations:** Made `migrations` parameter optional (defaults to global MIGRATIONS array) so tests can pass custom migration arrays without modifying global state.
- **schema_version v1 description:** Changed from 'Add notification_logs table' to 'Initial schema (9 tables)' -- version 1 represents the complete initial schema, not a single table addition.
- **BATCH inner instructions:** Used z.union (not discriminatedUnion) for batch instruction items since the `type` field is omitted from inner instructions -- they are identified by shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed schema_version v1 description string**
- **Found during:** Task 1 (Migration runner implementation)
- **Issue:** schema_version v1 description was 'Add notification_logs table' which is misleading -- v1 is the full initial schema
- **Fix:** Changed to 'Initial schema (9 tables)' and updated assertion in notification-log.test.ts
- **Files modified:** migrate.ts, notification-log.test.ts
- **Verification:** notification-log tests pass (16/16)
- **Committed in:** 04f2a99 (Task 1), b3f0380 (Task 2 - test fix)

**2. [Rule 1 - Bug] TransferRequest type naming conflict**
- **Found during:** Task 2 (Schema definition)
- **Issue:** `TransferRequest` type already exported from `interfaces/chain-adapter.types.ts` via @waiaas/core barrel -- adding another `TransferRequest` would create ambiguity
- **Fix:** Named the schema-inferred type `TransferRequestInput` instead
- **Files modified:** transaction.schema.ts, schemas/index.ts, core/index.ts
- **Verification:** `pnpm turbo build` succeeds with no type errors
- **Committed in:** b3f0380 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Migration runner ready for Phase 77+ to add actual ALTER TABLE migrations to MIGRATIONS array
- TransactionRequestSchema ready for Stage 1 pipeline type routing (Phase 81)
- All 5 type-specific schemas ready for respective pipeline phases (77-80)
- Monorepo build clean, all 614 tests pass (101 core + 513 daemon)

## Self-Check: PASSED

---
*Phase: 76-infra-pipeline-foundation*
*Completed: 2026-02-12*
