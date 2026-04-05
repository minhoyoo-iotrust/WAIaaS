---
phase: 276-aave-v3-provider-implementation
plan: 02
subsystem: defi
tags: [aave, evm, lending, rpc-decoder, health-factor, bigint]

requires:
  - phase: 276-aave-v3-provider-implementation
    provides: MAX_UINT256 from aave-contracts.ts
provides:
  - IRpcCaller interface for dependency injection
  - getUserAccountData/getReserveData hex decoders
  - simulateHealthFactor with bigint-only arithmetic
  - rayToApy conversion and HF threshold constants
affects: [276-03-provider, 277-api-integration]

tech-stack:
  added: []
  patterns: [hex-response-decoding, bigint-health-factor-arithmetic]

key-files:
  created:
    - packages/actions/src/providers/aave-v3/aave-rpc.ts
    - packages/actions/src/__tests__/aave-v3-rpc.test.ts
  modified: []

key-decisions:
  - "IRpcCaller interface uses simple {to, data, chainId?} params -- no viem PublicClient coupling"
  - "HF threshold comparisons use bigint constants exclusively (Research Flag C2)"
  - "rayToApy uses linear approximation (rate / 1e27) -- acceptable for display"

requirements-completed: [AAVE-07, AAVE-08, AAVE-09]

duration: 6min
completed: 2026-02-27
---

# Phase 276 Plan 02: RPC Decoders + HF Simulation + APY Conversion Summary

**Pure decoder functions for Aave V3 on-chain responses with bigint-only HF simulation preventing self-liquidation**

## Performance

- **Duration:** 6 min
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- IRpcCaller interface for clean dependency injection
- decodeGetUserAccountData parses 6 uint256 fields from 384 hex chars
- simulateHealthFactor computes projected HF for borrow/withdraw using bigint-only arithmetic
- rayToApy converts ray (1e27) rates to decimal APY
- HF threshold constants: LIQUIDATION_THRESHOLD_HF (1.0) and WARNING_THRESHOLD_HF (1.2)
- 24 unit tests all passing

## Task Commits

1. **Task 1+2: aave-rpc.ts + tests** - `1ad946e2` (feat)

## Files Created/Modified
- `packages/actions/src/providers/aave-v3/aave-rpc.ts` - IRpcCaller, decoders, HF simulation, APY conversion
- `packages/actions/src/__tests__/aave-v3-rpc.test.ts` - 24 unit tests

## Decisions Made
- IRpcCaller uses minimal interface (no viem coupling)
- All HF comparisons in bigint (never Number conversion for safety-critical checks)
- Linear APY approximation acceptable for display purposes

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Next Phase Readiness
- Ready for Plan 276-03 (AaveV3LendingProvider class)
- All decoders and simulation functions available for import

---
*Phase: 276-aave-v3-provider-implementation*
*Completed: 2026-02-27*
