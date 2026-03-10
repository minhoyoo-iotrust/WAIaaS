---
phase: 371-clob-주문-구현
plan: 03
subsystem: defi
tags: [polymarket, action-provider, api-key, clob, api-direct-result]

requires:
  - phase: 371-clob-주문-구현
    provides: Signer, ClobClient, OrderBuilder, Schemas (plan 01), DB tables (plan 02)

provides:
  - PolymarketOrderProvider (5 CLOB actions: buy/sell/cancel/cancelAll/update)
  - PolymarketApiKeyService (lazy creation + encrypted storage)
  - ApiDirectResult pattern for off-chain CLOB orders
  - getSpendingAmount for policy engine integration

affects: [371-04, 372-ctf-position, 373-mcp-admin]

tech-stack:
  added: []
  patterns: [api-direct-result-off-chain, lazy-api-key-creation, encrypted-credential-storage]

key-files:
  created:
    - packages/actions/src/providers/polymarket/order-provider.ts
    - packages/actions/src/providers/polymarket/api-key-service.ts
    - packages/actions/src/providers/polymarket/__tests__/order-provider.test.ts
    - packages/actions/src/providers/polymarket/__tests__/api-key-service.test.ts
  modified:
    - packages/actions/src/providers/polymarket/index.ts

key-decisions:
  - "ApiDirectResult pattern for off-chain CLOB orders (Stage 5 skip)"
  - "Lazy API key creation on first CLOB operation per wallet"
  - "NegRiskResolver interface stub (null, full impl Phase 372)"

patterns-established:
  - "Off-chain DEX ApiDirectResult with externalId tracking"
  - "Lazy encrypted API key lifecycle (create/cache/delete)"

requirements-completed: [CLOB-01, CLOB-02, CLOB-03, CLOB-04, CLOB-05, CLOB-07]

duration: 15min
completed: 2026-03-11
---

# Phase 371 Plan 03: PolymarketOrderProvider + ApiKeyService Summary

**5 CLOB trading actions (buy/sell/cancel/cancelAll/update) with ApiDirectResult pattern and lazy encrypted API key lifecycle**

## Performance

- **Duration:** 15 min
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- PolymarketOrderProvider implementing IActionProvider with 5 actions and getSpendingAmount
- PolymarketApiKeyService with lazy creation, encrypted DB storage, and CLOB-side cleanup
- ApiDirectResult pattern for off-chain CLOB orders (Stage 5 skip)
- 24 tests (6 api-key + 18 order-provider)

## Task Commits

1. **Tasks 1-2 (combined):** `7d66f7b2` (feat)

## Files Created/Modified
- `packages/actions/src/providers/polymarket/order-provider.ts` - 5 CLOB actions with resolve() dispatch
- `packages/actions/src/providers/polymarket/api-key-service.ts` - Lazy API key creation + encrypted storage
- `packages/actions/src/providers/polymarket/__tests__/order-provider.test.ts` - 18 tests
- `packages/actions/src/providers/polymarket/__tests__/api-key-service.test.ts` - 6 tests
- `packages/actions/src/providers/polymarket/index.ts` - Added exports

## Decisions Made
- ApiDirectResult for off-chain CLOB orders bypasses on-chain pipeline Stage 5
- NegRiskResolver is null stub (full MarketData impl deferred to Phase 372)
- getSpendingAmount returns price*size for pm_buy, 0n for sell/cancel actions

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- OrderProvider ready for infrastructure factory wiring (371-04)
- NegRiskResolver stub ready for MarketData integration (Phase 372)

---
*Phase: 371-clob-주문-구현*
*Completed: 2026-03-11*
