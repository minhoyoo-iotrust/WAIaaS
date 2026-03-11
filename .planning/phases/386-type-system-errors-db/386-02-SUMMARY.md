---
phase: 386-type-system-errors-db
plan: 02
subsystem: database
tags: [sqlite, drizzle, migration, wallet-credentials, transactions]

requires:
  - phase: 386-01
    provides: ResolvedAction 3-kind types and error codes

provides:
  - DB v55 wallet_credentials table (11 columns, 4 indexes, FK to wallets)
  - DB v56 transactions extension (action_kind, venue, operation, external_id columns + 3 indexes)
  - Drizzle walletCredentials table schema with blob mode for encrypted fields
  - LATEST_SCHEMA_VERSION = 56
  - 18 migration tests (snapshot + data transformation)

affects: [387, 388, 389, 390]

tech-stack:
  added: []
  patterns: [idempotent-column-check-migration, blob-mode-encrypted-fields]

key-files:
  created:
    - packages/daemon/src/__tests__/migration-v55-v56.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts

key-decisions:
  - "wallet_credentials uses blob mode for encrypted_value/iv/auth_tag (binary AES-256-GCM data)"
  - "v56 migration uses PRAGMA table_info column existence check for idempotency (pushSchema-created DBs)"
  - "action_kind defaults to 'contractCall' for backward compatibility with existing transaction records"

patterns-established:
  - "Idempotent ALTER TABLE pattern: check column existence via PRAGMA before ADD COLUMN"
  - "Encrypted field storage: blob({mode:'buffer'}) for crypto material in Drizzle"

requirements-completed: [DBMIG-01, DBMIG-02, DBMIG-03]

duration: 12min
completed: 2026-03-12
---

# Phase 386 Plan 02: DB v55+v56 Migration + Drizzle Schema Summary

**wallet_credentials table (v55) with AES-256-GCM blob storage + transactions action_kind/venue/operation columns (v56) with idempotent migration pattern**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-12T17:48:00Z
- **Completed:** 2026-03-12T18:00:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- v55 migration creates wallet_credentials table with 11 columns, CHECK constraint on type, FK cascade to wallets, 4 indexes
- v56 migration adds action_kind/venue/operation/external_id to transactions with idempotent column existence checks
- Drizzle walletCredentials table with blob mode for encrypted fields
- 18 migration tests covering fresh DB, incremental migration, data preservation, and schema snapshot matching
- Updated 11 existing test files for LATEST_SCHEMA_VERSION 54->56 compatibility

## Task Commits

1. **Task 1: DB v55+v56 migrations + DDL update** - `81dee395` (feat)
2. **Task 2: Drizzle schema extension** - `26e4c0f7` (feat)
3. **Test fixes: schema version assertions** - `c0323292` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - v55+v56 migrations, wallet_credentials DDL, transactions column extensions, LATEST_SCHEMA_VERSION=56
- `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle walletCredentials table + transactions actionKind/venue/operation/externalId columns
- `packages/daemon/src/__tests__/migration-v55-v56.test.ts` - 18 migration tests (createV54Db helper, snapshot matching)
- 11 existing test files - LATEST_SCHEMA_VERSION assertions updated from 54 to 56

## Decisions Made
- wallet_credentials uses blob({mode:'buffer'}) for encrypted_value/iv/auth_tag (binary AES-256-GCM data, not text-encodable)
- v56 migration checks column existence via PRAGMA table_info before ALTER TABLE (handles pushSchema-created DBs)
- action_kind defaults to 'contractCall' to preserve existing transaction row semantics

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated LATEST_SCHEMA_VERSION assertions in 11 existing test files**
- **Found during:** Task 1 verification (all migration tests)
- **Issue:** 11 existing migration test files had hardcoded `toBe(54)` or `toBe(56)` assertions for LATEST_SCHEMA_VERSION
- **Fix:** Updated all assertions to `toBe(56)`, bumped synthetic migration versions in migration-runner.test.ts (55/56/57 -> 57/58/59) and signing-sdk-migration.test.ts (55 -> 57)
- **Files modified:** migration-runner.test.ts, migration-chain.test.ts, migration-v14.test.ts, migration-v33.test.ts, migration-v34-v35.test.ts, migration-v44.test.ts, migration-v45.test.ts, migration-v51.test.ts, migration-v6-v8.test.ts, settings-schema-migration.test.ts, signing-sdk-migration.test.ts
- **Committed in:** c0323292

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for existing test suite compatibility. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- wallet_credentials table ready for CredentialVault implementation (Phase 388)
- transactions action_kind/venue/operation columns ready for off-chain action recording (Phase 390)
- Ready for Plan 386-03 (IActionProvider return type extension)

---
*Phase: 386-type-system-errors-db*
*Completed: 2026-03-12*
