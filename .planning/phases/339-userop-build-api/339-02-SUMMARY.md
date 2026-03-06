---
phase: 339-userop-build-api
plan: 02
subsystem: infra
tags: [background-worker, cleanup, ttl, userop]

requires:
  - phase: 339-userop-build-api
    provides: userop_builds table with expires_at column and idx_userop_builds_expires index
provides:
  - userop-build-cleanup BackgroundWorkers registration (5-min interval)
  - Automatic expired build record purging
affects: [340-userop-sign-api]

tech-stack:
  added: []
  patterns: [raw SQLite prepare for cleanup workers]

key-files:
  created:
    - packages/daemon/src/__tests__/userop-build-cleanup.test.ts
  modified:
    - packages/daemon/src/lifecycle/daemon.ts

key-decisions:
  - "D9: All expired records cleaned regardless of used status (DATA-04 requirement)"
  - "D10: 5-min cleanup interval balances table hygiene vs DB load"

patterns-established:
  - "Cleanup worker pattern: register after approval-expired, guard on sqlite && !_isShuttingDown, raw prepare for performance"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04]

duration: 3min
completed: 2026-03-06
---

# Phase 339 Plan 02: Build Data Cleanup Worker Summary

**userop-build-cleanup BackgroundWorker registered with 5-min interval, purging expired userop_builds records via indexed expires_at column**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T09:08:00Z
- **Completed:** 2026-03-06T09:11:00Z
- **Tasks:** 1 (TDD: RED+GREEN)
- **Files modified:** 2

## Accomplishments
- Registered userop-build-cleanup worker in daemon.ts with 5-minute interval
- Deletes expired userop_builds records where expires_at < now (seconds)
- Guards on sqlite presence and shutdown state
- 5 tests covering expired/valid/used records and empty table edge case

## Task Commits

1. **Task 1: userop-build-cleanup worker registration** - `e7751e4f` (feat)

## Files Created/Modified
- `packages/daemon/src/__tests__/userop-build-cleanup.test.ts` - 5 tests for cleanup worker
- `packages/daemon/src/lifecycle/daemon.ts` - Register userop-build-cleanup worker

## Decisions Made
- D9: All expired records cleaned regardless of used status -- matches DATA-04 "expired records periodic cleanup"
- D10: 5-min cleanup interval -- balances table hygiene vs DB load, consistent with session-cleanup pattern

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Build endpoint + cleanup worker complete
- Ready for Phase 340: UserOp Sign API

---
*Phase: 339-userop-build-api*
*Completed: 2026-03-06*
