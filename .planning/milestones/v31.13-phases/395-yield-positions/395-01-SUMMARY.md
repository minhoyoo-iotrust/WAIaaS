---
phase: 395-yield-positions
plan: 01
subsystem: defi
tags: [pendle, yield, pt, yt, erc20, balanceOf, position-tracking, caip-19]

requires:
  - phase: 290-pendle-yield
    provides: PendleYieldProvider stub with IPositionProvider interface
  - phase: 393-staking-positions
    provides: IPositionProvider pattern (raw fetch, formatWei, encodeBalanceOfCalldata)
provides:
  - Pendle getPositions() with PT/YT balance queries via raw eth_call
  - MATURED status auto-detection based on market expiry
  - YIELD category integration in PositionTracker
affects: [397-admin-dashboard-ux, position-tracker]

tech-stack:
  added: []
  patterns: [raw-fetch-eth-call-balanceOf, market-expiry-matured-detection]

key-files:
  created: []
  modified:
    - packages/actions/src/providers/pendle/config.ts
    - packages/actions/src/providers/pendle/index.ts
    - packages/actions/src/providers/pendle/__tests__/pendle-provider.test.ts
    - packages/daemon/src/__tests__/position-tracker.test.ts

key-decisions:
  - "D13: amountUsd set to null for Pendle PT/YT (no simple on-chain oracle for PT/YT pricing)"
  - "D14: Only ethereum-mainnet queried for Pendle positions (primary chain, single rpcUrl)"
  - "D15: Local encodeBalanceOfCalldata/ethCallUint256/formatWei helpers (same pattern as Lido, no shared extraction needed)"

patterns-established:
  - "MATURED status detection: compare market.expiry unix timestamp vs now"
  - "tokenType metadata field: PT or YT for Pendle yield positions"

requirements-completed: [YIELD-01, YIELD-02, YIELD-03, TEST-01, TEST-02]

duration: 5min
completed: 2026-03-12
---

# Phase 395 Plan 01: Pendle Yield Positions Summary

**Pendle PT/YT balance-based YIELD position tracking with market expiry MATURED auto-detection via raw eth_call**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-12T12:56:03Z
- **Completed:** 2026-03-12T13:01:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced getPositions() stub with full PT/YT balance query implementation using raw fetch() eth_call
- Auto-detect MATURED status when market expiry is in the past
- Metadata includes tokenType (PT/YT), maturity, underlyingAsset, impliedApy, marketAddress
- CAIP-19 assetId format for all positions
- 10 new tests (7 unit + 3 integration)

## Task Commits

Each task was committed atomically:

1. **Task 1: Pendle getPositions() PT/YT + maturity + APY** - `0fcfea5b` (feat)
2. **Task 2: PositionTracker YIELD integration tests** - `8d8d4e4e` (test)

## Files Created/Modified
- `packages/actions/src/providers/pendle/config.ts` - Added rpcUrl optional field to PendleConfig
- `packages/actions/src/providers/pendle/index.ts` - Full getPositions() implementation with PT/YT balance queries, MATURED detection, CAIP-19 assetId
- `packages/actions/src/providers/pendle/__tests__/pendle-provider.test.ts` - 7 new getPositions tests (PT, YT, MATURED, zero, multi-market, CAIP-19, RPC error)
- `packages/daemon/src/__tests__/position-tracker.test.ts` - 3 new YIELD category integration tests

## Decisions Made
- amountUsd set to null for PT/YT positions (no simple on-chain oracle for Pendle token pricing)
- Only ethereum-mainnet queried (Pendle primary chain, single rpcUrl config)
- Local helper methods (encodeBalanceOfCalldata, ethCallUint256, formatWei) following Lido pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused PENDLE_CHAIN_ID_MAP import**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** Unused import of PENDLE_CHAIN_ID_MAP caused TypeScript build error
- **Fix:** Removed the import since getPendleChainId() was sufficient
- **Files modified:** packages/actions/src/providers/pendle/index.ts
- **Verification:** typecheck passes
- **Committed in:** 8d8d4e4e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor import cleanup. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- YIELD positions ready for Admin Dashboard (Phase 397)
- Phase 396 (Hyperliquid Perp/Spot) is independent and can proceed in parallel

## Self-Check: PASSED

All 4 files verified on disk. Both commits (0fcfea5b, 8d8d4e4e) found in git log.

---
*Phase: 395-yield-positions*
*Completed: 2026-03-12*
