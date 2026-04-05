---
phase: 261-adapter-integration
plan: 01
subsystem: infra
tags: [rpc, pool, adapter, config, fallback, backward-compat]

# Dependency graph
requires:
  - "260-01: RpcPool class with register/getUrl/reportFailure/reportSuccess"
  - "260-02: BUILT_IN_RPC_DEFAULTS constant + createWithDefaults factory"
provides:
  - "AdapterPool with optional RpcPool dependency for URL resolution"
  - "configKeyToNetwork helper for config key to network name mapping"
  - "Daemon startup RpcPool seeding (config.toml first, built-in defaults second)"
  - "reportRpcFailure/reportRpcSuccess delegation from AdapterPool"
  - "rpcPoolInstance getter on DaemonLifecycle"
affects: [261-02-hot-reload-rpc-settings, 261-03-incoming-tx-rpc-pool, 262-rpc-settings-admin-ui, 264-monitoring-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["RpcPool seeded at daemon startup: config.toml URLs first (highest priority), then built-in defaults"]

key-files:
  created:
    - packages/daemon/src/__tests__/adapter-pool-rpc-pool.test.ts
  modified:
    - packages/daemon/src/infrastructure/adapter-pool.ts
    - packages/daemon/src/lifecycle/daemon.ts

key-decisions:
  - "configKeyToNetwork strips solana_/evm_ prefix and converts _ to - for EVM networks"
  - "RpcPool seeded as empty -> config.toml URLs first -> built-in defaults second (register deduplicates)"
  - "resolve() rpcUrl parameter made optional with '' default for RpcPool-first resolution"
  - "SolanaAdapter.withRpcRetry and viem fallback transport are complementary to RpcPool, not replaced"
  - "solana_ws_* config keys skipped by configKeyToNetwork (WebSocket, not RPC endpoint)"

patterns-established:
  - "Config-first seeding pattern: config.toml -> built-in defaults in RpcPool registration order"
  - "AdapterPool.pool getter for inspection by other services"

requirements-completed: [ADPT-01, CONF-01, CONF-04]

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 261 Plan 01: Adapter RpcPool Integration Summary

**AdapterPool wired to RpcPool with config.toml highest-priority seeding, configKeyToNetwork reverse mapping, and backward-compatible optional rpcUrl -- 27 integration tests covering pool resolution, fallback, config priority, and failure reporting**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T10:06:42Z
- **Completed:** 2026-02-25T10:11:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- AdapterPool accepts optional RpcPool and uses it as primary URL resolution with fallback to provided rpcUrl
- configKeyToNetwork helper maps config.toml rpc keys to BUILT_IN_RPC_DEFAULTS network names (12 mappings + 3 skip cases)
- Daemon Step 4 creates RpcPool, seeds config.toml URLs first (highest priority), then registers built-in defaults
- reportRpcFailure/reportRpcSuccess on AdapterPool delegate to pool for cooldown tracking
- rpcPoolInstance getter on DaemonLifecycle for IncomingTxMonitor access (Phase 261-03)
- All 11 existing adapter-pool tests and 18 rpc-config-key tests pass unchanged (backward compat)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire RpcPool into AdapterPool + daemon startup seeding** - `c0942cc6` (feat)
2. **Task 2: Integration tests** - `bfe46f1c` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/adapter-pool.ts` - Added RpcPool import, configKeyToNetwork helper, optional constructor param, resolve() pool-first URL resolution, reportRpcFailure/reportRpcSuccess, pool getter
- `packages/daemon/src/lifecycle/daemon.ts` - Added RpcPool/BUILT_IN_RPC_DEFAULTS imports, rpcPool field, Step 4 seeding logic (config.toml first + built-in defaults), rpcPoolInstance getter
- `packages/daemon/src/__tests__/adapter-pool-rpc-pool.test.ts` - 27 tests in 6 describe blocks covering pool resolution, backward compat, fallback, configKeyToNetwork mapping, config priority seeding, failure/success reporting

## Decisions Made
- configKeyToNetwork strips solana_/evm_ prefix and converts _ to - for EVM networks; skips evm_default_network and solana_ws_* keys
- RpcPool created empty, then config.toml URLs registered first (highest priority), then built-in defaults registered second (register deduplicates, appending unique URLs)
- resolve() rpcUrl parameter made optional with '' default -- enables RpcPool-first resolution while preserving all existing callers
- SolanaAdapter.withRpcRetry (3 retries, same endpoint) and RpcPool cooldown (60s+, different endpoint) are complementary layers
- viem fallback transport not used -- RpcPool provides unified pool state across both SolanaAdapter and EvmAdapter

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused import of configKeyToNetwork in daemon.ts top-level**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** `configKeyToNetwork` imported at top level was unused because Step 4 uses the dynamic import alias `configKeyToNet`
- **Fix:** Removed top-level import, kept the dynamic import inside Step 4 IIFE
- **Files modified:** packages/daemon/src/lifecycle/daemon.ts
- **Verification:** `pnpm turbo run typecheck --filter=@waiaas/daemon` passes clean
- **Committed in:** c0942cc6 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor TypeScript unused import fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AdapterPool with RpcPool integration complete, ready for hot-reload wiring (Plan 261-02)
- rpcPoolInstance getter available on DaemonLifecycle for IncomingTxMonitor integration (Plan 261-03)
- configKeyToNetwork exported for use by hot-reload orchestrator and settings UI

## Self-Check: PASSED

- [x] adapter-pool.ts modified with RpcPool integration
- [x] daemon.ts modified with RpcPool seeding
- [x] adapter-pool-rpc-pool.test.ts created
- [x] SUMMARY.md exists
- [x] Commit c0942cc6 exists
- [x] Commit bfe46f1c exists

---
*Phase: 261-adapter-integration*
*Completed: 2026-02-25*
