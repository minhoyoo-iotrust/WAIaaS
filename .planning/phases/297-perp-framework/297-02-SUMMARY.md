---
phase: 297-perp-framework
plan: 02
subsystem: monitoring, policy
tags: [perp, margin-monitor, policy-engine, drift, defi, monitoring, default-deny]

# Dependency graph
requires:
  - phase: 297-perp-framework plan 01
    provides: IPerpProvider interface, Zod schemas, MarginWarningEvent, POLICY_TYPES extensions, TransactionParam extensions
provides:
  - MarginMonitor IDeFiMonitor implementation for perp position margin ratio monitoring
  - PerpPolicyEvaluator (3 methods) in DatabasePolicyEngine Step 4i
  - 5 Drift Admin Settings keys for runtime configuration
  - daemon.ts MarginMonitor registration (Step 4c-11)
  - 34 unit tests (16 MarginMonitor + 18 PerpPolicyEvaluator)
affects: [298-drift-provider, 299-perp-integration, database-policy-engine, defi-monitor-service]

# Tech tracking
tech-stack:
  added: []
  patterns: [margin-monitor-adaptive-polling, perp-policy-suffix-matching, perp-default-deny]

key-files:
  created:
    - packages/daemon/src/services/monitoring/margin-monitor.ts
    - packages/daemon/src/__tests__/margin-monitor.test.ts
    - packages/daemon/src/__tests__/perp-policy-evaluator.test.ts
  modified:
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/__tests__/perp-provider-types.test.ts

key-decisions:
  - "MarginMonitor uses marginRatio (lower = more dangerous) with 3 thresholds: 0.30/0.15/0.10"
  - "PERP_ALLOWED_MARKETS enforces default-deny for all 5 perp actions via suffix matching"
  - "PERP_MAX_LEVERAGE and PERP_MAX_POSITION_USD use DELAY tier for warning zone (not just deny)"

patterns-established:
  - "Perp policy suffix matching: drift_open_position matches open_position"
  - "MarginMonitor follows HealthFactorMonitor 1:1 pattern with EventBus addition"

requirements-completed: [PERP-03, PERP-04, PERP-05, PERP-06, PERP-07]

# Metrics
duration: 9min
completed: 2026-03-02
---

# Phase 297 Plan 02: MarginMonitor + PerpPolicyEvaluator Summary

**Adaptive margin ratio monitor with 4-level severity polling and 3 perp policy evaluators (market whitelist, leverage limit, position size limit) in DatabasePolicyEngine Step 4i**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-01T15:28:46Z
- **Completed:** 2026-03-01T15:37:47Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- MarginMonitor implementing IDeFiMonitor with 4-level adaptive polling (SAFE 5min to CRITICAL 5s)
- 3 perp policy evaluation methods in DatabasePolicyEngine Step 4i with default-deny, leverage, and position size checks
- 34 new tests (16 MarginMonitor + 18 PerpPolicyEvaluator) all passing, 0 regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: MarginMonitor + daemon.ts registration + setting keys** - `e893f112` (feat)
2. **Task 2: PerpPolicyEvaluator -- DatabasePolicyEngine Step 4i** - `445987ca` (feat)
3. **Task 3: MarginMonitor + PerpPolicyEvaluator unit tests** - `54175e5f` (test)

## Files Created/Modified
- `packages/daemon/src/services/monitoring/margin-monitor.ts` - MarginMonitor IDeFiMonitor with adaptive polling, EventBus, cooldown, on-demand sync
- `packages/daemon/src/pipeline/database-policy-engine.ts` - Step 4i: PERP_ALLOWED_MARKETS, PERP_MAX_LEVERAGE, PERP_MAX_POSITION_USD evaluation
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - 5 Drift settings (enabled, max_leverage, max_position_usd, margin_warning_threshold, position_sync_interval)
- `packages/daemon/src/lifecycle/daemon.ts` - MarginMonitor registration in Step 4c-11 with EventBus + SettingsService
- `packages/daemon/src/__tests__/margin-monitor.test.ts` - 16 tests: severity, alerts, cooldown, EventBus, adaptive polling, on-demand sync
- `packages/daemon/src/__tests__/perp-policy-evaluator.test.ts` - 18 tests: PERP_ALLOWED_MARKETS, PERP_MAX_LEVERAGE, PERP_MAX_POSITION_USD
- `packages/daemon/src/__tests__/perp-provider-types.test.ts` - Fix: add PERP_ALLOWED_MARKETS to non-spending classification tests

## Decisions Made
- MarginMonitor uses marginRatio (lower = more dangerous) with thresholds 0.30/0.15/0.10, matching the MarginInfo schema's interpretation
- PERP_ALLOWED_MARKETS enforces default-deny for all 5 perp actions using suffix matching (drift_open_position -> open_position)
- PERP_MAX_LEVERAGE and PERP_MAX_POSITION_USD support DELAY tier for warning zones, consistent with LENDING_LTV_LIMIT pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed perp-provider-types.test.ts regression from default-deny**
- **Found during:** Task 3 (unit tests)
- **Issue:** Plan 297-01 tests for non-spending classification (close_position, add_margin, open_position) failed because Step 4i PERP_ALLOWED_MARKETS now enforces default-deny before Step 5 is reached
- **Fix:** Added PERP_ALLOWED_MARKETS policy to beforeEach in the "Non-spending classification - perp actions" test group
- **Files modified:** packages/daemon/src/__tests__/perp-provider-types.test.ts
- **Verification:** All 52 regression tests pass (health-factor-monitor + lending-policy-evaluator + perp-provider-types)
- **Committed in:** 54175e5f (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Test fix was necessary consequence of implementing default-deny policy. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MarginMonitor and PerpPolicyEvaluator are ready for Phase 298 (Drift Provider implementation)
- All 5 perp action types protected by PERP_ALLOWED_MARKETS default-deny
- MarginMonitor ready to consume real margin data once DriftProvider.getMarginInfo() is implemented
- 5 Drift settings available in Admin Settings for runtime configuration

## Self-Check: PASSED

- All 4 key files verified present on disk
- All 3 task commits verified in git log (e893f112, 445987ca, 54175e5f)
- 86 tests passing across 5 test files (16+18+15+19+18), 0 failures
- typecheck clean

---
*Phase: 297-perp-framework*
*Completed: 2026-03-02*
