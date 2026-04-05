---
phase: 271-yield-framework
plan: 01
subsystem: design
tags: [yield, pendle, IYieldProvider, IActionProvider, zod, maturity, PT, YT, LP]

# Dependency graph
requires:
  - phase: 268-position-infra-design
    provides: YieldMetadataSchema, defi_positions table, IPositionProvider interface
  - phase: 269-defi-monitoring-framework
    provides: MaturityMonitor design (section 10.2), MonitorSeverity 3-tier
  - phase: 270-lending-framework
    provides: ILendingProvider pattern (sections 13-14), ActionDefinition schema pattern
provides:
  - IYieldProvider interface (extends IActionProvider, 5 actions, 3 query methods)
  - YieldPositionSummary Zod schema (API response)
  - MaturityInfo type (maturity status with warning levels)
  - YieldMarketInfo type (market listing for AI agents)
  - YieldForecast type (current market yield data)
  - 5 ActionDefinition input schemas (BuyPT/BuyYT/RedeemPT/AddLiquidity/RemoveLiquidity)
  - IPositionProvider dual implementation pattern for yield providers
  - 8 design decisions (DEC-YIELD-01 through DEC-YIELD-08)
affects: [272-perp-framework, m29-06-pendle-implementation]

# Tech tracking
tech-stack:
  added: []
  patterns: [IYieldProvider extends IActionProvider, yield dual interface pattern, MaturityInfo warning level mapping]

key-files:
  created: []
  modified:
    - internal/objectives/m29-00-defi-advanced-protocol-design.md

key-decisions:
  - "DEC-YIELD-01: IYieldProvider extends IActionProvider (ILendingProvider same pattern)"
  - "DEC-YIELD-02: 3 query methods directly on IYieldProvider (no service indirection)"
  - "DEC-YIELD-03: Single redeem_pt action handles both pre/post-maturity (5 not 6 actions)"
  - "DEC-YIELD-04: buy_yt riskLevel: high (YT value approaches 0 at maturity)"
  - "DEC-YIELD-05: YieldPositionSummary is superset of DB YieldMetadataSchema"
  - "DEC-YIELD-06: MaturityInfo.warningLevel maps 1:1 to MaturityMonitor severity"
  - "DEC-YIELD-07: YieldForecast is current market data query, not prediction model"
  - "DEC-YIELD-08: All asset identifiers use CAIP-19 format"

patterns-established:
  - "IYieldProvider interface pattern: extends IActionProvider + 3 query methods (mirrors ILendingProvider)"
  - "MaturityInfo warning level: NONE/WARNING_7D/WARNING_1D/EXPIRED_UNREDEEMED maps to monitor severity"
  - "YieldPositionSummary: DB metadata superset with human-readable fields added at API response time"

requirements-completed: [YIELD-01, YIELD-02, YIELD-03, YIELD-04]

# Metrics
duration: 8min
completed: 2026-02-26
---

# Phase 271-01: IYieldProvider Interface + Yield Type System Summary

**IYieldProvider interface with 5 yield actions (buyPT/buyYT/redeemPT/addLiquidity/removeLiquidity), 3 query methods, and 4 Zod type schemas (YieldPositionSummary, MaturityInfo, YieldMarketInfo, YieldForecast) added to m29-00 design doc sections 18-19**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Defined IYieldProvider interface extending IActionProvider with 5 yield-specific actions and 3 query methods (sections 18.1-18.2)
- Specified 5 Zod input schemas for yield actions with full field documentation
- Established IPositionProvider dual implementation pattern for yield providers (section 18.3)
- Defined 4 API-response Zod types: YieldPositionSummary, MaturityInfo, YieldMarketInfo, YieldForecast (section 19)
- Documented DB YieldMetadataSchema to API YieldPositionSummary mapping with field-level traceability
- Mapped MaturityInfo.warningLevel to Phase 269 MaturityMonitor 3-tier severity
- Recorded 8 design decisions (DEC-YIELD-01 through DEC-YIELD-08)

## Task Commits

1. **Task 1+2: IYieldProvider interface + Yield type system** - `dc012ce6` (docs)

## Files Created/Modified
- `internal/objectives/m29-00-defi-advanced-protocol-design.md` - Added sections 18-19 (IYieldProvider interface + Yield types)

## Decisions Made
- Followed ILendingProvider pattern exactly for interface structure (DEC-YIELD-01~02)
- Unified pre/post-maturity redemption into single redeem_pt action (DEC-YIELD-03)
- Classified buy_yt as high risk due to YT value decay characteristic (DEC-YIELD-04)
- YieldPositionSummary designed as superset of DB schema with runtime-computed fields (DEC-YIELD-05)
- Direct 1:1 mapping between MaturityInfo.warningLevel and MaturityMonitor severity (DEC-YIELD-06)
- YieldForecast kept as simple data query, not prediction model (DEC-YIELD-07)
- CAIP-19 for all asset identifiers, consistent with lending framework (DEC-YIELD-08)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sections 18-19 complete, ready for plan 271-02 (MaturityMonitor integration + Pendle mapping, section 20)
- IYieldProvider interface ready for Pendle V2 implementation reference (m29-06)

---
*Phase: 271-yield-framework*
*Completed: 2026-02-26*
