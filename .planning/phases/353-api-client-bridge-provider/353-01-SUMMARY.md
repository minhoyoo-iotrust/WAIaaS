---
phase: 353-api-client-bridge-provider
plan: 01
subsystem: defi
tags: [across, bridge, cross-chain, zod, api-client, viem]

requires:
  - phase: 352-research-design
    provides: Design doc 79 with Across API specs, Zod schemas, chain/address maps
provides:
  - AcrossApiClient wrapping 5 Across REST API endpoints with Zod validation
  - Zod schemas for suggested-fees, limits, routes, deposit/status, swap/approval
  - AcrossConfig interface and ACROSS_DEFAULTS
  - ACROSS_CHAIN_MAP (6 EVM chains), SPOKE_POOL_ADDRESSES, WETH_ADDRESSES
  - getAcrossChainId, getSpokePoolAddress, getWethAddress, isNativeTokenBridge helpers
affects: [353-02, 354, 355, 356]

tech-stack:
  added: []
  patterns: [ActionApiClient extension for protocol-specific REST API wrapping]

key-files:
  created:
    - packages/actions/src/providers/across/schemas.ts
    - packages/actions/src/providers/across/config.ts
    - packages/actions/src/providers/across/across-api-client.ts
  modified: []

key-decisions:
  - "AcrossSwapApprovalResponseSchema: removed .default([]) from approvalTxns to fix Zod input/output type mismatch with ActionApiClient.get<T>"

patterns-established:
  - "Across API client follows LI.FI precedent: ActionApiClient extend + Zod schema validation + config separation"

requirements-completed: [API-01, API-02, API-03, API-04, API-05]

duration: 5min
completed: 2026-03-09
---

# Phase 353 Plan 01: AcrossApiClient + Zod Schemas + AcrossConfig Summary

**AcrossApiClient wrapping 5 Across REST API endpoints (suggested-fees/limits/routes/status/swap-approval) with Zod runtime validation, 6-chain address maps, and ActionApiClient inheritance**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-08T15:56:52Z
- **Completed:** 2026-03-08T16:02:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 5 Zod schemas for all Across REST API endpoint responses with .passthrough() for forward compatibility
- AcrossConfig with ACROSS_DEFAULTS (6h fillDeadline, 1% default slippage, 10s timeout)
- Chain ID mapping for 6 EVM chains (ethereum, arbitrum, optimism, base, polygon, linea) with -mainnet variants
- SpokePool proxy addresses and WETH addresses from design doc 79
- AcrossApiClient with typed methods and no-cache semantics for suggested-fees/swap-approval

## Task Commits

1. **Task 1+2: Zod schemas + AcrossConfig + AcrossApiClient** - `03e4b78e` (feat)

## Files Created/Modified
- `packages/actions/src/providers/across/schemas.ts` - Zod schemas for 5 Across API endpoints
- `packages/actions/src/providers/across/config.ts` - AcrossConfig, ACROSS_DEFAULTS, chain/address maps, helper functions
- `packages/actions/src/providers/across/across-api-client.ts` - HTTP client wrapping 5 endpoints with Zod validation

## Decisions Made
- Removed `.default([])` from `approvalTxns` in AcrossSwapApprovalResponseSchema to fix Zod type inference mismatch with `ActionApiClient.get<T>()` generic constraint (used `.optional()` instead)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Zod schema type inference for swap/approval endpoint**
- **Found during:** Task 2 (AcrossApiClient implementation)
- **Issue:** `z.optional().default([])` creates different input/output types in Zod, causing TypeScript error with `ActionApiClient.get<T>` which expects `z.ZodType<T>`
- **Fix:** Changed to `.optional()` without `.default([])`
- **Files modified:** schemas.ts
- **Verification:** `npx tsc --project packages/actions/tsconfig.json --noEmit` passes cleanly

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor schema adjustment for type safety. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AcrossApiClient ready for AcrossBridgeActionProvider to consume in Plan 353-02
- All schemas, config, chain maps, and helper functions exported and type-checked

---
*Phase: 353-api-client-bridge-provider*
*Completed: 2026-03-09*
