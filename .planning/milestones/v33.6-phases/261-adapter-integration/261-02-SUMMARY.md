---
phase: 261-adapter-integration
plan: 02
subsystem: infra
tags: [rpc, pool, hot-reload, adapter, routing, cooldown, integration-test]

# Dependency graph
requires:
  - "261-01: AdapterPool with RpcPool dependency and configKeyToNetwork helper"
provides:
  - "Hot-reload RpcPool cooldown reset after adapter eviction on rpc.* settings change"
  - "12 integration tests covering full RPC resolution chain (pool -> adapter -> connect)"
affects: [261-03-incoming-tx-rpc-pool, 262-rpc-settings-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Hot-reload resets RpcPool cooldown after eviction to ensure fresh URL selection on next resolve"]

key-files:
  created:
    - packages/daemon/src/__tests__/adapter-pool-rpc-routing.test.ts
  modified:
    - packages/daemon/src/infrastructure/settings/hot-reload.ts

key-decisions:
  - "Route handlers, pipeline stages, and balance monitor unchanged -- existing resolveRpcUrl pattern is forward-compatible with RpcPool"
  - "Hot-reload adds RpcPool cooldown reset (not URL re-registration) -- config URL order preserved from startup seeding"
  - "configKeyToNetwork imported from adapter-pool.ts to avoid duplicating network mapping logic in hot-reload"

patterns-established:
  - "Hot-reload RPC pattern: evict adapter + reset pool cooldown for affected network"
  - "Integration test pattern for RPC routing: mock adapters, real RpcPool, verify connect() URL arg"

requirements-completed: [ADPT-02, ADPT-03]

# Metrics
duration: 4min
completed: 2026-02-25
---

# Phase 261 Plan 02: Adapter RPC Pool Routing Summary

**Hot-reload RpcPool cooldown reset on rpc.* settings change, with 12 integration tests covering Solana/EVM pool routing, fallback URLs, failure rotation, and cooldown reset**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T10:13:55Z
- **Completed:** 2026-02-25T10:17:58Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Hot-reload resets RpcPool cooldown for affected networks after adapter eviction, ensuring next resolve() picks up fresh URL
- 12 integration tests in 5 describe blocks verify full RPC resolution chain: pool priority, EVM/Solana routing, fallback, failure rotation, cooldown reset
- Route handlers, pipeline stages, and balance monitor validated as forward-compatible with RpcPool (no changes needed)
- All 20 existing hot-reload tests pass unchanged (backward compat verified)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update hot-reload RPC handler with RpcPool cooldown reset** - `5dbe3364` (feat)
2. **Task 2: Integration tests for RPC Pool routing** - `e33ef784` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - Added configKeyToNetwork import and RpcPool cooldown reset loop after adapter eviction in reloadRpc()
- `packages/daemon/src/__tests__/adapter-pool-rpc-routing.test.ts` - 12 tests: Solana pool routing (2), EVM pool routing (2), fallback behavior (3), failure rotation (2), cooldown reset (3)

## Decisions Made
- Route handlers, pipeline stages, and balance monitor keep their existing `resolveRpcUrl() -> adapterPool.resolve()` pattern unchanged. The pattern is already forward-compatible because AdapterPool.resolve() uses RpcPool as primary source and rpcUrl as fallback.
- Hot-reload adds only pool cooldown reset, not URL re-registration. The URL priority order established at daemon startup (config.toml first, built-in defaults second) is preserved.
- Uses `rpcPool.hasNetwork()` guard before `rpcPool.reset()` to skip networks not registered in the pool.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `let` -> `const` for non-reassigned variables in tests**
- **Found during:** Task 2 (lint verification)
- **Issue:** Two `let now = 1000` declarations flagged by ESLint prefer-const because they were not reassigned within their block scope
- **Fix:** Changed to `const now = 1000` in both test cases
- **Files modified:** packages/daemon/src/__tests__/adapter-pool-rpc-routing.test.ts
- **Verification:** `pnpm run lint` passes with 0 errors
- **Committed in:** e33ef784 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 lint fix)
**Impact on plan:** Trivial lint correction. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RpcPool integration complete for all daemon call sites
- Hot-reload properly resets cooldown state on RPC settings changes
- Ready for Plan 261-03: IncomingTxMonitor RpcPool integration

## Self-Check: PASSED

- [x] hot-reload.ts modified with RpcPool cooldown reset
- [x] adapter-pool-rpc-routing.test.ts created (12 tests)
- [x] SUMMARY.md exists
- [x] Commit 5dbe3364 exists
- [x] Commit e33ef784 exists

---
*Phase: 261-adapter-integration*
*Completed: 2026-02-25*
