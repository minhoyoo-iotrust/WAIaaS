---
phase: 269-defi-monitoring-framework
plan: 01
subsystem: monitoring
tags: [defi, monitor, health-factor, maturity, margin, polling, interface]

requires:
  - phase: 268-position-infra-design
    provides: defi_positions table schema, PositionTracker service, Zod position schemas
provides:
  - IDeFiMonitor interface (6 members) with MonitorSeverity 4-level type
  - DeFiMonitorService orchestrator (register/start/stop/updateConfig)
  - HealthFactorMonitor adaptive polling design (5min→5sec via recursive setTimeout)
  - MaturityMonitor fixed 24h polling design for yield position maturity
  - MarginMonitor fixed 1min polling with dual margin ratio + liquidation price checks
  - severityRank utility function
  - 8 design decisions (DEC-MON-01 through DEC-MON-08)
affects: [269-02, 270-lending, 271-yield, 272-perp, m29-02-implementation]

tech-stack:
  added: []
  patterns:
    - "IDeFiMonitor interface: 6-member contract for DeFi position risk monitors"
    - "Adaptive polling: recursive setTimeout for dynamic interval adjustment based on risk severity"
    - "DeFiMonitorService: orchestrator pattern managing multiple monitor instances"

key-files:
  created: []
  modified:
    - internal/objectives/m29-00-defi-advanced-protocol-design.md

key-decisions:
  - "DEC-MON-01: IDeFiMonitor does not extend IActionProvider — monitoring and actions are independent concerns"
  - "DEC-MON-02: DeFiMonitorService operates in parallel with BalanceMonitorService, does not replace it"
  - "DEC-MON-03: Monitors read from defi_positions table cache, never make direct RPC calls"
  - "DEC-MON-04: HealthFactorMonitor triggers on-demand PositionTracker sync when entering DANGER/CRITICAL"
  - "DEC-MON-05: Only HealthFactorMonitor uses adaptive polling; Maturity and Margin use fixed intervals"
  - "DEC-MON-06: MaturityMonitor CRITICAL uses MATURITY_WARNING event, not LIQUIDATION_IMMINENT"
  - "DEC-MON-07: MarginMonitor uses dual margin ratio + liquidation price check for conservative safety"
  - "DEC-MON-08: CRITICAL alerts have no cooldown — repeated alerts for imminent danger are justified"

patterns-established:
  - "IDeFiMonitor interface: common contract enabling generic monitor management"
  - "Adaptive polling via recursive setTimeout: interval changes dynamically based on worst severity"
  - "Per-position cooldown map: composite key walletId:positionId for DeFi alert deduplication"

requirements-completed: [MON-01, MON-02, MON-03, MON-04]

duration: 12min
completed: 2026-02-26
---

# Plan 269-01 Summary

**IDeFiMonitor interface with adaptive polling HealthFactorMonitor, daily MaturityMonitor, and minute-interval MarginMonitor — all designed in m29-00 sections 9-10**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-26
- **Completed:** 2026-02-26
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- IDeFiMonitor interface (6 members: name, evaluate, getInterval, start, stop, updateConfig) with MonitorSeverity 4-level type and MonitorEvaluation result type
- HealthFactorMonitor designed with adaptive polling (SAFE 5min, WARNING 1min, DANGER 15s, CRITICAL 5s) using recursive setTimeout, on-demand PositionTracker sync, and per-position cooldown
- MaturityMonitor designed with fixed 24h polling for yield position maturity tracking (7-day, 1-day, post-maturity warnings)
- MarginMonitor designed with fixed 1min polling and dual margin ratio + liquidation price proximity check
- DeFiMonitorService orchestrator with fail-soft start/stop/updateConfig lifecycle
- 8 design decisions (DEC-MON-01 through DEC-MON-08) and severityRank utility

## Task Commits

1. **Task 1: IDeFiMonitor interface + DeFiMonitorService orchestrator (section 9)** - `fc54bab9` (docs)
2. **Task 2: 3 monitor detailed designs (section 10)** - included in same commit (both tasks modify same file, single atomic commit)

## Files Created/Modified
- `internal/objectives/m29-00-defi-advanced-protocol-design.md` - Added sections 9 (IDeFiMonitor framework) and 10 (3 monitor detailed designs)

## Decisions Made
- All 8 design decisions followed plan specifications exactly (DEC-MON-01 through DEC-MON-08)

## Deviations from Plan
None - plan executed as specified.

## Issues Encountered
None

## User Setup Required
None - design-only phase, no external service configuration required.

## Next Phase Readiness
- Sections 9-10 complete, providing IDeFiMonitor interface and 3 monitor designs
- Plan 269-02 can now proceed to design notification event integration (section 11) and config/lifecycle (section 12)
- Phase 268 output (defi_positions schema, PositionTracker) properly referenced throughout

### Self-Check: PASSED
- [x] IDeFiMonitor interface: 6 members (name, evaluate, getInterval, start, stop, updateConfig) defined
- [x] MonitorSeverity: 4 levels (SAFE/WARNING/DANGER/CRITICAL) with color coding
- [x] DeFiMonitorService: register/start/stop/updateConfig orchestrator
- [x] HealthFactorMonitor: adaptive polling (recursive setTimeout, 4 severity intervals, on-demand sync)
- [x] MaturityMonitor: 24h fixed polling (7-day/1-day/post-maturity warnings)
- [x] MarginMonitor: 1min fixed polling (dual margin ratio + liquidation price check)
- [x] 8 design decisions (DEC-MON-01 through DEC-MON-08) recorded
- [x] severityRank utility function defined

---
*Phase: 269-defi-monitoring-framework*
*Completed: 2026-02-26*
