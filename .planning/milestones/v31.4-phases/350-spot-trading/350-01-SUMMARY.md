---
phase: 350-spot-trading
plan: 01
subsystem: actions/hyperliquid
tags: [spot-trading, hyperliquid, action-provider, zod-schema]
dependency_graph:
  requires: [349-02 HyperliquidSigner/ExchangeClient/MarketData]
  provides: [HyperliquidSpotProvider, Spot Zod schemas, MarketData Spot methods]
  affects: [packages/actions]
tech_stack:
  added: []
  patterns: [ApiDirectResult spot trading, spotMeta universe index for asset resolution]
key_files:
  created:
    - packages/actions/src/providers/hyperliquid/spot-provider.ts
    - packages/actions/src/providers/hyperliquid/__tests__/spot-provider.test.ts
  modified:
    - packages/actions/src/providers/hyperliquid/schemas.ts
    - packages/actions/src/providers/hyperliquid/market-data.ts
    - packages/actions/src/providers/hyperliquid/index.ts
    - packages/actions/src/providers/hyperliquid/__tests__/market-data.test.ts
decisions:
  - Spot asset index uses 10000 + universe index from spotMeta (not tokenIndex)
  - parseUsdcAmount helper duplicated in spot-provider (same as perp-provider, intentional isolation)
  - getSpotState() replaced with typed getSpotBalances() (breaking change, no external consumers)
metrics:
  duration: 5min
  completed: 2026-03-08
---

# Phase 350 Plan 01: SpotProvider + Spot Zod Schemas + MarketData Spot Methods Summary

HyperliquidSpotProvider with 3 spot trading actions (buy/sell/cancel) using ApiDirectResult pattern, typed Spot Zod schemas, and MarketData Spot query methods.

## Tasks Completed

### Task 1: Spot Zod schemas + MarketData typed Spot methods (TDD)
- **Commit:** 8c4bf2ec
- Added HlSpotBuyInputSchema, HlSpotSellInputSchema, HlSpotCancelInputSchema with refine rules (price required for LIMIT)
- Added SpotMetaSchema, SpotBalanceSchema, SpotClearinghouseStateSchema, SpotMarketInfo type
- Replaced untyped `getSpotState()` with typed `getSpotBalances()`, `getSpotMarkets()`, `getSpotMeta()`
- Added 3 new market-data tests (getSpotMarkets, getSpotBalances, getSpotMeta)

### Task 2: HyperliquidSpotProvider + tests + index re-export (TDD)
- **Commit:** d35c4612
- Created HyperliquidSpotProvider implementing IActionProvider with 3 actions:
  - hl_spot_buy: medium risk, DELAY tier
  - hl_spot_sell: low risk, INSTANT tier
  - hl_spot_cancel: low risk, INSTANT tier
- Spot asset index resolution: 10000 + spotMeta.universe.findIndex()
- getSpendingAmount: buy = size*price (USDC 6 decimals), sell = $0, cancel = $0
- Market orders use 3% slippage on mid price (same as perp)
- 16 tests covering all resolve paths, error cases, and getSpendingAmount
- Exported from index.ts: HyperliquidSpotProvider + all Spot schemas/types

## Verification Results
- All 83 Hyperliquid tests pass (5 test files)
- TypeScript compile clean (npx tsc --noEmit)

## Deviations from Plan
None - plan executed exactly as written.
