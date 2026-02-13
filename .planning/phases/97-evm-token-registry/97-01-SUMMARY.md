---
phase: 97-evm-token-registry
plan: 01
subsystem: database, infra
tags: [erc-20, token-registry, drizzle, sqlite, migration, evm]

# Dependency graph
requires:
  - phase: 85-evm-db-schema
    provides: migration runner, LATEST_SCHEMA_VERSION pattern
  - phase: 89-entity-rename
    provides: wallets table (v3 migration), 9-table schema
provides:
  - Built-in ERC-20 token data for 5 EVM mainnet networks (24 tokens total)
  - tokenRegistry Drizzle table with network+address unique index
  - Migration v4 for token_registry table creation
  - TokenRegistryService class (getTokensForNetwork, addCustomToken, removeCustomToken, getAdapterTokenList)
  - Barrel export from token-registry/index.ts
affects: [97-02 API layer, adapter-pool token loading, EVM getAssets]

# Tech tracking
tech-stack:
  added: []
  patterns: [builtin-plus-custom merge pattern, custom-overrides-builtin by address]

key-files:
  created:
    - packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts
    - packages/daemon/src/infrastructure/token-registry/token-registry-service.ts
    - packages/daemon/src/infrastructure/token-registry/index.ts
  modified:
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/__tests__/database.test.ts
    - packages/daemon/src/__tests__/migration-runner.test.ts

key-decisions:
  - "Custom tokens override built-in for same address via case-insensitive merge"
  - "Testnet networks get empty built-in arrays (users add via custom token API)"
  - "TokenRegistryService returns tokens sorted alphabetically by symbol"

patterns-established:
  - "Builtin-plus-custom merge: static data + DB overlay, custom overrides builtin for same key"

# Metrics
duration: 5min
completed: 2026-02-13
---

# Phase 97 Plan 01: Token Registry Infrastructure Summary

**Built-in ERC-20 token data for 5 EVM mainnets (24 tokens), tokenRegistry DB table with migration v4, and TokenRegistryService merge layer**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T12:30:30Z
- **Completed:** 2026-02-13T12:35:13Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created built-in token data with 24 ERC-20 tokens across 5 EVM mainnet networks (USDC, USDT, WETH, DAI + chain-native)
- Added tokenRegistry Drizzle table with network+address unique index and source CHECK constraint
- Added migration v4 for existing database upgrades, LATEST_SCHEMA_VERSION=4
- Implemented TokenRegistryService with merge logic (custom overrides builtin) and adapter integration method

## Task Commits

Each task was committed atomically:

1. **Task 1: Built-in token data + DB schema + migration v4** - `e4da5c3` (feat)
2. **Task 2: TokenRegistryService class + barrel export** - `8da82ba` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/token-registry/builtin-tokens.ts` - Static ERC-20 token data for 5 EVM mainnets, TokenEntry interface, getBuiltinTokens() helper
- `packages/daemon/src/infrastructure/token-registry/token-registry-service.ts` - TokenRegistryService class with merge, add, remove, adapter list methods
- `packages/daemon/src/infrastructure/token-registry/index.ts` - Barrel export for token-registry module
- `packages/daemon/src/infrastructure/database/schema.ts` - Added tokenRegistry Drizzle table definition (table count 8->9)
- `packages/daemon/src/infrastructure/database/migrate.ts` - Added migration v4, updated DDL, LATEST_SCHEMA_VERSION=4
- `packages/daemon/src/infrastructure/database/index.ts` - Added tokenRegistry to barrel export
- `packages/daemon/src/__tests__/database.test.ts` - Updated table count assertion (9->10 including schema_version)
- `packages/daemon/src/__tests__/migration-runner.test.ts` - Updated max version assertions (3->4)

## Decisions Made
- Custom tokens override built-in for same address via case-insensitive merge (Map keyed by lowercase address)
- Testnet networks have empty built-in arrays; users add tokens via custom token API
- TokenRegistryService returns merged tokens sorted alphabetically by symbol
- getAdapterTokenList() provides EvmAdapter.setAllowedTokens() compatible format

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing test assertions for new schema version**
- **Found during:** Task 1 (migration v4 addition)
- **Issue:** 3 tests in migration-runner.test.ts hardcoded `toBe(3)` for max schema version; 1 test in database.test.ts hardcoded 9 tables
- **Fix:** Updated assertions to `toBe(4)` and 10 tables, added v4 to skip-versions test
- **Files modified:** packages/daemon/src/__tests__/migration-runner.test.ts, packages/daemon/src/__tests__/database.test.ts
- **Verification:** All 58 tests pass
- **Committed in:** e4da5c3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix for test assertions)
**Impact on plan:** Necessary update for new migration version. No scope creep.

## Issues Encountered
- Pre-existing TS error in stages.ts (unrelated to this plan) -- confirmed exists on branch before changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Token registry infrastructure complete, ready for API layer in plan 97-02
- TokenRegistryService can be instantiated with daemon DB connection
- getAdapterTokenList() ready for EvmAdapter.setAllowedTokens() wiring

---
*Phase: 97-evm-token-registry*
*Completed: 2026-02-13*
