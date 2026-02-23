---
phase: 249-0x-swap-provider
plan: 01
subsystem: api
tags: [0x, swap, evm, zod, msw, defi, allowance-holder]

# Dependency graph
requires:
  - phase: 248-provider-infrastructure
    provides: ActionApiClient base class, IActionProvider interface, SettingsReader
provides:
  - ZeroExApiClient extending ActionApiClient with 0x-api-key + 0x-version headers
  - PriceResponseSchema + QuoteResponseSchema (Zod validated, .passthrough())
  - ZeroExSwapConfig type + ZEROX_SWAP_DEFAULTS
  - ALLOWANCE_HOLDER_ADDRESSES map (20 chains)
  - getAllowanceHolderAddress() helper
  - CHAIN_ID_MAP (WAIaaS network names -> EVM chain IDs)
affects: [249-02-PLAN (ZeroExSwapActionProvider), daemon registration]

# Tech tracking
tech-stack:
  added: []
  patterns: [0x API v2 AllowanceHolder flow, chainId query param pattern]

key-files:
  created:
    - packages/actions/src/providers/zerox-swap/config.ts
    - packages/actions/src/providers/zerox-swap/schemas.ts
    - packages/actions/src/providers/zerox-swap/zerox-api-client.ts
    - packages/actions/src/__tests__/zerox-api-client.test.ts
  modified: []

key-decisions:
  - "AllowanceHolder address is identical across all 20 supported chains -- single constant with Map lookup"
  - "CHAIN_ID_MAP only maps mainnet EVM networks that exist in NETWORK_TYPES (5 networks)"
  - "PriceResponseSchema uses .passthrough() to tolerate API field additions without breaking"

patterns-established:
  - "0x API client pattern: constructor(config, chainId) with chainId as query param on every request"
  - "AllowanceHolder address validation: getAllowanceHolderAddress() throws on unsupported chain"

requirements-completed: [ZXSW-01, ZXSW-02, ZXSW-03, ZXSW-08, ZXSW-09, ZXSW-10]

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 249 Plan 01: 0x API Client Summary

**ZeroExApiClient with Zod-validated price/quote responses, AllowanceHolder address mapping for 20 EVM chains, and 19 MSW-based unit tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-23T14:30:09Z
- **Completed:** 2026-02-23T14:33:19Z
- **Tasks:** 2
- **Files created:** 4

## Accomplishments
- ZeroExApiClient extending ActionApiClient with 0x-api-key header, 0x-version: v2 header, and chainId query parameter
- PriceResponseSchema + QuoteResponseSchema with Zod .passthrough() for API drift tolerance
- ALLOWANCE_HOLDER_ADDRESSES map covering all 20 0x-supported chains (Cancun 19 + Mantle)
- 19 unit tests passing with MSW covering all 6 assigned requirements (ZXSW-01/02/03/08/09/10)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create config, Zod schemas, and ZeroExApiClient** - `7690aeaa` (feat)
2. **Task 2: ZeroExApiClient TDD tests with MSW** - `a48f98b8` (test)

## Files Created/Modified
- `packages/actions/src/providers/zerox-swap/config.ts` - ZeroExSwapConfig type, ZEROX_SWAP_DEFAULTS, ALLOWANCE_HOLDER_ADDRESSES (20 chains), CHAIN_ID_MAP, getAllowanceHolderAddress()
- `packages/actions/src/providers/zerox-swap/schemas.ts` - PriceResponseSchema + QuoteResponseSchema (Zod v2 response validation)
- `packages/actions/src/providers/zerox-swap/zerox-api-client.ts` - ZeroExApiClient extending ActionApiClient with getPrice() and getQuote()
- `packages/actions/src/__tests__/zerox-api-client.test.ts` - 19 MSW-based tests covering headers, Zod validation, errors, timeout, AllowanceHolder mapping

## Decisions Made
- AllowanceHolder address is identical across all 20 supported chains -- used single constant with Map lookup instead of per-chain addresses
- CHAIN_ID_MAP only maps 5 mainnet EVM networks that exist in WAIaaS NETWORK_TYPES (ethereum, polygon, arbitrum, optimism, base)
- PriceResponseSchema uses .passthrough() to tolerate API field additions without breaking validation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ZeroExApiClient ready for ZeroExSwapActionProvider (Plan 02) to build on top of
- Config types ready for daemon settings integration
- AllowanceHolder address map available for transaction.to validation in provider safety checks

## Self-Check: PASSED

All 4 created files verified on disk. Both commit hashes (7690aeaa, a48f98b8) verified in git log.

---
*Phase: 249-0x-swap-provider*
*Completed: 2026-02-23*
