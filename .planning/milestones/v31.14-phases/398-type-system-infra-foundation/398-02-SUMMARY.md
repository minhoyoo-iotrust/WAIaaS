---
phase: 398-type-system-infra-foundation
plan: 02
subsystem: infra
tags: [sqlite, migration, evm, chain-map, keepAliveTimeout, long-poll]

# Dependency graph
requires: []
provides:
  - "DB v58 migration with CONTRACT_DEPLOY in transactions type CHECK"
  - "EVM_CHAIN_ID_TO_NETWORK reverse lookup map (12 chainIds)"
  - "getNetworkByChainId() utility function"
  - "keepAliveTimeout 600s for long-poll RPC proxy support"
affects: [399-core-rpc-proxy-engine, 400-route-assembly-async-approval]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "12-step table recreation for SQLite CHECK constraint updates"
    - "Reverse map derived from forward map to maintain single source of truth"

key-files:
  created:
    - packages/daemon/src/__tests__/migration-v58.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/adapters/evm/src/evm-chain-map.ts
    - packages/adapters/evm/src/index.ts
    - packages/adapters/evm/src/__tests__/evm-chain-map.test.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/__tests__/migration-v57.test.ts

key-decisions:
  - "EVM_CHAIN_ID_TO_NETWORK uses ReadonlyMap derived from EVM_CHAIN_MAP entries (SSoT preservation)"
  - "keepAliveTimeout set to 600s with headersTimeout 605s per Node.js best practice"
  - "v58 migration uses 12-step table recreation pattern with full index recreation (14 indexes)"

patterns-established:
  - "chainId reverse lookup pattern: derive reverse map from forward map at module load time"

requirements-completed: [DEPL-03, ASYNC-05, RPC-07]

# Metrics
duration: 45min
completed: 2026-03-13
---

# Phase 398 Plan 02: DB v58 Migration + Infrastructure Prerequisites Summary

**DB v58 migration for CONTRACT_DEPLOY CHECK constraint, EVM chainId reverse lookup map, and keepAliveTimeout 600s for long-poll**

## Performance

- **Duration:** 45 min
- **Started:** 2026-03-13T11:15:00Z
- **Completed:** 2026-03-13T12:00:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- DB v58 migration: 12-step table recreation adding CONTRACT_DEPLOY to transactions type CHECK
- EVM_CHAIN_ID_TO_NETWORK reverse lookup map with 12 chainId entries
- getNetworkByChainId() function for Phase 399 RPC route chainId resolution
- keepAliveTimeout 600s + headersTimeout 605s for long-poll connections
- 14 new tests (6 migration + 8 reverse lookup)

## Task Commits

Each task was committed atomically:

1. **Task 1: DB v58 migration + EVM_CHAIN_ID_TO_NETWORK** - `badf858e` (feat)
2. **Task 2: keepAliveTimeout 600s** - `d3b9547f` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - v58 migration + LATEST_SCHEMA_VERSION=58
- `packages/adapters/evm/src/evm-chain-map.ts` - EVM_CHAIN_ID_TO_NETWORK + getNetworkByChainId
- `packages/adapters/evm/src/index.ts` - Export new reverse lookup utilities
- `packages/adapters/evm/src/__tests__/evm-chain-map.test.ts` - 8 reverse lookup tests
- `packages/daemon/src/__tests__/migration-v58.test.ts` - 6 migration tests
- `packages/daemon/src/lifecycle/daemon.ts` - keepAliveTimeout 600s + headersTimeout 605s
- `packages/daemon/src/__tests__/migration-v57.test.ts` - Updated for LATEST_SCHEMA_VERSION=58

## Decisions Made
- EVM_CHAIN_ID_TO_NETWORK uses ReadonlyMap derived from EVM_CHAIN_MAP (SSoT preservation)
- keepAliveTimeout 600s inline rather than extracted constant (single use site)
- headersTimeout set to 605s (5s margin over keepAliveTimeout per Node.js docs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt @waiaas/core dist for daemon tests**
- **Found during:** Task 1 (migration test)
- **Issue:** Daemon tests use compiled dist output of @waiaas/core which was stale (8-type TRANSACTION_TYPES)
- **Fix:** Ran `pnpm -F @waiaas/core build` and `pnpm -F @waiaas/adapter-evm build` to rebuild dist
- **Files modified:** dist/ outputs (gitignored)
- **Verification:** Migration tests pass after rebuild
- **Committed in:** N/A (dist files are gitignored)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary rebuild step for cross-package dependency. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DB v58 ready for CONTRACT_DEPLOY transactions
- getNetworkByChainId available for RPC route chainId parsing
- keepAliveTimeout enables long-poll connections for Phase 400
- Phase 399 can begin building RpcTransactionAdapter and handlers

---
*Phase: 398-type-system-infra-foundation*
*Completed: 2026-03-13*
