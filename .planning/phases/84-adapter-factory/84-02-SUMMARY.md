---
phase: 84-adapter-factory
plan: 02
subsystem: infra
tags: [adapter-pool, daemon-lifecycle, multi-chain, route-handler, evm, solana]

# Dependency graph
requires:
  - phase: 84-adapter-factory
    plan: 01
    provides: "AdapterPool class with resolve() and disconnectAll()"
  - phase: 82-evm-adapter-scaffold
    provides: "EvmAdapter + EVM_CHAIN_MAP + config loader EVM keys"
provides:
  - "Daemon uses AdapterPool instead of single SolanaAdapter"
  - "All routes resolve adapter per-agent from pool using chain:network"
  - "resolveRpcUrl shared utility for config.rpc key mapping"
affects:
  - 84-03 (any remaining adapter factory plans)
  - 85+ (EVM transactions now fully supported at daemon level)

# Tech tracking
tech-stack:
  added:
    - "@waiaas/adapter-evm (workspace dependency in daemon)"
  patterns:
    - "Per-agent adapter resolution: route -> resolveRpcUrl -> pool.resolve(chain, network, rpcUrl)"
    - "Pool-based lifecycle: lazy init at startup, disconnectAll at shutdown"
    - "resolveRpcUrl shared utility: chain+network -> config.rpc key mapping"

key-files:
  created: []
  modified:
    - packages/daemon/package.json
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/infrastructure/adapter-pool.ts
    - packages/daemon/src/__tests__/adapter-pool.test.ts
    - packages/daemon/src/__tests__/api-agents.test.ts
    - packages/daemon/src/__tests__/api-transactions.test.ts
    - packages/daemon/src/__tests__/api-new-endpoints.test.ts
    - packages/daemon/src/__tests__/api-admin-endpoints.test.ts
    - packages/daemon/src/__tests__/api-hint-field.test.ts
    - packages/daemon/src/__tests__/session-lifecycle-e2e.test.ts
    - packages/daemon/src/__tests__/workflow-owner-e2e.test.ts
    - packages/adapters/evm/src/__tests__/evm-chain-map.test.ts

key-decisions:
  - "resolveRpcUrl extracted as shared utility in adapter-pool.ts (avoids duplication across daemon.ts, wallet.ts, transactions.ts)"
  - "TransactionRouteDeps.config changed from partial {delay_seconds, approval_timeout} to full DaemonConfig (route extracts what it needs)"
  - "PipelineContext.adapter unchanged (IChainAdapter) -- routes resolve before pipeline entry"
  - "mockAdapterPool pattern established for all test files (resolve returns mock adapter)"

patterns-established:
  - "Per-request adapter resolution: each route handler resolves from AdapterPool before use"
  - "mockAdapterPool test helper: wraps mockAdapter in pool mock with resolve/disconnectAll"

# Metrics
duration: 10min
completed: 2026-02-12
---

# Phase 84 Plan 02: Daemon AdapterPool Integration Summary

**Wire AdapterPool into daemon lifecycle, server, route handlers, and all test files for multi-chain Solana+EVM support**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-12T09:28:41Z
- **Completed:** 2026-02-12T09:38:27Z
- **Tasks:** 2
- **Files modified:** 15
- **Tests:** 620 passed (39 files), zero regressions

## Accomplishments

- Daemon startup Step 4 creates AdapterPool (lazy init) instead of connecting single SolanaAdapter
- All wallet routes (balance, assets) resolve adapter per-agent using chain:network from DB
- All transaction routes resolve adapter per-agent before building PipelineContext
- Daemon shutdown calls adapterPool.disconnectAll() for clean multi-adapter teardown
- executeFromStage5 (delay-expired worker) resolves adapter from pool for background tx execution
- server.ts CreateAppDeps uses adapterPool instead of single adapter
- resolveRpcUrl shared utility maps chain+network to config.rpc key (solana_devnet, evm_ethereum_sepolia, etc.)
- All 7 test files updated with mockAdapterPool helper pattern
- @waiaas/adapter-evm added as workspace dependency to daemon

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire AdapterPool into daemon, server, routes** - `cd263ea` (feat)
2. **Task 2: Update all tests to use adapterPool** - `843dcbc` (test)

