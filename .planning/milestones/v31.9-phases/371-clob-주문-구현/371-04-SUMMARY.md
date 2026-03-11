---
phase: 371-clob-주문-구현
plan: 04
subsystem: defi
tags: [polymarket, neg-risk, approve, orderbook, infrastructure-factory]

requires:
  - phase: 371-clob-주문-구현
    provides: All prior plans (01-03) - Signer, ClobClient, OrderBuilder, DB, OrderProvider, ApiKeyService

provides:
  - NegRiskRouter (CTF vs NegRisk exchange contract selection)
  - PolymarketApproveHelper (USDC.e ERC-20 approval with MaxUint256)
  - PolymarketOrderbookService (structured orderbook with spread/depth)
  - createPolymarketInfrastructure factory function

affects: [372-ctf-position, 373-mcp-admin]

tech-stack:
  added: []
  patterns: [neg-risk-routing, dual-approve, infrastructure-factory]

key-files:
  created:
    - packages/actions/src/providers/polymarket/neg-risk-router.ts
    - packages/actions/src/providers/polymarket/approve-helper.ts
    - packages/actions/src/providers/polymarket/orderbook-service.ts
    - packages/actions/src/providers/polymarket/infrastructure.ts
    - packages/actions/src/providers/polymarket/__tests__/neg-risk-router.test.ts
    - packages/actions/src/providers/polymarket/__tests__/approve-helper.test.ts
    - packages/actions/src/providers/polymarket/__tests__/orderbook-service.test.ts
  modified:
    - packages/actions/src/providers/polymarket/index.ts

key-decisions:
  - "NegRiskRouter as static utility (no state needed)"
  - "ApproveHelper returns structured ApproveRequest type (not raw calldata)"
  - "Factory accepts PolymarketDb with separate apiKeys and orders interfaces"

patterns-established:
  - "Neg risk routing: binary -> CTF Exchange, multi-outcome -> NegRisk CTF Exchange"
  - "Dual approve pattern for both exchanges upfront"
  - "Infrastructure factory with dependency injection for daemon startup"

requirements-completed: [CLOB-06, CLOB-10, CLOB-11]

duration: 15min
completed: 2026-03-11
---

# Phase 371 Plan 04: NegRiskRouter, ApproveHelper, OrderbookService, Infrastructure Factory Summary

**Exchange contract routing by neg_risk flag, USDC.e MaxUint256 approve, structured orderbook with spread/depth, and factory wiring all 12 Polymarket components**

## Performance

- **Duration:** 15 min
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- NegRiskRouter: static routing to CTF Exchange or NegRisk CTF Exchange based on market flag
- PolymarketApproveHelper: ERC-20 approval with MaxUint256 default, dual approve for both exchanges
- PolymarketOrderbookService: structured orderbook with spread, midpoint, depth calculations
- createPolymarketInfrastructure: factory function wiring all components with proper DI

## Task Commits

1. **Tasks 1-2 (combined):** `4c99654d` (feat)

## Files Created/Modified
- `packages/actions/src/providers/polymarket/neg-risk-router.ts` - Exchange routing by neg_risk
- `packages/actions/src/providers/polymarket/approve-helper.ts` - USDC.e approve logic
- `packages/actions/src/providers/polymarket/orderbook-service.ts` - Orderbook queries
- `packages/actions/src/providers/polymarket/infrastructure.ts` - Factory function
- `packages/actions/src/providers/polymarket/index.ts` - Final re-exports (12 modules)

## Decisions Made
- NegRiskRouter as static class (stateless, no DI needed)
- ApproveHelper returns structured ApproveRequest (not raw encoded calldata)
- Infrastructure factory accepts split PolymarketDb interface

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed RateLimiter constructor argument in factory**
- **Found during:** Task 2
- **Issue:** Factory passed object `{ maxRequests, windowMs }` but constructor takes two separate number params
- **Fix:** Destructured config object into two positional args
- **Committed in:** 4c99654d

**2. [Rule 1 - Bug] Fixed optional response fields in OrderbookService**
- **Found during:** Task 2
- **Issue:** `price` and `mid` fields are optional in Zod schemas, TypeScript error on return
- **Fix:** Added `?? '0'` fallback for both fields
- **Committed in:** 4c99654d

---

**Total deviations:** 2 auto-fixed (2 type errors)
**Impact on plan:** Both fixes necessary for type safety. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 371 complete: all CLOB infrastructure ready
- Phase 372 can build CTF position management on top
- Phase 373 can wire MCP tools and Admin UI

---
*Phase: 371-clob-주문-구현*
*Completed: 2026-03-11*
