---
phase: 02-xrpldexprovider-core
plan: 01
subsystem: actions/xrpl-dex
tags: [xrpl, dex, schemas, offer-builder, orderbook-client]
dependency_graph:
  requires: []
  provides: [SwapInputSchema, LimitOrderInputSchema, CancelOrderInputSchema, GetOrderbookInputSchema, GetOffersInputSchema, formatXrplAmount, buildSwapParams, buildLimitOrderParams, buildCancelParams, validateReserve, XrplOrderbookClient]
  affects: [packages/actions]
tech_stack:
  added: [xrpl@4.6.0 (optional)]
  patterns: [Zod SSoT schemas, calldata JSON builder, RPC wrapper with lazy connect]
key_files:
  created:
    - packages/actions/src/providers/xrpl-dex/schemas.ts
    - packages/actions/src/providers/xrpl-dex/offer-builder.ts
    - packages/actions/src/providers/xrpl-dex/orderbook-client.ts
    - packages/actions/src/providers/xrpl-dex/__tests__/offer-builder.test.ts
    - packages/actions/src/providers/xrpl-dex/__tests__/orderbook-client.test.ts
  modified:
    - packages/actions/package.json
decisions:
  - "xrpl added as optional dependency to @waiaas/actions (following Kamino/Drift pattern)"
  - "Token format uses dot separator matching parseTrustLineToken convention"
  - "Slippage reduces TakerPays (minimum receive) for IoC swaps"
  - "Owner reserve validation uses 200000 drops (0.2 XRP) per object constant"
  - "Base reserve uses 1000000 drops (1 XRP, post-amendment value)"
metrics:
  duration: 370s
  completed: 2026-04-04
  tasks: 3
  files: 7
  tests: 40
---

# Phase 02 Plan 01: Schemas + OfferBuilder + OrderbookClient Summary

Zod input schemas for 5 XRPL DEX actions, OfferBuilder for currency amount conversion and calldata JSON construction with slippage and reserve validation, and XrplOrderbookClient RPC wrapper for orderbook and account queries.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Zod input schemas for 5 DEX actions | bf58b9ed | schemas.ts |
| 2 | OfferBuilder currency/calldata/reserve | b75b0030 | offer-builder.ts, offer-builder.test.ts |
| 3 | XrplOrderbookClient RPC wrapper | b334932c | orderbook-client.ts, orderbook-client.test.ts |

## Key Implementation Details

### Schemas (schemas.ts)
- SwapInputSchema: takerGets/takerPays token pairs with slippageBps (1-500, default 50)
- LimitOrderInputSchema: with expirationSeconds (60-2592000, default 86400)
- CancelOrderInputSchema: offerSequence (positive integer)
- GetOrderbookInputSchema/GetOffersInputSchema: limit with defaults

### OfferBuilder (offer-builder.ts)
- formatXrplAmount: XRP -> drops string, IOU -> {currency, issuer, value}
- buildSwapParams: tfImmediateOrCancel (0x00020000) + slippage on TakerPays
- buildLimitOrderParams: Ripple epoch conversion (Unix - 946684800)
- buildCancelParams: OfferCancel with OfferSequence
- validateReserve: 200000 drops per object check

### OrderbookClient (orderbook-client.ts)
- Lazy WebSocket connection with concurrent connect prevention
- getOrderbook: dual book_offers for asks/bids with spread calculation
- getAccountOffers: normalized offer list with seq for cancel
- checkTrustLine: account_lines filtered by peer/currency
- getAccountReserve: available balance after base + owner reserves

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] xrpl dependency missing from @waiaas/actions**
- **Found during:** Task 1 (schema creation)
- **Issue:** @waiaas/actions package had no xrpl dependency; OrderbookClient needs xrpl.Client
- **Fix:** Added xrpl@^4.6.0 as optionalDependency (following Kamino/Drift SDK pattern)
- **Files modified:** packages/actions/package.json, pnpm-lock.yaml

**2. [Rule 1 - Bug] xrpl strict type incompatibility with Record<string, unknown>**
- **Found during:** Task 3 (type-check)
- **Issue:** xrpl.js BookOffer/AccountOffer types lack index signatures, can't use as Record<string, unknown>
- **Fix:** Used proper xrpl Amount type imports and let TypeScript infer callback parameter types
- **Files modified:** orderbook-client.ts

## Known Stubs

None -- all modules fully implemented with tests.

## Self-Check: PASSED
