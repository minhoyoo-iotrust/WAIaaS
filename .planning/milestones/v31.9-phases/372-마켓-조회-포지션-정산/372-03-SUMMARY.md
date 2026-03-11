---
phase: 372-마켓-조회-포지션-정산
plan: "03"
title: "PositionTracker + PnlCalculator + ResolutionMonitor + factory wiring"
one_liner: "Position tracking with weighted avg price, bigint PnL calculation, resolution polling with notification, and full factory wiring"
subsystem: polymarket
tags: [positions, pnl, resolution, factory, notification, bigint]
dependency_graph:
  requires: [PolymarketMarketData, PositionDb, PolymarketPositionTracker]
  provides: [PolymarketPositionTracker, PolymarketPnlCalculator, PolymarketResolutionMonitor, complete factory]
  affects: [infrastructure.ts (OrderProvider NegRiskResolver now wired), order-provider.ts (negRiskResolver no longer null)]
tech_stack:
  added: []
  patterns: [weighted avg price (bigint), polling-based resolution check, notification event emission]
key_files:
  created:
    - packages/actions/src/providers/polymarket/position-tracker.ts
    - packages/actions/src/providers/polymarket/pnl-calculator.ts
    - packages/actions/src/providers/polymarket/resolution-monitor.ts
    - packages/actions/src/providers/polymarket/__tests__/position-tracker.test.ts
    - packages/actions/src/providers/polymarket/__tests__/pnl-calculator.test.ts
    - packages/actions/src/providers/polymarket/__tests__/resolution-monitor.test.ts
  modified:
    - packages/actions/src/providers/polymarket/infrastructure.ts
    - packages/actions/src/providers/polymarket/index.ts
decisions:
  - "PnlCalculator is stateless static class (no dependencies, pure functions)"
  - "ResolutionMonitor is polling-based (not daemon background), called on position query"
  - "Factory wires MarketData.isNegRisk as NegRiskResolver, replacing Phase 371 null"
  - "PolymarketDb.positions added as nullable for incremental adoption"
metrics:
  duration: ~5min
  completed: 2026-03-11
---

# Phase 372 Plan 03: PositionTracker + PnlCalculator + ResolutionMonitor Summary

Position tracking with weighted avg price, bigint PnL calculation, resolution polling with notification, and full factory wiring.

## What Was Built

### 1. PolymarketPositionTracker (position-tracker.ts)
- `getPositions(walletId)`: DB read + enrich with current MarketData prices
- `getPosition(walletId, tokenId)`: single position lookup
- `upsertPosition(walletId, fill)`: weighted avg price calculation via bigint math
- `markResolved(conditionId, winningOutcome)`: DB update for resolution
- All amounts use string-to-bigint with 6 decimal scaling

### 2. PolymarketPnlCalculator (pnl-calculator.ts)
- `calculateUnrealized(size, avgPrice, currentPrice)`: (currentPrice - avgPrice) * size
- `calculateRealized(realizedPnl)`: passthrough from DB
- `summarize(positions)`: aggregate totalUnrealized, totalRealized, byPosition
- Static methods, no dependencies, pure functions

### 3. PolymarketResolutionMonitor (resolution-monitor.ts)
- `checkResolutions(walletId)`: polls MarketData for open positions
- Deduplicates conditionId checks
- On resolution: markResolved + emit notification
- Notification includes suggestedAction: 'pm_redeem_positions'
- Optional emitNotification callback (graceful when not provided)

### 4. Factory Wiring (infrastructure.ts)
- GammaClient + MarketData created in factory
- PositionTracker + ResolutionMonitor created if db.positions provided
- OrderProvider's negRiskResolver wired to MarketData.isNegRisk
- emitNotification callback passed through to ResolutionMonitor
- PolymarketDb.positions added (nullable)

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| position-tracker.test.ts | 8 | PASS |
| pnl-calculator.test.ts | 10 | PASS |
| resolution-monitor.test.ts | 7 | PASS |
| All polymarket tests (Phase 371 + 372) | 158 | PASS |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 093d971f | PositionTracker + PnlCalculator |
| 2 | 895d3af1 | ResolutionMonitor + factory wiring + index exports |

## Deviations from Plan

None - plan executed exactly as written.
