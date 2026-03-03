---
phase: 308
plan: 01-03
subsystem: api, services, admin-ui
tags: [zod, admin-stats, autostop, metrics, plugin-architecture, rule-registry]

# Dependency graph
requires:
  - phase: 304
    provides: TX stats reference (DryRunSimulationResult, pipeline stage definitions)
  - phase: 305
    provides: Audit event taxonomy (20 events, audit_log table schema)
provides:
  - AdminStatsResponseSchema (Zod) with 7 categories
  - IMetricsCounter interface for in-memory RPC/TX counters
  - DB aggregation queries for transactions/sessions/wallets/notifications
  - 1-minute TTL cache design in AdminStatsService
  - IAutoStopRule interface with evaluate/tick/getStatus/updateConfig
  - RuleRegistry for runtime rule registration/unregistration
  - 3 existing rules refactored to IAutoStopRule implementations
  - GET /v1/admin/stats, GET /v1/admin/autostop/rules, PUT /v1/admin/autostop/rules/:id specs
  - Per-rule enable/disable Admin Settings toggles
  - Admin UI dashboard stats card wireframe
affects: [implementation-milestone, doc-29, doc-36, doc-37, doc-67]

# Tech tracking
tech-stack:
  added: []
  patterns: [IAutoStopRule plugin interface, RuleRegistry pattern, IMetricsCounter in-memory counters, TTL cache service pattern]

key-files:
  created:
    - .planning/phases/308/PLAN-308-01.md
    - .planning/phases/308/PLAN-308-02.md
    - .planning/phases/308/PLAN-308-03.md
    - .planning/phases/308/DESIGN-SPEC.md
  modified: []

key-decisions:
  - "7 stats categories (original 6 + notifications) -- notification delivery stats are essential for operations"
  - "IMetricsCounter interface extracted for testability and future Prometheus adapter"
  - "In-memory counters reset on daemon restart -- DB provides historical data"
  - "No new indexes needed -- all 10 aggregation queries covered by existing indexes"
  - "evaluate(event) unified method replacing 3 rule-specific methods"
  - "tick() optional for periodic checks (only IdleTimeoutRule uses it)"
  - "RuleAction type separates what-to-do from execution (SUSPEND_WALLET, NOTIFY_IDLE, KILL_SWITCH_CASCADE)"
  - "RuleRegistry Map-based with insertion order guarantee"
  - "Built-in 3 rules auto-registered in constructor for backward compatibility"
  - "autostop/ directory split for file organization (2 files -> 6 files)"
  - "Per-rule enable Setting keys (autostop.rule.{id}.enabled) separate from global autostop.enabled"
  - "Single /admin/stats endpoint for all 7 categories (minimize RTT)"
  - "Dashboard.tsx extension (not separate page) for stats UI"
  - "30-second polling for Admin UI stats refresh"
  - "RULE_NOT_FOUND error code for PUT /admin/autostop/rules/:id"

patterns-established:
  - "IAutoStopRule: Plugin interface with evaluate/tick/getStatus/updateConfig/reset lifecycle"
  - "RuleRegistry: Runtime registration pattern for extensible rule engines"
  - "IMetricsCounter: In-memory counter interface with labels and latency tracking"
  - "AdminStatsService: TTL cache pattern for expensive DB aggregation queries"

requirements-completed: [STAT-01, STAT-02, STAT-03, STAT-04, PLUG-01, PLUG-02, PLUG-03, PLUG-04]

# Metrics
duration: 18min
completed: 2026-03-03
---

# Phase 308: Admin Stats + AutoStop Plugin Summary

**AdminStatsResponseSchema (7-category Zod) + IMetricsCounter in-memory counters + IAutoStopRule plugin interface with RuleRegistry and per-rule Admin Settings toggles**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-03T08:14:31Z
- **Completed:** 2026-03-03T08:32:00Z
- **Tasks:** 4 (3 plans + 1 design spec)
- **Files created:** 4

## Accomplishments

