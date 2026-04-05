---
phase: 260-rpc-pool-core-built-in-defaults
plan: 02
subsystem: infra
tags: [rpc, pool, defaults, public-endpoints, factory]

# Dependency graph
requires:
  - "260-01: RpcPool class with register/getUrl/reportFailure"
provides:
  - "BUILT_IN_RPC_DEFAULTS constant with 13 networks (6 mainnet + 7 testnet)"
  - "RpcPool.createWithDefaults() static factory for zero-config initialization"
affects: [261-adapter-rpc-pool-integration, 262-rpc-settings-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["BUILT_IN_RPC_DEFAULTS as Readonly<Record<string, readonly string[]>> for immutability"]

key-files:
  created:
    - packages/core/src/rpc/built-in-defaults.ts
    - packages/core/src/__tests__/rpc-pool-defaults.test.ts
  modified:
    - packages/core/src/rpc/rpc-pool.ts
    - packages/core/src/rpc/index.ts

key-decisions:
  - "BUILT_IN_RPC_DEFAULTS typed as Readonly<Record<string, readonly string[]>> -- double immutability prevents runtime mutation"
  - "createWithDefaults spreads readonly arrays into mutable copies for register() compatibility"

patterns-established:
  - "Built-in defaults pattern: constant data + factory method, not constructor default"

requirements-completed: [DFLT-01, DFLT-02, DFLT-03]

# Metrics
duration: 2min
completed: 2026-02-25
---

# Phase 260 Plan 02: Built-in RPC Defaults Summary

**BUILT_IN_RPC_DEFAULTS with 13 public RPC endpoints (6 mainnet + 7 testnet) and RpcPool.createWithDefaults() zero-config factory -- 18 tests covering data integrity and factory behavior**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-25T09:50:11Z
- **Completed:** 2026-02-25T09:52:08Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- BUILT_IN_RPC_DEFAULTS constant: 13 networks with public https:// RPC URLs (Solana, Ethereum, Arbitrum, Optimism, Base, Polygon -- mainnet + testnet)
- RpcPool.createWithDefaults() static factory: creates pool pre-loaded with all 13 networks, accepts optional RpcPoolOptions
- 18 tests: data integrity (7), createWithDefaults integration (6), custom options (2), merge with custom registrations (3)
- Barrel export chain: built-in-defaults.ts -> rpc/index.ts -> core/index.ts

## Task Commits

Each task was committed atomically:

1. **Task 1: Built-in RPC defaults data + createWithDefaults factory** - `97926b65` (feat)
2. **Task 2: Built-in defaults tests** - `38c96ae3` (test)

## Files Created/Modified
- `packages/core/src/rpc/built-in-defaults.ts` - BUILT_IN_RPC_DEFAULTS constant with 13 networks' public RPC URLs
- `packages/core/src/rpc/rpc-pool.ts` - Added createWithDefaults() static factory + BUILT_IN_RPC_DEFAULTS import
- `packages/core/src/rpc/index.ts` - Added BUILT_IN_RPC_DEFAULTS barrel export
- `packages/core/src/__tests__/rpc-pool-defaults.test.ts` - 18 tests for data integrity and factory behavior

## Decisions Made
- BUILT_IN_RPC_DEFAULTS typed as `Readonly<Record<string, readonly string[]>>` for double immutability (prevents accidental mutation of both the record and individual URL arrays)
- `createWithDefaults()` spreads readonly arrays via `[...urls]` to create mutable copies for `register()` compatibility
- Factory is static method (not constructor parameter) to keep `new RpcPool()` clean for manual-only configurations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- BUILT_IN_RPC_DEFAULTS and createWithDefaults() exported from @waiaas/core
- Phase 260 complete (both plans shipped): RpcPool core + built-in defaults ready
- Phase 261 can proceed with adapter integration (IChainAdapter wiring to RpcPool)
- Phase 262 can proceed with admin UI settings (user-configurable endpoints override defaults)

## Self-Check: PASSED

- [x] built-in-defaults.ts exists
- [x] rpc-pool.ts exists (modified)
- [x] rpc/index.ts exists (modified)
- [x] rpc-pool-defaults.test.ts exists
- [x] SUMMARY.md exists
- [x] Commit 97926b65 exists
- [x] Commit 38c96ae3 exists

---
*Phase: 260-rpc-pool-core-built-in-defaults*
*Completed: 2026-02-25*
