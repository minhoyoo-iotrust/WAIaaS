---
phase: 297-perp-framework
plan: 01
subsystem: defi
tags: [perp, zod, interface, policy, event-bus, drift]

# Dependency graph
requires:
  - phase: 275-lending-framework-services
    provides: "ILendingProvider pattern, NON_SPENDING_ACTIONS, LendingAssetWhitelistRules"
  - phase: 288-yield-framework
    provides: "IYieldProvider pattern, YieldMaturityWarningEvent"
provides:
  - "IPerpProvider interface extending IActionProvider"
  - "PerpPositionSummarySchema, MarginInfoSchema, PerpMarketInfoSchema Zod SSoT"
  - "MarginWarningEvent + WaiaasEventMap 'perp:margin-warning'"
  - "PERP_MAX_LEVERAGE, PERP_MAX_POSITION_USD, PERP_ALLOWED_MARKETS policy types"
  - "TransactionParam perpLeverage/perpSizeUsd fields"
  - "PerpMaxLeverageRules, PerpMaxPositionUsdRules, PerpAllowedMarketsRules interfaces"
affects: [297-02-PLAN, 298-drift-provider, 299-perp-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [IPerpProvider extends IActionProvider, perp non-spending classification]

key-files:
  created:
    - packages/core/src/interfaces/perp-provider.types.ts
    - packages/daemon/src/__tests__/perp-provider-types.test.ts
  modified:
    - packages/core/src/interfaces/index.ts
    - packages/core/src/index.ts
    - packages/core/src/events/event-types.ts
    - packages/core/src/events/index.ts
    - packages/core/src/enums/policy.ts
    - packages/daemon/src/pipeline/database-policy-engine.ts

key-decisions:
  - "Exported PerpMaxLeverageRules/PerpMaxPositionUsdRules/PerpAllowedMarketsRules to satisfy noUnusedLocals (Plan 02 will consume)"
  - "close_position and add_margin classified as NON_SPENDING (returns user's own funds)"

patterns-established:
  - "IPerpProvider follows ILendingProvider/IYieldProvider pattern: extends IActionProvider + domain query methods"
  - "Perp Zod schemas use string for size (bigint-safe) and nullable for optional numeric fields"

requirements-completed: [PERP-01, PERP-02]

# Metrics
duration: 6min
completed: 2026-03-02
---

# Phase 297 Plan 01: IPerpProvider Interface + Zod Schemas Summary

**IPerpProvider interface with 3 Zod SSoT schemas, MarginWarningEvent, 3 perp policy types, and TransactionParam extensions for perp framework**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-01T15:19:17Z
- **Completed:** 2026-03-01T15:25:37Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- IPerpProvider interface extending IActionProvider with getPosition/getMarginInfo/getMarkets query methods
- 3 Zod SSoT schemas (PerpPositionSummary, MarginInfo, PerpMarketInfo) fully exported from @waiaas/core
- MarginWarningEvent registered in WaiaasEventMap for type-safe EventBus emission
- POLICY_TYPES extended with PERP_MAX_LEVERAGE, PERP_MAX_POSITION_USD, PERP_ALLOWED_MARKETS (DB CHECK constraint verified)
- close_position and add_margin classified as NON_SPENDING_ACTIONS in DatabasePolicyEngine
- 18 unit tests covering schemas, policy types, DB constraints, and non-spending classification

## Task Commits

Each task was committed atomically:

1. **Task 1: IPerpProvider interface + Zod schemas** - `774e9aaf` (feat)
2. **Task 2: Event types + policy types + TransactionParam extensions** - `4fd7528e` (feat)
3. **Task 3: Perp type unit tests** - `e9a37aa8` (test)

## Files Created/Modified
- `packages/core/src/interfaces/perp-provider.types.ts` - IPerpProvider interface + 3 Zod schemas (new)
- `packages/core/src/interfaces/index.ts` - Re-exports for perp provider types
- `packages/core/src/index.ts` - Barrel exports for perp types and MarginWarningEvent
- `packages/core/src/events/event-types.ts` - MarginWarningEvent + WaiaasEventMap entry
- `packages/core/src/events/index.ts` - Re-export MarginWarningEvent
- `packages/core/src/enums/policy.ts` - 3 PERP policy types added to POLICY_TYPES
- `packages/daemon/src/pipeline/database-policy-engine.ts` - TransactionParam extensions, NON_SPENDING_ACTIONS, perp rules interfaces
- `packages/daemon/src/__tests__/perp-provider-types.test.ts` - 18 unit tests (new)

## Decisions Made
- Exported PerpMaxLeverageRules/PerpMaxPositionUsdRules/PerpAllowedMarketsRules as `export interface` to satisfy TypeScript `noUnusedLocals: true` -- Plan 02 will consume these when implementing PerpPolicyEvaluator
- close_position and add_margin classified as non-spending because they return the user's own capital or add margin to existing positions (same rationale as lending supply/repay/withdraw)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added barrel exports in core/index.ts and events/index.ts**
- **Found during:** Task 3 (Unit tests)
- **Issue:** Plan specified adding types/schemas to interfaces/index.ts but not to the main core/src/index.ts barrel or events/index.ts barrel. Tests importing from `@waiaas/core` got `undefined` for MarginInfoSchema and PerpMarketInfoSchema.
- **Fix:** Added perp type exports to core/src/index.ts (type + value exports) and MarginWarningEvent to events/index.ts
- **Files modified:** packages/core/src/index.ts, packages/core/src/events/index.ts
- **Verification:** All 18 tests pass, typecheck clean
- **Committed in:** e9a37aa8 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix for correct module resolution. No scope creep.

## Issues Encountered
None beyond the barrel export deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- IPerpProvider interface ready for DriftPerpProvider implementation (Phase 298)
- MarginWarningEvent ready for MarginMonitor to emit (Plan 297-02)
- Perp policy types ready for PerpPolicyEvaluator evaluation logic (Plan 297-02)
- TransactionParam extensions ready for ActionProviderRegistry to populate perpLeverage/perpSizeUsd

---
*Phase: 297-perp-framework*
*Completed: 2026-03-02*