- Defined AdminStatsResponseSchema with 7 categories (transactions/sessions/wallets/rpc/autostop/notifications/system) covering all operational statistics
- Designed IMetricsCounter interface with 6 counter integration points (RPC calls/errors/latency, autostop triggers, TX submitted/failed)
- Specified 10 DB aggregation queries all covered by existing indexes (no new indexes needed)
- Designed IAutoStopRule plugin interface with evaluate/tick/getStatus/updateConfig lifecycle methods
- Created RuleRegistry for runtime rule management (register/unregister/query/enable)
- Mapped 3 existing rule classes to IAutoStopRule implementations with backward compatibility
- Specified 3 new REST API endpoints (admin/stats, admin/autostop/rules GET/PUT)
- Designed per-rule enable/disable Admin Settings toggles (3 new keys)
- Created Admin UI dashboard wireframe with stats cards and 30s polling

## Task Commits

Each task was committed atomically:

1. **Plan 308-01: AdminStats schema + counters + DB aggregation** - `5593e112` (docs)
2. **Plan 308-02: IAutoStopRule + RuleRegistry + rule refactoring** - `3bd1e728` (docs)
3. **Plan 308-03: REST API specs + Admin Settings + doc updates** - `052663a0` (docs)
4. **DESIGN-SPEC: Consolidated design specification** - `29f1540f` (docs)

## Files Created

- `.planning/phases/308/PLAN-308-01.md` - AdminStats schema, IMetricsCounter, DB aggregation, TTL cache design
- `.planning/phases/308/PLAN-308-02.md` - IAutoStopRule interface, RuleResult types, RuleRegistry, 3 rule refactoring
- `.planning/phases/308/PLAN-308-03.md` - REST API endpoints, Admin Settings toggles, Admin UI wireframe, doc update notes
- `.planning/phases/308/DESIGN-SPEC.md` - Consolidated design specification (all 8 requirements)

## Decisions Made

1. **7 categories (not 6)** -- Added `notifications` category for 24h delivery stats (sent/failed/channelStatus)
2. **IMetricsCounter interface** -- Extracted for testability and potential future Prometheus adapter
3. **In-memory counters reset on restart** -- Historical data lives in DB, real-time counters in memory
4. **No new DB indexes** -- All 10 aggregation queries covered by existing indexes
5. **evaluate(event) unified method** -- Replaced 3 rule-specific methods (onTransactionFailed, onWalletActivity, checkIdle)
6. **tick() optional** -- Only IdleTimeoutRule needs periodic checks, other rules are event-driven only
7. **RuleAction type** -- Rules declare what action to take (SUSPEND_WALLET/NOTIFY_IDLE/KILL_SWITCH_CASCADE), AutoStopService executes
8. **autostop/ directory split** -- 2 files -> 6 files warrants directory organization
9. **Per-rule Setting keys** -- `autostop.rule.{id}.enabled` separate from global `autostop.enabled` master switch
10. **Single /admin/stats endpoint** -- All 7 categories in one JSON response minimizes RTT
11. **Dashboard extension, not new page** -- Stats cards integrated into existing dashboard.tsx
12. **RULE_NOT_FOUND error code** -- Separate from existing NOT_FOUND to distinguish rule vs entity lookup failures
13. **last7d stats** -- Added weekly summary (count + volumeUsd) for trend visibility
14. **30-second polling** -- Consistent with existing Admin UI patterns, simple and adequate
15. **1-minute TTL cache** -- Prevents redundant DB queries while keeping stats reasonably fresh

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This is a design-only milestone.

## Next Phase Readiness

- Phase 308 is the last phase in the v30.0 milestone
- All 5 phases (304-308) design specs are complete
- All 25 requirements (SIM-01~04, AUDIT-01~04, BKUP-01~04, HOOK-01~05, STAT-01~04, PLUG-01~04) covered
- Ready for implementation milestone that will use these design specs as input

## Self-Check: PASSED

- [x] PLAN-308-01.md exists
- [x] PLAN-308-02.md exists
- [x] PLAN-308-03.md exists
- [x] DESIGN-SPEC.md exists
- [x] 308-SUMMARY.md exists
- [x] Commit 5593e112 (Plan 308-01) found
- [x] Commit 3bd1e728 (Plan 308-02) found
- [x] Commit 052663a0 (Plan 308-03) found
- [x] Commit 29f1540f (DESIGN-SPEC) found

---
*Phase: 308*
*Completed: 2026-03-03*
