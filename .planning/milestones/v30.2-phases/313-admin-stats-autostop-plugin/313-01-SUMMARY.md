---
phase: 313-admin-stats-autostop-plugin
plan: 01
subsystem: autostop
tags: [autostop, plugin, registry, zod, refactoring]

requires:
  - phase: 312-webhook-outbound
    provides: Webhook service, EventBus integration patterns
provides:
  - IAutoStopRule interface with evaluate/tick/getStatus/updateConfig/reset
  - RuleRegistry (Map-based) with register/unregister/query operations
  - AdminStatsResponseSchema (7-category Zod SSoT)
  - AutoStopRulesResponseSchema and UpdateAutoStopRuleRequestSchema
  - 3 rule implementations (ConsecutiveFailures, UnusualActivity, IdleTimeout)
  - Refactored AutoStopService using RuleRegistry
affects: [313-02, 313-03, admin-stats, autostop-api]

tech-stack:
  added: []
  patterns: [IAutoStopRule plugin interface, RuleRegistry Map-based storage, backward-compatible re-export barrels]

key-files:
  created:
    - packages/daemon/src/services/autostop/types.ts
    - packages/daemon/src/services/autostop/rule-registry.ts
    - packages/daemon/src/services/autostop/autostop-service.ts
    - packages/daemon/src/services/autostop/rules/consecutive-failures.rule.ts
    - packages/daemon/src/services/autostop/rules/unusual-activity.rule.ts
    - packages/daemon/src/services/autostop/rules/idle-timeout.rule.ts
    - packages/daemon/src/services/autostop/index.ts
    - packages/core/src/schemas/admin-stats.schema.ts
    - packages/daemon/src/__tests__/rule-registry.test.ts
  modified:
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/services/autostop-rules.ts
    - packages/daemon/src/services/autostop-service.ts

key-decisions:
  - "AutoStopService keeps direct typed rule references alongside RuleRegistry for backward-compat event handler logic"
  - "Old autostop-rules.ts and autostop-service.ts converted to re-export barrels to avoid breaking existing imports"
  - "AdminStatsResponseSchema uses 7 flat categories (not nested) matching design spec OPS-05"

patterns-established:
  - "IAutoStopRule: pluggable rule interface with evaluate/tick/getStatus/updateConfig/reset"
  - "RuleRegistry: Map-based registry with register/unregister/setEnabled/getRulesForEvent/getTickableRules"
  - "Backward-compatible barrel re-exports when refactoring module structure"

requirements-completed: [PLUG-01, PLUG-02]

duration: 7min
completed: 2026-03-03
---

# Phase 313 Plan 01: IAutoStopRule + RuleRegistry + 3 rules refactoring Summary

**IAutoStopRule plugin interface with RuleRegistry, 3 refactored rules, and 7-category AdminStatsResponseSchema Zod SSoT**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-03T13:15:30Z
- **Completed:** 2026-03-03T13:23:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- IAutoStopRule interface with evaluate/tick/getStatus/updateConfig/reset methods
- RuleRegistry with Map-based register/unregister/query operations (10 tests)
- 3 existing rules refactored to IAutoStopRule: ConsecutiveFailures, UnusualActivity, IdleTimeout
- AutoStopService refactored to use RuleRegistry while preserving all existing behavior
- AdminStatsResponseSchema (7 categories) + AutoStopRulesResponseSchema Zod SSoT in @waiaas/core
- All 59 existing autostop tests pass without behavior changes

## Task Commits

1. **Task 1: IAutoStopRule types + RuleRegistry + Zod SSoT schemas** - `d9009382` (feat)
2. **Task 2: Refactor 3 rules + update AutoStopService + fix imports** - `77408804` (feat)

## Files Created/Modified
- `packages/daemon/src/services/autostop/types.ts` - IAutoStopRule, RuleResult, AutoStopEvent types
- `packages/daemon/src/services/autostop/rule-registry.ts` - RuleRegistry Map-based implementation
- `packages/daemon/src/services/autostop/autostop-service.ts` - Refactored service using registry
- `packages/daemon/src/services/autostop/rules/consecutive-failures.rule.ts` - IAutoStopRule impl
- `packages/daemon/src/services/autostop/rules/unusual-activity.rule.ts` - IAutoStopRule impl
- `packages/daemon/src/services/autostop/rules/idle-timeout.rule.ts` - IAutoStopRule impl
- `packages/core/src/schemas/admin-stats.schema.ts` - 7-category stats + rules Zod schemas
- `packages/daemon/src/__tests__/rule-registry.test.ts` - 10 registry + schema tests

## Decisions Made
- AutoStopService keeps direct typed rule references alongside RuleRegistry for backward-compatible event handler logic (explicit reason strings like 'CONSECUTIVE_FAILURES')
- Old autostop-rules.ts and autostop-service.ts converted to re-export barrels to avoid breaking 30+ existing imports
- Backward-compatible methods (updateThreshold, updateWindow, getTrackedCount) added to new rule classes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added backward-compatible methods to refactored rules**
- **Found during:** Task 2 (refactoring)
- **Issue:** Existing tests use updateThreshold/updateWindow/getTrackedCount methods that don't exist on IAutoStopRule interface
- **Fix:** Added backward-compatible public methods to each rule class
- **Files modified:** consecutive-failures.rule.ts, unusual-activity.rule.ts
- **Verification:** All 59 existing tests pass
- **Committed in:** 77408804

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for backward compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- IAutoStopRule + RuleRegistry ready for Plan 02 (AdminStatsService) and Plan 03 (REST API + Admin UI)
- AutoStopService.registry exposes IRuleRegistry for API route access

---
*Phase: 313-admin-stats-autostop-plugin*
*Completed: 2026-03-03*
