---
phase: 279-db-core-resolution
plan: 01
subsystem: database
tags: [sqlite, drizzle, zod, migration, i18n, error-codes]

# Dependency graph
requires: []
provides:
  - "DB migration v27 removing is_default and default_network columns"
  - "getSingleNetwork function replacing getDefaultNetwork (EVM returns null)"
  - "WALLET_ID_REQUIRED and NETWORK_REQUIRED error codes"
  - "WalletSchema without defaultNetwork, CreateSessionRequestSchema without defaultWalletId"
affects: [279-02, 280-01, 280-02, 280-03, 281-01, 282-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getSingleNetwork returns null for multi-network environments (EVM)"
    - "ENVIRONMENT_SINGLE_NETWORK replaces ENVIRONMENT_DEFAULT_NETWORK"

key-files:
  modified:
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/daemon/src/infrastructure/database/schema.ts"
    - "packages/core/src/enums/chain.ts"
    - "packages/core/src/enums/index.ts"
    - "packages/core/src/index.ts"
    - "packages/core/src/schemas/wallet.schema.ts"
    - "packages/core/src/schemas/session.schema.ts"
    - "packages/core/src/errors/error-codes.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"
    - "packages/core/src/__tests__/environment.test.ts"
    - "packages/core/src/__tests__/schemas.test.ts"
    - "packages/core/src/__tests__/errors.test.ts"
    - "packages/core/src/__tests__/i18n.test.ts"
    - "packages/core/src/__tests__/package-exports.test.ts"

key-decisions:
  - "Migration v27 uses 12-step table recreation pattern for both session_wallets and wallets"
  - "getSingleNetwork returns null for EVM (not a default network, forces explicit selection)"
  - "WALLET_ID_REQUIRED in SESSION domain, NETWORK_REQUIRED in TX domain"
  - "CANNOT_REMOVE_DEFAULT_WALLET removed entirely (no backward compat shim)"

patterns-established:
  - "getSingleNetwork replaces getDefaultNetwork -- null means 'must specify explicitly'"

requirements-completed: [DB-01, DB-02, DB-03, DB-04, CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08]

# Metrics
duration: 8min
completed: 2026-02-27
---

# Phase 279 Plan 01: DB migration v27 + Core Enums/Schemas/Errors/i18n Summary

**DB migration v27 drops is_default and default_network columns; getSingleNetwork replaces getDefaultNetwork with EVM null return; WALLET_ID_REQUIRED/NETWORK_REQUIRED error codes added**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-27T09:53:39Z
- **Completed:** 2026-02-27T10:01:39Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Migration v27 safely removes is_default from session_wallets and default_network from wallets via 12-step table recreation with FK integrity verification
- getSingleNetwork returns NetworkType|null -- Solana returns network, EVM returns null (forcing explicit network specification)
- WALLET_ID_REQUIRED (SESSION, 400) and NETWORK_REQUIRED (TX, 400) error codes with en/ko i18n messages
- WalletSchema no longer has defaultNetwork, CreateSessionRequestSchema no longer has defaultWalletId
- LATEST_SCHEMA_VERSION updated to 27, DDL and Drizzle schema match

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration v27 + Drizzle schema + DDL update** - `e891964b` (feat)
2. **Task 2: Core enums + schemas + error codes + i18n changes** - `867d68aa` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - Migration v27 + DDL updates + LATEST_SCHEMA_VERSION=27
- `packages/daemon/src/infrastructure/database/schema.ts` - Removed defaultNetwork/isDefault Drizzle fields + check_default_network constraint
- `packages/core/src/enums/chain.ts` - getSingleNetwork + ENVIRONMENT_SINGLE_NETWORK (EVM entries null)
- `packages/core/src/enums/index.ts` - Re-export renames
- `packages/core/src/index.ts` - Re-export renames
- `packages/core/src/schemas/wallet.schema.ts` - Removed defaultNetwork from WalletSchema
- `packages/core/src/schemas/session.schema.ts` - Removed defaultWalletId from CreateSessionRequestSchema
- `packages/core/src/errors/error-codes.ts` - +WALLET_ID_REQUIRED, +NETWORK_REQUIRED, -CANNOT_REMOVE_DEFAULT_WALLET (105 total)
- `packages/core/src/i18n/en.ts` - Updated error messages (105 entries)
- `packages/core/src/i18n/ko.ts` - Updated error messages (105 entries)
- `packages/core/src/__tests__/environment.test.ts` - Updated for getSingleNetwork (EVM returns null)
- `packages/core/src/__tests__/schemas.test.ts` - Removed defaultNetwork/defaultWalletId assertions, added CreateSessionRequestSchema tests
- `packages/core/src/__tests__/errors.test.ts` - Updated counts (105 total, 29 TX domain)
- `packages/core/src/__tests__/i18n.test.ts` - Updated count (105 error codes)
- `packages/core/src/__tests__/package-exports.test.ts` - Updated count (105 error codes)

## Decisions Made
- Migration v27 uses managesOwnTransaction=true with 12-step table recreation (same pattern as v7/v8/v26)
- EVM entries in ENVIRONMENT_SINGLE_NETWORK are null (not a fallback default like ethereum-mainnet)
- CANNOT_REMOVE_DEFAULT_WALLET removed without deprecation (pre-release, clean removal per D5)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated error count tests across 3 additional test files**
- **Found during:** Task 2 (verification step)
- **Issue:** errors.test.ts, i18n.test.ts, package-exports.test.ts had hardcoded count of 104 error codes
- **Fix:** Updated to 105 in all three test files, also updated TX domain count from 28 to 29
- **Files modified:** packages/core/src/__tests__/errors.test.ts, packages/core/src/__tests__/i18n.test.ts, packages/core/src/__tests__/package-exports.test.ts
- **Verification:** All 572 core tests pass
- **Committed in:** 867d68aa (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Necessary to maintain test consistency after error code count change. No scope creep.

## Issues Encountered
- Daemon typecheck has downstream errors in wallets.ts, daemon.ts, notification-service.ts, pipeline.ts referencing removed defaultNetwork -- expected and will be fixed in Plan 279-02 and Phase 280

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core types and schemas are ready for Plan 279-02 (resolveWalletId + network-resolver)
- Downstream daemon code still references removed fields -- Phase 280 will fix those

## Self-Check: PASSED

- All 6 key files verified present on disk
- Both task commits (e891964b, 867d68aa) verified in git history
- @waiaas/core typecheck passes
- @waiaas/core 572 tests pass (26 test files)

---
*Phase: 279-db-core-resolution*
*Completed: 2026-02-27*
