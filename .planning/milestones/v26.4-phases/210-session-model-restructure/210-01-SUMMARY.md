---
phase: 210-session-model-restructure
plan: 01
subsystem: database
tags: [sqlite, drizzle, migration, session, junction-table, error-codes, zod]

# Dependency graph
requires:
  - phase: none
    provides: existing v18 schema with sessions.wallet_id
provides:
  - session_wallets junction table (Drizzle + DDL + migration)
  - sessions table without wallet_id column
  - v19 migration with data migration and FK reconnection
  - 4 new SESSION domain error codes
  - CreateSessionRequestSchema with walletIds/walletId dual support
affects: [210-02, 210-03, 211-01, 211-02, 211-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [junction-table-migration, 12-step-table-recreation-with-fk-reconnection]

key-files:
  created: []
  modified:
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/__tests__/schema-compatibility.test.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/schemas/session.schema.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts

key-decisions:
  - "v19 migration uses 12-step table recreation for sessions (wallet_id column removal) + transactions FK reconnection"
  - "NULL wallet_id sessions are safely skipped via WHERE clause in migration INSERT"
  - "session_wallets uses composite PK (session_id, wallet_id) instead of surrogate key"
  - "CreateSessionRequestSchema uses Zod refine() for mutual exclusion of walletId/walletIds"

patterns-established:
  - "Junction table migration: create junction -> migrate data -> 12-step recreate source table -> reconnect dependent FKs"

requirements-completed: [SESS-07, SESS-08, SESS-09]

# Metrics
duration: 6min
completed: 2026-02-21
---

# Phase 210 Plan 01: DB Infrastructure Summary

**DB v19 migration creating session_wallets junction table with 12-step sessions recreation, 4 new SESSION error codes, and CreateSessionRequestSchema walletIds extension**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-20T16:15:04Z
- **Completed:** 2026-02-20T16:21:07Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- DB v19 migration: session_wallets junction table creation + sessions.wallet_id data migration (is_default=1) + sessions wallet_id column removal via 12-step recreation + transactions FK reconnection
- 4 new SESSION domain error codes: WALLET_ACCESS_DENIED, WALLET_ALREADY_LINKED, CANNOT_REMOVE_DEFAULT_WALLET, SESSION_REQUIRES_WALLET (with en/ko i18n)
- CreateSessionRequestSchema extended with walletIds (plural array) + defaultWalletId + refine validation for backward compatibility
- 7 new migration tests covering data migration, default invariant, NULL wallet_id skip, column removal, fresh DB verification

## Task Commits

Each task was committed atomically:

1. **Task 1: 4 new error codes + CreateSessionRequestSchema extension** - `a678870` (feat)
2. **Task 2: DB v19 migration + Drizzle schema sync + tests** - `cffc76a` (feat)

## Files Created/Modified
- `packages/core/src/errors/error-codes.ts` - 4 new SESSION domain error codes (104 total)
- `packages/core/src/schemas/session.schema.ts` - walletIds, defaultWalletId fields + refine validation
- `packages/core/src/i18n/en.ts` - English translations for 4 new error codes
- `packages/core/src/i18n/ko.ts` - Korean translations for 4 new error codes
- `packages/daemon/src/infrastructure/database/schema.ts` - sessionWallets Drizzle table, sessions.walletId removed
- `packages/daemon/src/infrastructure/database/migrate.ts` - v19 migration (session_wallets + data + 12-step), LATEST_SCHEMA_VERSION=19
- `packages/daemon/src/infrastructure/database/index.ts` - Export sessionWallets
- `packages/daemon/src/__tests__/schema-compatibility.test.ts` - 7 new v19 migration tests

## Decisions Made
- v19 migration uses 12-step table recreation for sessions (wallet_id column removal) and reconnects transactions FK references
- session_wallets uses composite primary key (session_id, wallet_id) -- no surrogate ID needed
- NULL wallet_id sessions are safely skipped via WHERE clause in migration INSERT
- CreateSessionRequestSchema uses Zod refine() for mutual exclusion of walletId/walletIds

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added i18n translations for new error codes**
- **Found during:** Task 1 (error codes)
- **Issue:** Plan did not mention updating en.ts and ko.ts i18n files, but Messages type requires all ErrorCode keys
- **Fix:** Added 4 error code translations to both en.ts and ko.ts
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** @waiaas/core typecheck passes
- **Committed in:** a678870 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for type safety -- Messages Record<ErrorCode, string> requires all keys.

## Issues Encountered
- NULL wallet_id test required custom DB setup with nullable wallet_id column to bypass NOT NULL constraint in test fixtures. Production migration SQL handles this via WHERE wallet_id IS NOT NULL.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- session_wallets junction table and Drizzle schema ready for Plan 02 (service layer changes)
- sessions.walletId removal will cause daemon typecheck errors -- expected, Plan 02 addresses these
- 4 error codes ready for use in SessionWalletService (Plan 02/03)

---
*Phase: 210-session-model-restructure*
*Completed: 2026-02-21*
