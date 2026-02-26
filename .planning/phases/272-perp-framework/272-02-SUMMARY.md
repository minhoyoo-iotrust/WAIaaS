---
phase: 272-perp-framework
plan: 02
subsystem: defi
tags: [perp, drift, MarginMonitor, protocol-mapping, cross-margin, monitoring, data-flow]

# Dependency graph
requires:
  - phase: 272-perp-framework
    provides: IPerpProvider interface (sections 21-22), PerpPolicyEvaluator (section 22.4)
  - phase: 268-position-infra-design
    provides: PerpMetadataSchema (section 5.3), PositionTracker, defi_positions table
  - phase: 269-defi-monitoring-framework
    provides: MarginMonitor design (section 10.3), IDeFiMonitor interface, DeFiMonitorService
  - phase: 270-lending-framework
    provides: Protocol mapping pattern (section 17), LendingPolicyEvaluator pattern (section 15)
  - phase: 271-yield-framework
    provides: MaturityMonitor integration pattern (section 20.1), Pendle mapping pattern (section 20.3)
provides:
  - PerpPolicyEvaluator step 4h-c~e evaluation flow specification
  - MarginMonitor <> IPerpProvider 5-stage data flow with completeness verification
  - Drift V2 protocol mapping tables (5 actions + 3 queries -> SDK methods)
  - Order-based to position-based abstraction documentation
  - Cross-protocol comparison (Drift vs Aave vs Pendle)
  - 5 design decisions (DEC-PERP-14 through DEC-PERP-18)
affects: [m29-08-drift-implementation, policy-engine, monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns: [MarginMonitor-DB-cache-read, order-to-position-abstraction, on-demand-sync-for-DANGER]

key-files:
  created: []
  modified:
    - internal/objectives/m29-00-defi-advanced-protocol-design.md

key-decisions:
  - "DEC-PERP-14: @drift-labs/sdk as primary integration path (not Gateway)"
  - "DEC-PERP-15: Sub-account 0 only for v29-08, extensibility preserved"
  - "DEC-PERP-16: IPerpProvider abstracts order-based model into position-based semantics"
  - "DEC-PERP-17: PerpMetadataSchema unchanged, Drift-specific via metadata JSON passthrough"
  - "DEC-PERP-18: DriftProvider chains=['solana'] only"

patterns-established:
  - "MarginMonitor reads DB cache only (DEC-MON-03), never DriftProvider directly"
  - "DANGER/CRITICAL triggers on-demand PositionTracker.syncCategory('PERP') (DEC-MON-04 pattern)"
  - "Order-based to position-based abstraction: AI agents think positions, Drift SDK thinks orders"
  - "Cross-protocol comparison: standardized 10-dimension table for Drift vs Aave vs Pendle"

requirements-completed: [PERP-07]

duration: 5min
completed: 2026-02-26
---

# Plan 272-02: MarginMonitor Integration + Drift V2 Protocol Mapping Summary

**MarginMonitor 5-stage data flow from DriftProvider through PositionTracker to DB cache, PerpMetadataSchema completeness verification (7 fields all sufficient), Drift V2 SDK mapping tables (5 actions + 3 queries), and cross-protocol comparison added to m29-00 section 23**

## Performance

- **Duration:** 5 min
- **Completed:** 2026-02-26
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Specified PerpPolicyEvaluator step 4h-c~e evaluation pipeline with perp action identification flow
- Designed MarginMonitor <> IPerpProvider 5-stage data flow (DriftProvider -> PositionTracker -> defi_positions -> MarginMonitor -> notification) with ASCII architecture diagram
- Verified PerpMetadataSchema completeness: all 7 fields sufficient for MarginMonitor.evaluate() consumption, no schema changes needed
- Created complete Drift V2 SDK mapping tables: 5 actions (placePerpOrder, closePosition, modifyPerpOrder, deposit, withdraw) and 3 queries (getPerpPosition, margin methods, getPerpMarketAccounts)
- Documented order-based to position-based abstraction (Drift's unique order model hidden from AI agents)
- Created cross-protocol comparison table across 10 dimensions (Drift vs Aave vs Pendle)
- Recorded 5 design decisions (DEC-PERP-14 through DEC-PERP-18)

## Task Commits

1. **Task 1+2: Section 23 (integration + mapping)** - `4b0f5ec8` (docs)

## Files Created/Modified
- `internal/objectives/m29-00-defi-advanced-protocol-design.md` - Added section 23 with MarginMonitor data flow, PerpMetadata verification, Drift mapping, cross-protocol comparison

## Decisions Made
Followed plan as specified. 5 design decisions recorded (DEC-PERP-14 through DEC-PERP-18). Phase 272 total: 18 design decisions.

## Deviations from Plan
None - plan executed as specified. Both tasks committed together since they modify the same section contiguously.

## Issues Encountered
None

## Next Phase Readiness
- Sections 21-23 complete, IPerpProvider framework design finished
- Ready for Phase 273 (Intent signing pattern design) or m29-08 (Drift implementation)
- All 3 frameworks (Lending/Yield/Perp) now fully designed in m29-00

---
*Phase: 272-perp-framework*
*Completed: 2026-02-26*
