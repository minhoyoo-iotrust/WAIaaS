---
phase: 272-perp-framework
plan: 01
subsystem: defi
tags: [perp, IPerpProvider, IActionProvider, zod, leverage, margin, policy, drift]

# Dependency graph
requires:
  - phase: 268-position-infra-design
    provides: defi_positions table, IPositionProvider, PerpMetadataSchema, PositionTracker
  - phase: 269-defi-monitoring-framework
    provides: IDeFiMonitor, MarginMonitor severity thresholds
  - phase: 270-lending-framework
    provides: ILendingProvider pattern (sections 13-15), LendingPolicyEvaluator pattern
  - phase: 271-yield-framework
    provides: IYieldProvider pattern (sections 18-19), ActionDefinition schema pattern
provides:
  - IPerpProvider interface (extends IActionProvider, 5 actions, 3 query methods)
  - PerpPositionSummary/MarginInfo/PerpMarketInfo Zod schemas
  - PerpPolicyEvaluator (PERP_LEVERAGE_LIMIT + PERP_POSITION_SIZE_LIMIT + PERP_MARKET_WHITELIST)
  - IPositionProvider dual implementation pattern for perp providers
affects: [272-02, perp-api, drift-provider, policy-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: [IPerpProvider-extends-IActionProvider, dual-interface-implementation, perp-policy-default-deny, cross-margin-account-level-checks]

key-files:
  created: []
  modified:
    - internal/objectives/m29-00-defi-advanced-protocol-design.md

key-decisions:
  - "DEC-PERP-01: IPerpProvider extends IActionProvider (same pattern as ILendingProvider/IYieldProvider)"
  - "DEC-PERP-02: 3 query methods on IPerpProvider directly (no service indirection)"
  - "DEC-PERP-03: open_position/modify_position riskLevel: high, add_margin riskLevel: low"
  - "DEC-PERP-04: MarginInfo is account-level aggregate (cross-margin model)"
  - "DEC-PERP-05: leverage param is optional (account-level determined by position size vs collateral)"
  - "DEC-PERP-06: Perp action identification via ContractCallRequest.metadata (DEC-LEND-09 pattern)"
  - "DEC-PERP-07: PerpPositionSummary is superset of DB PerpMetadataSchema (DEC-YIELD-05 pattern)"
  - "DEC-PERP-08: MarginInfo is account-level aggregate only (cross-margin)"
  - "DEC-PERP-09: PERP_MARKET_WHITELIST is default-deny (DEC-LEND-08 pattern)"
  - "DEC-PERP-10: PERP_LEVERAGE_LIMIT checks account-level leverage"
  - "DEC-PERP-11: warningLeverage forces DELAY tier (DEC-LEND-11 pattern)"
  - "DEC-PERP-12: Amount fields use string for JSON serialization (DEC-LEND-06 pattern)"
  - "DEC-PERP-13: CAIP-19 for all asset identifiers (DEC-LEND-07/DEC-YIELD-08 pattern)"

patterns-established:
  - "IPerpProvider extends IActionProvider: perp providers inherit resolve() for 6-stage pipeline"
  - "Dual interface (IPerpProvider + IPositionProvider): same class serves both pipeline and tracker"
  - "Perp default-deny: PERP_MARKET_WHITELIST required before any perp action allowed"
  - "Cross-margin account-level checks: PERP_LEVERAGE_LIMIT checks account leverage, not per-position"
  - "Policy step 4h-c~e: perp policies after lending (4h-a, 4h-b), before SPENDING_LIMIT (step 5)"

requirements-completed: [PERP-01, PERP-02, PERP-03, PERP-04, PERP-05, PERP-06]

duration: 6min
completed: 2026-02-26
---

# Plan 272-01: IPerpProvider Interface + Types + PerpPolicyEvaluator Summary

**IPerpProvider interface with 5 perp actions (open/close/modify position, add/withdraw margin), 3 query methods, PerpPositionSummary/MarginInfo/PerpMarketInfo Zod schemas, and PerpPolicyEvaluator with 3 default-deny policy types added to m29-00 sections 21-22**

## Performance

- **Duration:** 6 min
- **Completed:** 2026-02-26
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Defined IPerpProvider interface extending IActionProvider with open_position/close_position/modify_position/add_margin/withdraw_margin actions and getPosition/getMarginInfo/getMarkets query methods
- Specified 5 Zod input schemas for perp actions with .describe() annotations for AI agent consumption
- Designed PerpPositionSummary (API superset of DB PerpMetadataSchema), MarginInfo (account-level aggregate for cross-margin), and PerpMarketInfo types
- Designed PerpPolicyEvaluator with PERP_LEVERAGE_LIMIT (account-level with warning tier), PERP_POSITION_SIZE_LIMIT (per-market + total USD), and PERP_MARKET_WHITELIST (default-deny)
- Documented IPositionProvider dual interface pattern for DriftProvider
- Recorded 13 design decisions (DEC-PERP-01 through DEC-PERP-13)

## Task Commits

1. **Task 1+2: Sections 21-22 (interface + types + policy)** - `a2e5db35` (docs)

## Files Created/Modified
- `internal/objectives/m29-00-defi-advanced-protocol-design.md` - Added sections 21, 22 with IPerpProvider interface, Zod schemas, and policy evaluator design

## Decisions Made
Followed plan as specified. 13 design decisions recorded (DEC-PERP-01 through DEC-PERP-13).

## Deviations from Plan
None - plan executed as specified. Both tasks committed together since they modify the same file contiguously.

## Issues Encountered
None

## Next Phase Readiness
- Sections 21-22 complete, ready for Plan 272-02 (MarginMonitor integration + Drift protocol mapping, section 23)
- IPerpProvider interface fully specified for Drift V2 implementation mapping

---
*Phase: 272-perp-framework*
*Completed: 2026-02-26*
