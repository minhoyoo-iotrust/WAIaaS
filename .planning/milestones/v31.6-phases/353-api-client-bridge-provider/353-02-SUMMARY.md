---
phase: 353-api-client-bridge-provider
plan: 02
subsystem: defi
tags: [across, bridge, cross-chain, spokepool, depositV3, viem, batch]

requires:
  - phase: 353-01
    provides: AcrossApiClient, Zod schemas, AcrossConfig, chain/address maps
provides:
  - AcrossBridgeActionProvider with 5 actions (quote, execute, status, routes, limits)
  - ERC-20 approve+depositV3 BATCH and native ETH msg.value bridge
  - SpokePool depositV3 calldata encoding via viem encodeFunctionData
  - validateBridgeParams (isAmountTooLow, limits, output > 0)
  - fillDeadline/exclusivity resolution from suggested-fees
  - ACTION_PROVIDER_REGISTRY across_bridge entry
affects: [354, 355, 356]

tech-stack:
  added: []
  patterns: [ApiDirectResult for read-only provider actions, SpokePool ABI encoding via viem]

key-files:
  created:
    - packages/actions/src/providers/across/index.ts
  modified:
    - packages/actions/src/index.ts

key-decisions:
  - "Read-only actions (quote/status/routes/limits) return ApiDirectResult to satisfy IActionProvider interface"
  - "Removed unused clampSlippage -- Across uses outputAmount from fees directly, not slippage percentage"
  - "approve exact inputAmount, not MaxUint256 (Pitfall 10, WAIaaS security principle)"

patterns-established:
  - "SpokePool depositV3 calldata encoding with viem encodeFunctionData and 12 typed parameters"
  - "ApiDirectResult pattern for read-only DeFi query actions"

requirements-completed: [BRG-01, BRG-02, BRG-03, BRG-04, BRG-05, BRG-06, BRG-07]

duration: 8min
completed: 2026-03-09
---

# Phase 353 Plan 02: AcrossBridgeActionProvider Summary

**AcrossBridgeActionProvider with 5 actions: quote/execute (ERC-20 BATCH + native ETH)/status/routes/limits, SpokePool depositV3 ABI encoding, and ACTION_PROVIDER_REGISTRY registration**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-08T16:02:00Z
- **Completed:** 2026-03-08T16:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- AcrossBridgeActionProvider implementing IActionProvider with 5 actions
- execute action produces approve+depositV3 BATCH for ERC-20 or single depositV3 with msg.value for native ETH
- outputAmount calculation via DS-07 (inputAmount - totalRelayFee.total)
- fillDeadline/exclusivity resolution from suggested-fees with late-bind pattern
- validateBridgeParams with 4 checks (isAmountTooLow, output<=input, output>0, limits range)
- ACTION_PROVIDER_REGISTRY across_bridge entry with ACROSS_DEFAULTS fallback

## Task Commits

1. **Task 1: AcrossBridgeActionProvider 5 actions** - `64262afd` (feat)
2. **Task 2: Registry registration** - `64262afd` (feat, same commit)

## Files Created/Modified
- `packages/actions/src/providers/across/index.ts` - AcrossBridgeActionProvider with 5 actions, input schemas, ABI fragments, helper functions
- `packages/actions/src/index.ts` - Import/export Across provider, ACROSS_DEFAULTS, AcrossApiClient + registry entry

## Decisions Made
- Read-only actions (quote, status, routes, limits) return ApiDirectResult instead of ContractCallRequest to satisfy IActionProvider interface union type
- Removed clampSlippage method since Across calculates outputAmount from fees directly (not from user slippage percentage)
- ERC-20 approve uses exact inputAmount per Pitfall 10 and WAIaaS security principle (no MaxUint256)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed IActionProvider return type for read-only actions**
- **Found during:** Task 1 (AcrossBridgeActionProvider implementation)
- **Issue:** IActionProvider.resolve() expects `ContractCallRequest | ContractCallRequest[] | ApiDirectResult`, but read-only actions returned `Record<string, unknown>` which is not in the union
- **Fix:** Changed read-only actions to return ApiDirectResult with `__apiDirect: true` discriminant, wrapping data in the `.data` field
- **Files modified:** index.ts
- **Verification:** TypeScript compiles cleanly

**2. [Rule 1 - Bug] Removed unused clampSlippage causing TS6133**
- **Found during:** Task 1
- **Issue:** clampSlippage declared but never used (Across uses fee-based outputAmount, not slippage)
- **Fix:** Removed the method
- **Files modified:** index.ts
- **Verification:** No more TS6133 warning

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Type system compliance and dead code removal. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AcrossBridgeActionProvider ready for status tracking (Phase 354)
- Registry entry ready for Admin Settings activation (Phase 355)
- All 5 actions type-checked and registered

---
*Phase: 353-api-client-bridge-provider*
*Completed: 2026-03-09*
