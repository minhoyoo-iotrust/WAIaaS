---
phase: 299-integration
plan: 01
subsystem: infra
tags: [drift, perp, actions, hot-reload, provider-registration]

# Dependency graph
requires:
  - phase: 298
    provides: DriftPerpProvider, DriftConfig, MockDriftSdkWrapper, IDriftSdkWrapper
provides:
  - DriftPerpProvider registered in registerBuiltInProviders with actions.drift_enabled toggle
  - DriftPerpProvider/DriftConfig/DRIFT_DEFAULTS/DRIFT_PROGRAM_ID re-exported from @waiaas/actions
  - MockDriftSdkWrapper/IDriftSdkWrapper/DriftInstruction/DriftPosition/DriftMarginInfo types re-exported
  - pendle_yield and drift_perp in BUILTIN_NAMES for hot-reload toggle support
affects: [299-02, admin-ui, mcp, sdk]

# Tech tracking
tech-stack:
  added: []
  patterns: [provider-registration, hot-reload-builtin-names]

key-files:
  created: []
  modified:
    - packages/actions/src/index.ts
    - packages/daemon/src/infrastructure/settings/hot-reload.ts

key-decisions:
  - "DriftConfig factory uses only enabled+subAccount (no settingsReader.get calls for policy keys)"
  - "pendle_yield missing from BUILTIN_NAMES was a pre-existing bug, fixed alongside drift_perp addition"

patterns-established:
  - "Provider registration: key matches BUILTIN_NAMES entry for correct hot-reload unregister/re-register"

requirements-completed: [INTG-01, INTG-02, INTG-05, INTG-06, INTG-07]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 299 Plan 01: registerBuiltInProviders Registration + Hot-Reload BUILTIN_NAMES Summary

**DriftPerpProvider auto-registration via actions.drift_enabled toggle with pendle_yield hot-reload bug fix**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T16:23:42Z
- **Completed:** 2026-03-01T16:26:42Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- DriftPerpProvider registered in registerBuiltInProviders with key='drift_perp' and enabledKey='actions.drift_enabled'
- All Drift types (DriftPerpProvider, DriftConfig, DRIFT_DEFAULTS, DRIFT_PROGRAM_ID, MockDriftSdkWrapper, IDriftSdkWrapper, DriftInstruction, DriftPosition, DriftMarginInfo) re-exported from @waiaas/actions
- BUILTIN_NAMES updated with 'pendle_yield' (pre-existing bug fix) and 'drift_perp' for correct hot-reload toggle

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DriftPerpProvider to registerBuiltInProviders + re-exports** - `374526a2` (feat)
2. **Task 2: Add drift_perp + pendle_yield to BUILTIN_NAMES for hot-reload** - `e868ba88` (fix)

## Files Created/Modified
- `packages/actions/src/index.ts` - Added DriftPerpProvider import, re-exports, and registerBuiltInProviders entry
- `packages/daemon/src/infrastructure/settings/hot-reload.ts` - Added pendle_yield and drift_perp to BUILTIN_NAMES array

## Decisions Made
- DriftConfig factory only sets `enabled: true` and `subAccount: 0` -- the 5 Admin Settings keys (drift_max_leverage, etc.) are consumed by MarginMonitor and PerpPolicyEvaluator, not the provider constructor
- Fixed pre-existing bug where pendle_yield was missing from BUILTIN_NAMES (hot-reload toggle didn't work for Pendle without daemon restart)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DriftPerpProvider is now auto-registered and hot-reload enabled
- Ready for 299-02: Admin UI Drift card + actions.skill.md section

## Self-Check: PASSED

- [x] packages/actions/src/index.ts: FOUND
- [x] packages/daemon/src/infrastructure/settings/hot-reload.ts: FOUND
- [x] Commit 374526a2: FOUND
- [x] Commit e868ba88: FOUND

---
*Phase: 299-integration*
*Completed: 2026-03-02*
