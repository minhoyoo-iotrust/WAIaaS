---
phase: 349-core-infra-perp
plan: 02
subsystem: actions
tags: [hyperliquid, eip712, signing, market-data, exchange-client, rate-limiter, db-migration]

requires:
  - phase: 348
    provides: Hyperliquid shared infrastructure design (HDESIGN-02, HDESIGN-03)
  - phase: 349-01
    provides: ApiDirectResult type for provider results
provides:
  - HyperliquidSigner with EIP-712 signing (L1 + User-Signed actions)
  - HyperliquidExchangeClient with weight-based rate limiter
  - HyperliquidMarketData for read-only queries (positions, orders, markets, funding, fills)
  - Zod schemas for all Hyperliquid API types
  - Config constants (HL_DEFAULTS, HL_ERRORS, INFO_WEIGHTS)
  - DB v51 migration (hyperliquid_orders table, 24 columns, 5 indexes)
affects: [349-03, 349-04, 349-05, 350, 351]

tech-stack:
  added: [viem/accounts (EIP-712 signing)]
  patterns: [weight-based rate limiting, L1 phantom agent signing, msgpack field ordering]

key-files:
  created:
    - packages/actions/src/providers/hyperliquid/signer.ts
    - packages/actions/src/providers/hyperliquid/schemas.ts
    - packages/actions/src/providers/hyperliquid/config.ts
    - packages/actions/src/providers/hyperliquid/exchange-client.ts
    - packages/actions/src/providers/hyperliquid/market-data.ts
    - packages/actions/src/providers/hyperliquid/index.ts
    - packages/actions/src/providers/hyperliquid/__tests__/signer.test.ts
    - packages/actions/src/providers/hyperliquid/__tests__/exchange-client.test.ts
    - packages/actions/src/providers/hyperliquid/__tests__/market-data.test.ts
    - packages/daemon/src/__tests__/migration-v51.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/daemon/src/api/routes/admin-actions.ts

key-decisions:
  - "HL_ERRORS maps to existing ChainErrorCode values (ACTION_API_ERROR, ACTION_RATE_LIMITED)"
  - "ChainError uses chain name 'HYPERLIQUID' as second constructor argument"
  - "Stage 5 ApiDirectResult uses CONFIRMED status (not COMPLETED)"
  - "DB v51 hyperliquid_orders table: 24 columns, 5 indexes, 3 CHECK constraints"

requirements-completed: [HINFRA-01, HINFRA-02, HINFRA-03, HINFRA-04, HINFRA-05, HINFRA-06, HPERP-08]

duration: 45min
completed: 2026-03-08
---

# Phase 349 Plan 02: Hyperliquid Shared Infrastructure Summary

**EIP-712 signer, exchange client with weight-based rate limiter, market data queries, Zod schemas, and DB v51 migration for Hyperliquid orders**

## Performance

- **Duration:** 45 min
- **Tasks:** 2
- **Files created:** 10
- **Files modified:** 5

## Accomplishments
- HyperliquidSigner: signL1Action (phantom agent, chainId 1337, msgpack) and signUserSignedAction (chainId 42161/421614)
- HyperliquidExchangeClient: /exchange and /info POST endpoints with Zod validation
- HyperliquidRateLimiter: 600 weight/min default (50% of 1200 limit)
- HyperliquidMarketData: 6 query methods (positions, orders, markets, funding, account, fills)
- 12 Zod schemas for API types (Position, OpenOrder, MarketInfo, FundingRate, Fill, etc.)
- DB v51: hyperliquid_orders table with full order lifecycle tracking
- 34 tests passing for signer, exchange-client, market-data

## Task Commits

1. **Task 1: Signer, Schemas, Config, ExchangeClient, MarketData** - `00d94cef` (feat)
2. **Task 2: DB v51 migration** - included in `00d94cef`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ChainErrorCode values in HL_ERRORS**
- **Found during:** Task 1 typecheck
- **Issue:** HL_ERRORS used custom strings ('HL_API_ERROR') not valid ChainErrorCode values
- **Fix:** Mapped to existing codes: ACTION_API_ERROR, ACTION_RATE_LIMITED, ACTION_API_TIMEOUT

**2. [Rule 1 - Bug] Fixed ChainError constructor signature**
- **Found during:** Task 1 typecheck
- **Issue:** Called as (code, message, options) but actual signature is (code, chain, options)
- **Fix:** Changed to (code, 'HYPERLIQUID', { message: ... })

**3. [Rule 1 - Bug] Fixed Stage 5 ApiDirectResult status values**
- **Found during:** Task 2 typecheck
- **Issue:** Used 'COMPLETED' status and 'TX_COMPLETED' event which don't exist
- **Fix:** Changed to 'CONFIRMED' and 'TX_CONFIRMED', removed non-existent 'completedAt'

**4. [Rule 3 - Blocking] Fixed ApiDirectResult in action routes**
- **Found during:** Task 2 typecheck
- **Issue:** executeResolve return type now includes ApiDirectResult, breaking contractCall assignment
- **Fix:** Added isApiDirectResult check in actions.ts and admin-actions.ts

---
*Phase: 349-core-infra-perp*
*Completed: 2026-03-08*
