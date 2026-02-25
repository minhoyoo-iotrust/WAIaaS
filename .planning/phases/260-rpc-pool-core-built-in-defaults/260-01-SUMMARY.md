---
phase: 260-rpc-pool-core-built-in-defaults
plan: 01
subsystem: infra
tags: [rpc, pool, fallback, cooldown, exponential-backoff]

# Dependency graph
requires: []
provides:
  - "RpcPool class with priority-based URL rotation and cooldown"
  - "AllRpcFailedError for all-endpoints-down detection"
  - "Barrel export from @waiaas/core via rpc/index.ts"
affects: [261-adapter-rpc-pool-integration, 262-rpc-settings-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["RpcPool injectable nowFn for deterministic time-based testing"]

key-files:
  created:
    - packages/core/src/rpc/rpc-pool.ts
    - packages/core/src/rpc/index.ts
    - packages/core/src/__tests__/rpc-pool.test.ts
  modified:
    - packages/core/src/index.ts

key-decisions:
  - "AllRpcFailedError extends Error, not ChainError -- infrastructure-level, not chain-specific"
  - "Injectable nowFn for deterministic cooldown testing instead of mocking Date.now"
  - "Dedup on register, not on getUrl -- avoid repeated computation"

patterns-established:
  - "RpcPool cooldown pattern: base * 2^(failures-1), capped at max"
  - "RpcPool nowFn injection for time-dependent testing"

requirements-completed: [POOL-01, POOL-02, POOL-03, POOL-04, POOL-05]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 260 Plan 01: RpcPool Core Summary

**RpcPool class with priority-based RPC URL rotation, exponential cooldown (60s base, 300s max), and AllRpcFailedError -- 24 unit tests covering all fallback scenarios**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-25T09:44:56Z
- **Completed:** 2026-02-25T09:47:53Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 4

## Accomplishments
- RpcPool class: register/getUrl/reportFailure/reportSuccess/reset with Map<string, RpcEndpointState[]>
- Priority-based fallback: highest-priority non-cooldown URL returned by getUrl()
- Exponential cooldown: 60s -> 120s -> 240s -> 300s (capped), auto-recovery after expiry
- AllRpcFailedError thrown when all endpoints in cooldown, with network and urls properties
- Inspection API: getStatus(), getNetworks(), hasNetwork()
- Barrel export chain: rpc-pool.ts -> rpc/index.ts -> core/index.ts

## Task Commits

Each task was committed atomically (TDD flow):

1. **RED: Failing tests** - `9bcc7e28` (test)
2. **GREEN: Implementation** - `bdfcde26` (feat)

_No refactor commit needed -- implementation is minimal and clean._

## Files Created/Modified
- `packages/core/src/rpc/rpc-pool.ts` - RpcPool class, AllRpcFailedError, RpcPoolOptions, RpcEndpointStatus types
- `packages/core/src/rpc/index.ts` - Barrel export for rpc module
- `packages/core/src/__tests__/rpc-pool.test.ts` - 24 unit tests covering all behavior cases
- `packages/core/src/index.ts` - Added rpc module re-export

## Decisions Made
- AllRpcFailedError extends Error (not ChainError) -- this is infrastructure-level error, not chain-specific
- Injectable `nowFn` for deterministic time-based testing (avoiding Date.now mocking)
- Deduplication happens at register() time, not at getUrl() time -- better performance
- Network key is `string` (not `NetworkType`) for flexibility -- adapters can use any identifier

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict-mode errors in test file**
- **Found during:** GREEN phase (TypeScript typecheck)
- **Issue:** Unused `RpcPoolOptions` import and `Object possibly undefined` on array index access
- **Fix:** Removed unused import, added `!` non-null assertions on known-length array access
- **Files modified:** packages/core/src/__tests__/rpc-pool.test.ts
- **Verification:** `pnpm turbo run typecheck --filter=@waiaas/core` passes clean
- **Committed in:** bdfcde26 (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor TypeScript strictness fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RpcPool exported from @waiaas/core, ready for adapter integration (Phase 261)
- AllRpcFailedError available for Stage 5 error conversion
- Built-in defaults (Plan 260-02) can extend register/registerAll for default URL lists

## Self-Check: PASSED

- [x] rpc-pool.ts exists
- [x] rpc/index.ts exists
- [x] rpc-pool.test.ts exists
- [x] SUMMARY.md exists
- [x] Commit 9bcc7e28 exists
- [x] Commit bdfcde26 exists

---
*Phase: 260-rpc-pool-core-built-in-defaults*
*Completed: 2026-02-25*
