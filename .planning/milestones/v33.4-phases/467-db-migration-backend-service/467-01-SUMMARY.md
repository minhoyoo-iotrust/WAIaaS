---
phase: 467-db-migration-backend-service
plan: 01
subsystem: database
tags: [sqlite, migration, partial-unique-index, triggers]

requires: []
provides:
  - "DB v61 migration with partial unique index on wallet_apps(wallet_type) WHERE signing_enabled=1"
  - "CHECK triggers enforcing signing_enabled IN (0,1)"
  - "Data dedup logic for existing signing_enabled duplicates"
affects: [467-02, 468, 469]

tech-stack:
  added: []
  patterns: ["Partial unique index for exclusive-1 constraint", "BEFORE INSERT/UPDATE triggers for CHECK enforcement"]

key-files:
  created:
    - packages/daemon/src/infrastructure/database/migrations/v61.ts
    - packages/daemon/src/__tests__/migration-v61.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/schema-ddl.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/migrate.ts

key-decisions:
  - "Used partial unique index instead of table rebuild for signing primary uniqueness"
  - "Used BEFORE INSERT/UPDATE triggers instead of CHECK constraint (SQLite limitation)"
  - "Dedup keeps earliest created_at row as signing primary"

requirements-completed: [MIG-01, MIG-02, MIG-03, TST-02]

duration: 5min
completed: 2026-04-02
---

# Phase 467 Plan 01: DB v61 Migration Summary

**Partial unique index + CHECK triggers enforce wallet_type-level signing primary uniqueness at DB level**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T09:09:43Z
- **Completed:** 2026-04-02T09:15:00Z
- **Tasks:** 2 (migration + tests, TDD)
- **Files modified:** 5

## Accomplishments

1. Created v61 migration with 3 steps: data dedup, partial unique index creation, CHECK trigger creation
2. Updated LATEST_SCHEMA_VERSION from 60 to 61
3. Added partial unique index DDL and trigger DDL to schema-ddl.ts for fresh databases
4. Wrote 7 test cases covering dedup, uniqueness enforcement, CHECK validation, idempotency, and cross-wallet_type independence

## Commits

| Hash | Message |
|------|---------|
| 6567dac3 | feat(467-01): add DB v61 migration with signing primary partial unique index |

## Verification

All 7 migration v61 tests pass. Existing migration v60 tests unaffected (9/9 pass).

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None.
