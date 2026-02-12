---
phase: 84-adapter-factory
plan: 01
subsystem: infra
tags: [adapter-pool, chain-adapter, solana, evm, caching, lazy-init]

# Dependency graph
requires:
  - phase: 82-evm-adapter-scaffold
    provides: "EvmAdapter class + EVM_CHAIN_MAP"
  - phase: 48-core-infra
    provides: "SolanaAdapter + IChainAdapter interface"
provides:
  - "AdapterPool class with resolve() and disconnectAll()"
  - "Lazy-initialized, cached IChainAdapter instances keyed by chain:network"
affects:
  - 84-02 (daemon integration uses AdapterPool)
  - 84-03 (route-level adapter resolution)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AdapterPool: Map<chain:network, IChainAdapter> with lazy dynamic import"
    - "Fail-soft disconnectAll: Promise.all with per-adapter catch"

key-files:
  created:
    - packages/daemon/src/infrastructure/adapter-pool.ts
    - packages/daemon/src/__tests__/adapter-pool.test.ts
  modified: []

key-decisions:
  - "Dynamic import for both @waiaas/adapter-solana and @waiaas/adapter-evm in resolve()"
  - "EVM_CHAIN_MAP lookup provides viemChain + nativeSymbol + nativeName automatically"
  - "disconnectAll() is concurrent (Promise.all) with catch per adapter (fail-soft)"
  - "Pool clears after disconnectAll so subsequent resolves create fresh adapters"

patterns-established:
  - "AdapterPool: central adapter factory pattern for multi-chain daemon support"

# Metrics
duration: 2min
completed: 2026-02-12
---

# Phase 84 Plan 01: AdapterPool Summary

**AdapterPool class with lazy-init, caching by chain:network, and fail-soft disconnectAll for multi-chain daemon support**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-12T09:24:58Z
- **Completed:** 2026-02-12T09:26:39Z
- **Tasks:** 1 (TDD: RED -> GREEN)
- **Files created:** 2

## Accomplishments
- AdapterPool.resolve() creates correct adapter type (Solana/EVM) based on chain parameter
- EVM_CHAIN_MAP lookup provides viemChain + nativeSymbol + nativeName automatically
- Same chain:network returns cached instance (referential equality verified)
- disconnectAll() concurrent with fail-soft per-adapter error handling
- 11 unit tests covering all resolve/cache/disconnect/error scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests for AdapterPool** - `880842f` (test)
2. **Task 1 GREEN: Implement AdapterPool** - `a8f0760` (feat)

_TDD task: test -> feat cycle completed_

## Files Created/Modified
- `packages/daemon/src/infrastructure/adapter-pool.ts` - AdapterPool class with resolve() and disconnectAll()
- `packages/daemon/src/__tests__/adapter-pool.test.ts` - 11 unit tests with mocked SolanaAdapter/EvmAdapter

## Decisions Made
- Dynamic import for both adapter packages (same pattern as current daemon.ts Step 4)
- EVM_CHAIN_MAP lookup provides viemChain + nativeSymbol + nativeName automatically -- no manual mapping needed
- disconnectAll() is concurrent (Promise.all) with catch per adapter (fail-soft) -- one failing disconnect doesn't block others
- Pool clears after disconnectAll so subsequent resolves create fresh adapters

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AdapterPool ready for daemon integration (Plan 02 adds @waiaas/adapter-evm dependency and wires into DaemonLifecycle)
- No blockers

## Self-Check: PASSED

---
*Phase: 84-adapter-factory*
*Completed: 2026-02-12*