## Files Created/Modified

### Modified (source)
- `packages/daemon/package.json` - Added @waiaas/adapter-evm workspace dependency
- `packages/daemon/src/lifecycle/daemon.ts` - AdapterPool init/shutdown/executeFromStage5
- `packages/daemon/src/api/server.ts` - CreateAppDeps.adapterPool, route registration
- `packages/daemon/src/api/routes/wallet.ts` - Per-agent adapter resolution from pool
- `packages/daemon/src/api/routes/transactions.ts` - Per-agent adapter resolution, full DaemonConfig
- `packages/daemon/src/infrastructure/adapter-pool.ts` - Added resolveRpcUrl shared utility

### Modified (tests)
- `packages/daemon/src/__tests__/adapter-pool.test.ts` - Fixed type cast assertions
- `packages/daemon/src/__tests__/api-agents.test.ts` - mockAdapterPool helper
- `packages/daemon/src/__tests__/api-transactions.test.ts` - mockAdapterPool helper
- `packages/daemon/src/__tests__/api-new-endpoints.test.ts` - mockAdapterPool helper
- `packages/daemon/src/__tests__/api-admin-endpoints.test.ts` - mockAdapterPool helper
- `packages/daemon/src/__tests__/api-hint-field.test.ts` - mockAdapterPool helper
- `packages/daemon/src/__tests__/session-lifecycle-e2e.test.ts` - createMockAdapterPool helper
- `packages/daemon/src/__tests__/workflow-owner-e2e.test.ts` - createMockAdapterPool helper

### Modified (other)
- `packages/adapters/evm/src/__tests__/evm-chain-map.test.ts` - Removed unused import (blocking build)

## Decisions Made

1. **resolveRpcUrl as shared utility** - Extracted to adapter-pool.ts instead of duplicating in daemon.ts, wallet.ts, and transactions.ts. Takes `Record<string, string>` for config.rpc section.
2. **TransactionRouteDeps gets full DaemonConfig** - Changed from partial `{delay_seconds, approval_timeout}` config to full `DaemonConfig`. Route extracts `config.security.*` and `config.rpc` as needed.
3. **PipelineContext.adapter stays IChainAdapter** - No changes to pipeline stages. Routes resolve the correct adapter and pass it into PipelineContext. Stages remain chain-agnostic.
4. **mockAdapterPool pattern** - All test files use `{ resolve: vi.fn().mockResolvedValue(mockAdapter()), disconnectAll: vi.fn() }` pattern, cast as AdapterPool.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed unused import in evm-chain-map.test.ts**
- **Found during:** Task 1
- **Issue:** `EvmChainEntry` type import was unused, causing `tsc` build failure for @waiaas/adapter-evm package. Daemon depends on built dist from adapter-evm.
- **Fix:** Removed unused import
- **Files modified:** `packages/adapters/evm/src/__tests__/evm-chain-map.test.ts`
- **Commit:** `cd263ea` (included in Task 1)

**2. [Rule 3 - Blocking] Fixed adapter-pool.test.ts type cast errors**
- **Found during:** Task 2
- **Issue:** `adapter as MockEvmAdapter` type assertions failed because `IChainAdapter` doesn't have `viemChain`, `nativeSymbol`, etc. properties. Pre-existing from 84-01.
- **Fix:** Changed to `adapter as unknown as MockEvmAdapter` double-cast pattern
- **Files modified:** `packages/daemon/src/__tests__/adapter-pool.test.ts`
- **Commit:** `843dcbc` (included in Task 2)

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Daemon now supports multi-chain adapter resolution for both Solana and EVM agents
- Any EVM agent created via POST /v1/agents with chain=ethereum will get a properly resolved EvmAdapter when making wallet or transaction requests
- Phase 84-03 (if exists) or Phase 85+ can build upon this infrastructure
- No blockers

## Self-Check: PASSED

---
*Phase: 84-adapter-factory*
*Completed: 2026-02-12*
