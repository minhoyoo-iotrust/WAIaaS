---
phase: 349-core-infra-perp
plan: 03
subsystem: actions
tags: [hyperliquid, perp-provider, action-provider, eip712, iperprovider]

requires:
  - phase: 349-02
    provides: Signer, ExchangeClient, MarketData, schemas
  - phase: 349-01
    provides: ApiDirectResult type
provides:
  - HyperliquidPerpProvider with 7 actions (IPerpProvider implementation)
  - Registered as built-in provider with settings-driven configuration
  - getSpendingAmount for margin-based policy evaluation
  - IPerpProvider query methods (getPosition, getMarginInfo, getMarkets)
affects: [349-04, 349-05, 350, 351]

tech-stack:
  added: []
  patterns: [ApiDirectResult provider, margin-based spending, settings-driven factory]

key-files:
  created:
    - packages/actions/src/providers/hyperliquid/perp-provider.ts
    - packages/actions/src/providers/hyperliquid/__tests__/perp-provider.test.ts
  modified:
    - packages/actions/src/providers/hyperliquid/index.ts
    - packages/actions/src/index.ts

key-decisions:
  - "requiresSigningKey: true triggers key decryption before resolve()"
  - "mcpExpose: true auto-registers 7 action tools via provider system"
  - "getSpendingAmount uses margin (size*price/leverage) not notional for opens"
  - "Close/cancel actions return $0 spending (policy-exempt)"
  - "createHyperliquidClient takes direct params (not ESM-incompatible require)"

requirements-completed: [HPERP-01, HPERP-02, HPERP-03, HPERP-04, HPERP-05, HPERP-06, HPERP-07, HPERP-09, HPERP-10, HPERP-11, HPOL-02]

duration: 25min
completed: 2026-03-08
---

# Phase 349 Plan 03: HyperliquidPerpProvider Summary

**IPerpProvider with 7 actions, margin-based policy evaluation, and built-in provider registration with settings-driven configuration**

## Performance

- **Duration:** 25 min
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 2

## Accomplishments
- HyperliquidPerpProvider: 7 actions (open_position, close_position, place_order, cancel_order, set_leverage, set_margin_mode, transfer_usdc)
- All actions sign via HyperliquidSigner and submit via ExchangeClient, returning ApiDirectResult
- IPerpProvider queries: getPosition, getMarginInfo (with margin ratio status), getMarkets
- getSpendingAmount: margin = size*price/leverage for opens, $0 for closes/cancels
- Registered in registerBuiltInProviders with settings keys for enabled/network/api_url
- 30 tests covering all actions, spending amounts, and IPerpProvider queries

## Task Commits

1. **Task 1: HyperliquidPerpProvider implementation** - `25fb2c79` (feat)
2. **Task 2: Register provider in built-in providers** - `6fb1cbea` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed HL_DEFAULTS.LEVERAGE field name**
- **Found during:** Task 1 test
- **Issue:** Code used HL_DEFAULTS.DEFAULT_LEVERAGE which doesn't exist (actual: LEVERAGE)
- **Fix:** Changed to HL_DEFAULTS.LEVERAGE

**2. [Rule 1 - Bug] Fixed marginRatio status threshold**
- **Found during:** Task 1 test
- **Issue:** marginRatio 0.30 mapped to 'safe' but threshold is <= 0.30 = 'warning'
- **Fix:** Updated test expectation

**3. [Rule 3 - Blocking] Fixed createHyperliquidClient ESM compatibility**
- **Found during:** Task 2 typecheck
- **Issue:** Factory used require('./config.js') which is ESM-incompatible
- **Fix:** Changed to accept direct params (apiUrl, rateLimiter, timeoutMs)

---
*Phase: 349-core-infra-perp*
*Completed: 2026-03-08*
