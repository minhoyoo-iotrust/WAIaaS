---
phase: 270-lending-framework
plan: 01
subsystem: defi
tags: [lending, interface, zod, policy, health-factor, action-provider]

requires:
  - phase: 268-position-infra-design
    provides: defi_positions table, IPositionProvider, LendingMetadataSchema, PositionTracker
  - phase: 269-defi-monitoring-framework
    provides: IDeFiMonitor, HealthFactorMonitor severity thresholds
provides:
  - ILendingProvider interface (extends IActionProvider, 4 actions, 3 query methods)
  - LendingPositionSummary/HealthFactor/MarketInfo Zod schemas
  - LendingPolicyEvaluator (LENDING_LTV_LIMIT + LENDING_ASSET_WHITELIST)
  - IPositionProvider dual implementation pattern
affects: [270-02, lending-api, aave-v3, kamino, morpho, policy-engine]

tech-stack:
  added: []
  patterns: [ILendingProvider-extends-IActionProvider, dual-interface-implementation, lending-policy-default-deny]

key-files:
  created: []
  modified:
    - internal/objectives/m29-00-defi-advanced-protocol-design.md

key-decisions:
  - "DEC-LEND-01: ILendingProvider extends IActionProvider (not separate interface)"
  - "DEC-LEND-02: 3 query methods on ILendingProvider directly (no service indirection)"
  - "DEC-LEND-03: borrow defaults to interestRateMode=2 (variable)"
  - "DEC-LEND-04: resolve() returns ContractCallRequest | ContractCallRequest[]"
  - "DEC-LEND-05: HealthFactor status maps 1:1 with Phase 269 MonitorSeverity"
  - "DEC-LEND-06: amount fields use string (not bigint)"
  - "DEC-LEND-07: CAIP-19 asset identifiers throughout"
  - "DEC-LEND-08: LENDING_ASSET_WHITELIST is default-deny"
  - "DEC-LEND-09: Lending action identification via ContractCallRequest.metadata"
  - "DEC-LEND-10: LTV check reads from defi_positions cache"
  - "DEC-LEND-11: warningLtv forces DELAY tier (not deny)"

patterns-established:
  - "ILendingProvider extends IActionProvider: lending providers inherit resolve() for 6-stage pipeline"
  - "Dual interface (ILendingProvider + IPositionProvider): same class serves both pipeline and tracker"
  - "Lending default-deny: LENDING_ASSET_WHITELIST required before any lending action allowed"
  - "Policy step 4h: lending policy checks after existing 4a-4g, before SPENDING_LIMIT (step 5)"

requirements-completed: [LEND-01, LEND-02, LEND-03, LEND-04, LEND-05, LEND-06]

duration: 8min
completed: 2026-02-26
---

# Plan 270-01: ILendingProvider Interface + Types + Policy Design Summary

**ILendingProvider interface extending IActionProvider with 4 lending actions, 3 query methods, LendingPosition/HealthFactor/MarketInfo Zod schemas, and LendingPolicyEvaluator with default-deny asset whitelist and LTV limit policies**

## Performance

- **Duration:** 8 min
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Defined ILendingProvider interface extending IActionProvider with supply/borrow/repay/withdraw actions and getPosition/getHealthFactor/getMarkets query methods
- Specified LendingPositionSummary, HealthFactor, MarketInfo Zod schemas with Phase 269-aligned severity thresholds
- Designed LendingPolicyEvaluator with LENDING_LTV_LIMIT (projected LTV computation with warning tier upgrade) and LENDING_ASSET_WHITELIST (default-deny following CONTRACT_WHITELIST pattern)
- Documented dual interface implementation pattern (ILendingProvider + IPositionProvider on same class)
- Recorded 11 design decisions (DEC-LEND-01 through DEC-LEND-11)

## Task Commits

1. **Task 1+2: Sections 13-15 (interface + types + policy)** - `61c57003` (docs)

## Files Created/Modified
- `internal/objectives/m29-00-defi-advanced-protocol-design.md` - Added sections 13, 14, 15 with ILendingProvider interface, Zod schemas, and policy evaluator design

## Decisions Made
Followed plan as specified. 11 design decisions recorded (DEC-LEND-01 through DEC-LEND-11).

## Deviations from Plan
None - plan executed as specified. Both tasks committed together since they modify the same file contiguously.

## Issues Encountered
None

## Next Phase Readiness
- Sections 13-15 complete, ready for Plan 270-02 (REST API + protocol mapping sections 16-17)
- ILendingProvider interface fully specified for Aave V3/Kamino/Morpho mapping

---
*Phase: 270-lending-framework*
*Completed: 2026-02-26*
