---
phase: 233-db-migration-schema-policy
plan: 01
subsystem: database
tags: [sqlite, migration, caip-19, drizzle, token-registry, openapi]

# Dependency graph
requires:
  - phase: 231-caip-module
    provides: tokenAssetId(), NETWORK_TO_CAIP2, NetworkType from @waiaas/core
provides:
  - DB v22 migration with asset_id column and CAIP-19 backfill
  - Drizzle tokenRegistry.assetId column
  - RegistryToken.assetId field in token registry service
  - GET /v1/tokens response includes assetId for all entries
  - TokenRegistryItemSchema with assetId field in OpenAPI
  - v22 data-transformation test covering known/unknown network backfill
affects: [233-02, 233-03, token-api, mcp-tools, admin-ui, sdk]

# Tech tracking
tech-stack:
  added: []
  patterns: [PRAGMA table_info guard for idempotent ALTER TABLE ADD COLUMN]

key-files:
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/token-registry/token-registry-service.ts
    - packages/daemon/src/api/routes/tokens.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/__tests__/migration-chain.test.ts
    - packages/daemon/src/__tests__/migration-runner.test.ts
    - packages/daemon/src/__tests__/migration-v14.test.ts
    - packages/daemon/src/__tests__/migration-v6-v8.test.ts
    - packages/daemon/src/__tests__/signing-sdk-migration.test.ts
    - packages/daemon/src/__tests__/settings-schema-migration.test.ts
    - packages/daemon/src/__tests__/schema-compatibility.test.ts

key-decisions:
  - "PRAGMA table_info guard before ALTER TABLE ADD COLUMN to avoid duplicate column error on fresh DDL databases"
  - "Test fixture migration versions bumped from 22->23, 23->24, 24->25 to avoid conflicts with real v22 migration"

patterns-established:
  - "Column existence check pattern: PRAGMA table_info + .some() guard before ALTER TABLE ADD COLUMN for migrations that may run on fresh-DDL databases"

requirements-completed: [TOKN-02, TOKN-03, TOKN-04]

# Metrics
duration: 8min
completed: 2026-02-22
---

# Phase 233 Plan 01: DB Migration + Schema + Token API Summary

**DB v22 migration adds asset_id column to token_registry with CAIP-19 backfill, Drizzle schema sync, and GET /v1/tokens response includes assetId for all tokens**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-22T04:26:22Z
- **Completed:** 2026-02-22T04:34:29Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- DB v22 migration adds nullable asset_id column to token_registry and backfills existing records using tokenAssetId() with per-row error handling for unknown networks
- Token API responses (GET /v1/tokens) include assetId field for all entries: builtin tokens via on-the-fly generation, custom tokens from DB with fallback generation
- All 7 migration/schema test files updated to assert LATEST_SCHEMA_VERSION === 22, with new v22 data-transformation test verifying backfill correctness

## Task Commits

Each task was committed atomically:

1. **Task 1: DB v22 migration + DDL + Drizzle schema** - `601ed909` (feat)
2. **Task 2: Token registry service + API response assetId** - `2d2be3f0` (feat)
3. **Task 3: Update schema version assertions + v22 data-transformation test** - `9f0ed79e` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - LATEST_SCHEMA_VERSION=22, DDL asset_id, v22 migration with backfill
- `packages/daemon/src/infrastructure/database/schema.ts` - Drizzle tokenRegistry.assetId column
- `packages/daemon/src/infrastructure/token-registry/token-registry-service.ts` - RegistryToken.assetId, on-the-fly generation for builtins
- `packages/daemon/src/api/routes/tokens.ts` - GET /v1/tokens response includes assetId
- `packages/daemon/src/api/routes/openapi-schemas.ts` - TokenRegistryItemSchema with assetId: z.string().nullable()
- `packages/daemon/src/__tests__/migration-runner.test.ts` - v22 assertions + data-transformation test (2 test cases)
- `packages/daemon/src/__tests__/migration-chain.test.ts` - 4 assertions bumped to v22
- `packages/daemon/src/__tests__/migration-v14.test.ts` - 3 assertions bumped to v22
- `packages/daemon/src/__tests__/migration-v6-v8.test.ts` - 1 assertion bumped to v22
- `packages/daemon/src/__tests__/signing-sdk-migration.test.ts` - 2 assertions bumped to v22
- `packages/daemon/src/__tests__/settings-schema-migration.test.ts` - 3 assertions bumped to v22
- `packages/daemon/src/__tests__/schema-compatibility.test.ts` - 1 assertion bumped to v22

## Decisions Made
- Used PRAGMA table_info guard before ALTER TABLE ADD COLUMN to prevent "duplicate column name" error when v22 migration runs on fresh-DDL databases (where DDL already includes asset_id)
- Bumped test fixture migration versions (22->23, 23->24, 24->25) across migration-runner.test.ts and signing-sdk-migration.test.ts to avoid conflicts with the real v22 migration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate column error in v22 migration for fresh-DDL databases**
- **Found during:** Task 3 (test execution)
- **Issue:** Fresh databases created via pushSchema() include asset_id in DDL, then v22 migration tries ALTER TABLE ADD COLUMN asset_id again, causing "duplicate column name: asset_id" error in chain migration tests
- **Fix:** Added PRAGMA table_info guard to check column existence before ALTER TABLE ADD COLUMN
- **Files modified:** packages/daemon/src/infrastructure/database/migrate.ts
- **Verification:** All 131 migration tests pass across 7 test files
- **Committed in:** 9f0ed79e (Task 3 commit)

**2. [Rule 1 - Bug] Fixed test fixture version conflicts with real v22 migration**
- **Found during:** Task 3 (test execution)
- **Issue:** Test migrations in migration-runner.test.ts and signing-sdk-migration.test.ts used version 22 as fixture versions, which now conflicts with the real v22 migration (pushSchema records it as applied, so test v22 is skipped)
- **Fix:** Bumped all test fixture versions by +1 (22->23, 23->24, 24->25)
- **Files modified:** packages/daemon/src/__tests__/migration-runner.test.ts, packages/daemon/src/__tests__/signing-sdk-migration.test.ts
- **Verification:** All 131 migration tests pass
- **Committed in:** 9f0ed79e (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for test correctness. Column existence guard is a general best practice for idempotent migrations. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DB migration v22 complete, token API returns assetId
- Ready for Plan 233-02 (ALLOWED_TOKENS policy CAIP-19 evaluation) and Plan 233-03 (token registry enhancements)
- All downstream consumers (MCP tools, SDK, Admin UI) can now access CAIP-19 asset identifiers via GET /v1/tokens

---
*Phase: 233-db-migration-schema-policy*
*Completed: 2026-02-22*
