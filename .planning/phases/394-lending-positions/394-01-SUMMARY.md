---
phase: 394-lending-positions
plan: 01
subsystem: defi
tags: [aave-v3, lending, position-tracking, health-factor, oracle, evm]

# Dependency graph
requires:
  - phase: 393-staking-positions
    provides: IPositionProvider pattern, PositionTracker duck-type registration
provides:
  - Aave V3 getPositions() with per-reserve SUPPLY/BORROW positions
  - ABI encoding/decoding for getReservesList, balanceOf, getAssetsPrices, getReserveTokensAddresses
  - Health Factor extraction from getUserAccountData
  - Oracle-based USD conversion via getAssetsPrices (8 decimals)
affects: [397-admin-dashboard-ux, position-tracker]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-reserve token address discovery via PoolDataProvider, batch Oracle pricing, ABI dynamic array encoding/decoding]

key-files:
  created: [packages/actions/src/__tests__/aave-v3-positions.test.ts]
  modified: [packages/actions/src/providers/aave-v3/index.ts, packages/actions/src/providers/aave-v3/aave-contracts.ts, packages/actions/src/providers/aave-v3/aave-rpc.ts, packages/daemon/src/__tests__/position-tracker.test.ts]

key-decisions:
  - "Use PoolDataProvider.getReserveTokensAddresses() for aToken/debtToken address discovery (simpler than parsing Pool.getReserveData response)"
  - "Batch Oracle getAssetsPrices() for all reserves at once (single RPC call) instead of per-reserve price queries"
  - "Include healthFactor in every position metadata (not just first) so Dashboard can read from any position"
  - "Only variable debt tracked (stable borrow rate deprecated in Aave V3)"

patterns-established:
  - "ABI dynamic array encoding: selector + offset(0x20) + length + items"
  - "ABI dynamic array decoding: skip offset(64 chars) + read length(64 chars) + extract N slots"

requirements-completed: [LEND-01, LEND-02, LEND-03, LEND-04, TEST-01, TEST-02]

# Metrics
duration: 7min
completed: 2026-03-12
---

# Phase 394 Plan 01: Aave V3 Lending Positions Summary

**Aave V3 getPositions() with per-reserve Supply/Borrow tracking, Health Factor extraction, and Oracle USD pricing via IRpcCaller**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-12T09:20:27Z
- **Completed:** 2026-03-12T09:27:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Implemented full getPositions() replacing the stub `return []` with per-reserve aToken/debtToken balance queries
- Added 6 ABI encoding helpers (getReservesList, balanceOf, getAssetsPrices, getReserveTokensAddresses) and 3 decoding helpers (decodeAddressArray, decodeUint256Array, decodeReserveTokensAddresses)
- SUPPLY positions include APY from liquidityRate, CAIP-19 assetId, amountUsd from Oracle
- BORROW positions include interestRateMode=variable, APY from variableBorrowRate
- Health Factor from getUserAccountData() in all position metadata
- 14 new tests (11 unit + 3 integration), all 134 aave-v3 tests + 20 position-tracker tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing tests** - `ed0c0c9` (test)
2. **Task 1 GREEN: ABI helpers + getPositions()** - `2a98097` (feat)
3. **Task 2: PositionTracker LENDING integration tests** - `2bb0b36` (test)

_TDD: RED then GREEN commits for Task 1_

## Files Created/Modified
- `packages/actions/src/__tests__/aave-v3-positions.test.ts` - 11 unit tests for encoding/decoding + getPositions behavior
- `packages/actions/src/providers/aave-v3/aave-contracts.ts` - Added 6 selectors + 4 encoder functions
- `packages/actions/src/providers/aave-v3/aave-rpc.ts` - Added decodeAddressArray, decodeUint256Array, decodeReserveTokensAddresses
- `packages/actions/src/providers/aave-v3/index.ts` - Full getPositions() implementation (Supply/Borrow/HF/Oracle)
- `packages/daemon/src/__tests__/position-tracker.test.ts` - 3 LENDING category integration tests

## Decisions Made
- Used PoolDataProvider.getReserveTokensAddresses() for aToken/debtToken address discovery (simpler than parsing Pool.getReserveData response)
- Batch Oracle getAssetsPrices() for all reserves at once (single RPC call for USD conversion)
- healthFactor included in every position metadata (not just first) so Dashboard can read from any position
- Only variable debt tracked (stable borrow rate deprecated in Aave V3)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed unused import TypeScript errors**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Test file imported AAVE_SELECTORS, encodeGetReserveTokensAddressesCalldata, decodeReserveTokensAddresses, addressToHex but didn't use them directly
- **Fix:** Removed unused imports from test file
- **Files modified:** packages/actions/src/__tests__/aave-v3-positions.test.ts
- **Verification:** TypeScript typecheck passes clean
- **Committed in:** 2a98097 (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Trivial unused import cleanup. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Aave V3 LENDING positions ready for PositionTracker sync via duck-type auto-registration
- Phase 395 (Pendle Yield) and 396 (Hyperliquid) are independent and can proceed
- Phase 397 (Admin Dashboard UX) will consume LENDING position data alongside STAKING

---
*Phase: 394-lending-positions*
*Completed: 2026-03-12*
