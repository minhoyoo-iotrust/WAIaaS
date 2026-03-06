---
phase: 338-foundation
plan: 02
subsystem: api, database
tags: [userop, erc-4337, zod, drizzle, migration, error-codes]

requires:
  - phase: none
    provides: independent of 338-01 (parallel wave)

provides:
  - UserOp v0.7 Zod schemas (5 schemas, 5 types)
  - 5 USEROP domain error codes
  - DB v45 userop_builds table + Drizzle schema
affects: [339-01, 339-02, 340-01, 340-02]

tech-stack:
  added: []
  patterns: [userop-schema-pattern, userop-error-pattern]

key-files:
  created:
    - packages/core/src/schemas/userop.schema.ts
    - packages/core/src/__tests__/userop-schema.test.ts
    - packages/daemon/src/__tests__/migration-v45.test.ts
  modified:
    - packages/core/src/schemas/index.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts

key-decisions:
  - "HexAddress regex for 40-char addresses, HexString for arbitrary 0x-prefixed data"
  - "UserOpBuildResponse strips gas/paymaster fields (platform fills them)"
  - "userop_builds.used is CHECK(0,1) integer, not boolean (SQLite convention)"
  - "wallet_id is TEXT (not FK to wallets) for simplicity and future flexibility"

patterns-established:
  - "USEROP error domain for all UserOp Build/Sign API errors"
  - "userop_builds table pattern: TTL-based with expires_at index for cleanup"

requirements-completed: [SCHM-01, SCHM-02, SCHM-03, SCHM-04, SCHM-05, ERR-01, ERR-02, ERR-03, ERR-04, ERR-05, DB-01, DB-02]

duration: 5min
completed: 2026-03-06
---

# Phase 338 Plan 02: Zod Schemas + Error Codes + DB v45 Summary

**UserOp v0.7 Zod schemas (5 schemas), USEROP domain error codes (5 codes), and DB v45 userop_builds table for Build/Sign API foundation**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T08:43:00Z
- **Completed:** 2026-03-06T08:50:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- UserOperationV07Schema with full EntryPoint v0.7 field validation
- UserOpBuild/Sign Request/Response schemas with TransactionRequest reuse
- 5 error codes (EXPIRED_BUILD, BUILD_NOT_FOUND, BUILD_ALREADY_USED, CALLDATA_MISMATCH, SENDER_MISMATCH)
- DB v45 migration: userop_builds table with wallet_id and expires_at indexes
- Drizzle ORM useropBuilds schema (Table 25)
- 16 new tests (8 schema + 8 migration)

## Task Commits

1. **Task 1: UserOp v0.7 Zod schemas + error codes** - `83592575` (feat)
2. **Task 2: DB v45 migration + Drizzle schema** - `c2f27d71` (feat)

## Files Created/Modified
- `packages/core/src/schemas/userop.schema.ts` - 5 Zod schemas + 5 TypeScript types
- `packages/core/src/schemas/index.ts` - Re-export userop schemas
- `packages/core/src/errors/error-codes.ts` - USEROP domain + 5 error codes
- `packages/core/src/i18n/en.ts` - English error messages
- `packages/core/src/i18n/ko.ts` - Korean error messages
- `packages/core/src/__tests__/userop-schema.test.ts` - 8 schema + error tests
- `packages/core/src/__tests__/errors.test.ts` - Updated count/domain assertions
- `packages/daemon/src/infrastructure/database/migrate.ts` - v45 migration + DDL
- `packages/daemon/src/infrastructure/database/schema.ts` - useropBuilds Drizzle table
- `packages/daemon/src/__tests__/migration-v45.test.ts` - 8 migration tests
- `packages/daemon/src/__tests__/migration-v44.test.ts` - Updated version assertions
- `packages/daemon/src/__tests__/migration-chain.test.ts` - Updated version assertions

## Decisions Made
- HexAddress uses strict 40-char regex, HexString allows any 0x-prefixed hex
- wallet_id is TEXT without FK constraint for simplicity
- used column is integer 0/1 with CHECK constraint (SQLite boolean pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All schemas ready for Phase 339 Build API endpoint implementation
- Error codes ready for Phase 340 Sign API error handling
- userop_builds table ready for build data persistence

---
*Phase: 338-foundation*
*Completed: 2026-03-06*
