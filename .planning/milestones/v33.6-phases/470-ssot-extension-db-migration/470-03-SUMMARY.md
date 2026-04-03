---
phase: 470-ssot-extension-db-migration
plan: 03
subsystem: database
tags: [sqlite, migration, v62, ripple, xrpl, check-constraint, adapter-pool]

requires:
  - phase: 470-01
    provides: "CHAIN_TYPES with ripple, NETWORK_TYPES with XRPL networks"
provides:
  - "DB v62: chain CHECK allows 'ripple' in wallets/incoming_transactions/defi_positions/nft_metadata_cache"
  - "DB v62: network CHECK allows xrpl-mainnet/testnet/devnet in transactions/policies/defi_positions/nft_metadata_cache"
  - "AdapterPool ripple chain stub (throws until Phase 471)"
  - "rpcConfigKey/configKeyToNetwork xrpl_ mapping"
affects: [471-adapter-package, 472-trust-line-token]

tech-stack:
  added: []
  patterns:
    - "12-step table recreation for CHECK constraint updates (6 tables)"
    - "AdapterPool stub pattern for upcoming chain adapters"

key-files:
  created:
    - packages/daemon/src/infrastructure/database/migrations/v62.ts
    - packages/daemon/src/__tests__/migration-v62.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema-ddl.ts
    - packages/daemon/src/infrastructure/adapter-pool.ts

key-decisions:
  - "6 tables recreated (not 4 as plan suggested): added policies and nft_metadata_cache for network CHECK"
  - "AdapterPool stub throws descriptive error pointing to Phase 471"
  - "XRPL config keys use xrpl_ prefix (xrpl_mainnet, xrpl_testnet, xrpl_devnet)"

patterns-established:
  - "v62 migration: 12-step table recreation for 6 tables in single transaction"
  - "AdapterPool chain stub: throw Error with phase reference for unimplemented adapters"

requirements-completed: [INFRA-07]

duration: 6min
completed: 2026-04-03
---

# Phase 470 Plan 03: DB v62 Migration + AdapterPool Ripple Stub Summary

**DB v62 12-step table recreation for 6 tables adding ripple chain CHECK and XRPL network CHECK constraints, plus AdapterPool ripple stub with RPC config key mapping**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-03T03:08:00Z
- **Completed:** 2026-04-03T03:14:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- DB v62 migration: 6 tables recreated with updated CHECK constraints (wallets, transactions, policies, incoming_transactions, defi_positions, nft_metadata_cache)
- chain='ripple' INSERTs succeed in all 4 chain-CHECK tables
- network='xrpl-mainnet/testnet/devnet' INSERTs succeed in all 4 network-CHECK tables
- Existing solana/ethereum data preserved through migration
- AdapterPool ripple stub with clear error message
- rpcConfigKey and configKeyToNetwork handle xrpl_ prefix

## Task Commits

1. **Task 1: DB v62 migration (chain + network CHECK)** - `89633857` (feat)
2. **Task 2: AdapterPool ripple chain stub** - `ccd91f4e` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrations/v62.ts` - 12-step recreation for 6 tables
- `packages/daemon/src/__tests__/migration-v62.test.ts` - 11 tests covering INSERT, data preservation, idempotency
- `packages/daemon/src/infrastructure/database/migrate.ts` - Import and register v62 migrations
- `packages/daemon/src/infrastructure/database/schema-ddl.ts` - LATEST_SCHEMA_VERSION = 62
- `packages/daemon/src/infrastructure/adapter-pool.ts` - ripple branch in resolve/rpcConfigKey/configKeyToNetwork

## Decisions Made
- Expanded scope from 4 tables to 6: policies and nft_metadata_cache also have network CHECK constraints
- Single transaction for all 6 table recreations (atomic rollback on failure)
- FK integrity check after migration via PRAGMA foreign_key_check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added policies and nft_metadata_cache to table recreation**
- **Found during:** Task 1 (analyzing schema-ddl.ts CHECK constraints)
- **Issue:** Plan listed 4 tables but policies and nft_metadata_cache also have network CHECK constraints that would reject XRPL networks
- **Fix:** Added 12-step recreation for policies (network CHECK) and nft_metadata_cache (chain + network CHECK)
- **Files modified:** packages/daemon/src/infrastructure/database/migrations/v62.ts
- **Committed in:** 89633857

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for correctness -- without this fix, XRPL policies and NFT cache entries would be rejected by CHECK constraints.

## Issues Encountered
None

## User Setup Required
None - migration runs automatically on daemon startup.

## Known Stubs

| File | Location | Reason |
|------|----------|--------|
| packages/daemon/src/infrastructure/adapter-pool.ts | resolve() ripple branch | Intentional stub -- Phase 471 will implement @waiaas/adapter-ripple |

## Next Phase Readiness
- DB schema fully ready for ripple wallets and XRPL network data
- AdapterPool stub provides clear error for ripple chain until adapter is implemented
- Ready for Phase 471: @waiaas/adapter-ripple package and native XRP transfer

---
*Phase: 470-ssot-extension-db-migration*
*Completed: 2026-04-03*
