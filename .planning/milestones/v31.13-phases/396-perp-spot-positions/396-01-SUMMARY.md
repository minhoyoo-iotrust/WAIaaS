---
phase: 396-perp-spot-positions
plan: 01
subsystem: defi
tags: [hyperliquid, perp, position-provider, info-api]

requires:
  - phase: 393-staking-positions
    provides: IPositionProvider duck-type pattern and PositionTracker integration
provides:
  - HyperliquidPerpProvider IPositionProvider duck-type methods (getPositions/getProviderName/getSupportedCategories)
  - PERP PositionUpdate with 8 metadata fields (market, side, entryPrice, markPrice, leverage, unrealizedPnl, liquidationPrice, marginUsed)
affects: [396-02, 397-admin-dashboard-ux]

tech-stack:
  added: []
  patterns: [Info API mid-price lookup for amountUsd, Promise.all parallel fetch]

key-files:
  created: []
  modified:
    - packages/actions/src/providers/hyperliquid/perp-provider.ts
    - packages/actions/src/providers/hyperliquid/__tests__/perp-provider.test.ts

key-decisions:
  - "D16: markPrice from getAllMidPrices() and amountUsd = abs(szi) * markPrice"
  - "D17: null amountUsd when mid price unavailable (not 0)"

patterns-established:
  - "Hyperliquid IPositionProvider: parallel fetch positions + mids via Promise.all"

requirements-completed: [PERP-01, PERP-02]

duration: 3min
completed: 2026-03-12
---

# Phase 396 Plan 01: HyperliquidPerpProvider IPositionProvider Summary

**HyperliquidPerpProvider duck-type IPositionProvider with Info API position/mid-price parallel fetch and 8-field PERP metadata**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-12T13:10:18Z
- **Completed:** 2026-03-12T13:13:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Added getPositions/getProviderName/getSupportedCategories to HyperliquidPerpProvider
- Parallel fetch of positions + mid prices via Promise.all for performance
- All 8 PERP metadata fields mapped: market, side, entryPrice, markPrice, leverage, unrealizedPnl, liquidationPrice, marginUsed
- Graceful error handling (returns [] on API error)

## Task Commits

1. **Task 1: HyperliquidPerpProvider IPositionProvider methods + tests** - `56223083` (feat)

## Files Created/Modified
- `packages/actions/src/providers/hyperliquid/perp-provider.ts` - Added 3 IPositionProvider duck-type methods
- `packages/actions/src/providers/hyperliquid/__tests__/perp-provider.test.ts` - Added 8 IPositionProvider tests (long/short, empty, error, amountUsd)

## Decisions Made
- D16: Use markPrice from getAllMidPrices() for amountUsd calculation (abs(szi) * markPrice)
- D17: Return null amountUsd when mid price is unavailable, not 0

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- HyperliquidPerpProvider ready for PositionTracker auto-registration
- Ready for 396-02 (HyperliquidSpotProvider + integration tests)

---
*Phase: 396-perp-spot-positions*
*Completed: 2026-03-12*
