---
phase: 371-clob-주문-구현
plan: 01
subsystem: defi
tags: [polymarket, eip-712, hmac, clob, viem, zod, rate-limiter]

requires:
  - phase: 370-polymarket-설계
    provides: design doc 80 specification for CLOB infrastructure

provides:
  - PolymarketSigner (EIP-712 order signing + HMAC L2 auth)
  - PolymarketClobClient (REST client for CLOB API with rate limiting)
  - PolymarketRateLimiter (sliding-window 10 req/s)
  - OrderBuilder (price/size to makerAmount/takerAmount with USDC.e 6d precision)
  - Zod schemas for 5 CLOB actions + response types
  - PM_CONTRACTS, PM_API_URLS, EIP-712 domains config

affects: [371-02, 371-03, 371-04, 372-ctf-position]

tech-stack:
  added: []
  patterns: [static-signer-class, integer-arithmetic-order-amounts, sliding-window-rate-limiter]

key-files:
  created:
    - packages/actions/src/providers/polymarket/config.ts
    - packages/actions/src/providers/polymarket/signer.ts
    - packages/actions/src/providers/polymarket/clob-client.ts
    - packages/actions/src/providers/polymarket/rate-limiter.ts
    - packages/actions/src/providers/polymarket/order-builder.ts
    - packages/actions/src/providers/polymarket/schemas.ts
    - packages/actions/src/providers/polymarket/index.ts
  modified: []

key-decisions:
  - "Used integer arithmetic (decimalToBigint, multiplyDecimals) in OrderBuilder to avoid float precision issues"
  - "Static PolymarketSigner class mirrors HyperliquidSigner pattern"
  - "EIP-712 3 domains: ClobAuth (chainId 137), CTF Exchange (chainId 137), NegRisk CTF Exchange (chainId 137)"

patterns-established:
  - "Polymarket static signer with signOrder + signClobAuth + buildHmacHeaders"
  - "Integer-only order amount calculation for USDC.e 6 decimal precision"

requirements-completed: []

duration: 25min
completed: 2026-03-11
---

# Phase 371 Plan 01: Polymarket CLOB Infrastructure Summary

**EIP-712 order signing, HMAC L2 auth, CLOB REST client, rate limiter, and integer-arithmetic order builder for Polymarket CLOB trading**

## Performance

- **Duration:** 25 min
- **Tasks:** 4
- **Files modified:** 11

## Accomplishments
- PolymarketSigner with EIP-712 signing (3 domains) and HMAC-SHA256 L2 auth headers
- PolymarketClobClient covering L1/L2/public CLOB endpoints with rate limiting
- OrderBuilder with integer arithmetic for precise USDC.e 6 decimal calculations
- Sliding-window rate limiter (10 req/s default)
- Zod schemas for all 5 CLOB trading actions

## Task Commits

1. **Tasks 1-4 (combined):** `8cbabb8f` (feat)

## Files Created/Modified
- `packages/actions/src/providers/polymarket/config.ts` - Contracts, URLs, EIP-712 domains, settings
- `packages/actions/src/providers/polymarket/signer.ts` - EIP-712 + HMAC signing
- `packages/actions/src/providers/polymarket/clob-client.ts` - CLOB REST client
- `packages/actions/src/providers/polymarket/rate-limiter.ts` - Sliding-window limiter
- `packages/actions/src/providers/polymarket/order-builder.ts` - Order amount calculator
- `packages/actions/src/providers/polymarket/schemas.ts` - Zod schemas
- `packages/actions/src/providers/polymarket/index.ts` - Re-exports

## Decisions Made
- Integer arithmetic for order amounts to avoid float precision issues
- Static signer class pattern consistent with Hyperliquid provider
- 3 EIP-712 domains for Polygon chainId 137

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Infrastructure ready for OrderProvider (371-03) and DB migration (371-02)

---
*Phase: 371-clob-주문-구현*
*Completed: 2026-03-11*
