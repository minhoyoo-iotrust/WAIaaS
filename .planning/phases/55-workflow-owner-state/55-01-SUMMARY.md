---
phase: 55-workflow-owner-state
plan: 01
subsystem: workflow
tags: [delay-queue, cooldown, tdd, sqlite, begin-immediate, json-extract]

# Dependency graph
requires:
  - phase: 54-policy-engine
    provides: "DatabasePolicyEngine with evaluateAndReserve, reserved_amount, TOCTOU prevention"
provides:
  - "DelayQueue class with queueDelay(), cancelDelay(), processExpired(), isExpired()"
  - "Workflow module barrel export"
affects: [55-02-approval-workflow, 56-pipeline-integration, stage4Wait-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BEGIN IMMEDIATE for atomic expired tx transition"
    - "JSON_EXTRACT for delaySeconds from metadata column"
    - "Dual DB pattern (Drizzle + raw sqlite) for workflow services"

key-files:
  created:
    - packages/daemon/src/workflow/delay-queue.ts
    - packages/daemon/src/workflow/index.ts
    - packages/daemon/src/__tests__/delay-queue.test.ts
  modified: []

key-decisions:
  - "delaySeconds stored in metadata JSON (not separate column) -- reuses existing schema"
  - "JSON_EXTRACT in SQLite for expired query -- avoids extra column, leverages SQLite JSON1 extension"
  - "processExpired uses WHERE + UPDATE CAS pattern -- guards against concurrent processing"
  - "cancelDelay clears reserved_amount inline (no separate releaseReservation call)"

patterns-established:
  - "Workflow service dual DB pattern: constructor({ db, sqlite }) matching DatabasePolicyEngine"
  - "Metadata JSON for per-transaction workflow parameters (delaySeconds, etc.)"

# Metrics
duration: 3min
completed: 2026-02-10
---

# Phase 55 Plan 01: DelayQueue Summary

**DELAY tier cooldown queue with BEGIN IMMEDIATE atomic expiry, JSON_EXTRACT metadata, 11 TDD tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-10T09:06:20Z
- **Completed:** 2026-02-10T09:09:20Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files created:** 3

## Accomplishments
- DelayQueue class managing full DELAY tier lifecycle: queue, cancel, auto-execute
- BEGIN IMMEDIATE atomic transition for processExpired preventing concurrent processing
- JSON_EXTRACT based expired query leveraging metadata column for delaySeconds
- 11 TDD test cases covering queue, cancel, processExpired, isExpired, edge cases

## Task Commits

Each task was committed atomically:

1. **TDD RED: Failing tests** - `f36eaca` (test)
2. **TDD GREEN: Implementation + barrel** - `d9e9897` (feat)

_TDD plan: RED phase wrote 11 failing tests, GREEN phase implemented DelayQueue + barrel export._

## Files Created/Modified
- `packages/daemon/src/workflow/delay-queue.ts` - DelayQueue class with queueDelay, cancelDelay, processExpired, isExpired
- `packages/daemon/src/workflow/index.ts` - Barrel export for workflow module
- `packages/daemon/src/__tests__/delay-queue.test.ts` - 11 TDD tests for delay queue behavior

## Decisions Made
- **delaySeconds in metadata JSON:** Stored in the existing metadata TEXT column rather than adding a new column. Reuses schema, accessed via JSON_EXTRACT in queries.
- **JSON_EXTRACT for expired query:** `queued_at + CAST(JSON_EXTRACT(metadata, '$.delaySeconds') AS INTEGER) <= ?` enables the expired check in a single SELECT without application-level filtering.
- **CAS guard in processExpired:** The UPDATE uses `WHERE id = ? AND status = 'QUEUED'` to prevent double-processing if concurrent processExpired calls race.
- **cancelDelay clears reserved_amount inline:** Sets `reserved_amount = NULL` directly in the CANCELLED update rather than calling a separate releaseReservation method.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS strict null check in test assertions**
- **Found during:** TDD GREEN (typecheck verification)
- **Issue:** `expired[0].txId` flagged as possibly undefined by TS strict mode
- **Fix:** Added non-null assertion `expired[0]!.txId` (test context guarantees length)
- **Files modified:** packages/daemon/src/__tests__/delay-queue.test.ts
- **Committed in:** d9e9897 (GREEN commit)

**2. [Rule 1 - Bug] Removed unused TransactionRow interface**
- **Found during:** TDD GREEN (typecheck verification)
- **Issue:** TS6196 unused type declaration
- **Fix:** Removed unused interface
- **Files modified:** packages/daemon/src/workflow/delay-queue.ts
- **Committed in:** d9e9897 (GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Minor TS strictness fixes, no scope creep.

## Issues Encountered
- Pre-existing typecheck errors in `approval-workflow.test.ts` (another plan's RED test) -- not related to this plan, not blocking.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DelayQueue ready for stage4Wait wiring in pipeline integration (Phase 56)
- ApprovalWorkflow (55-02) can follow same dual-DB pattern
- processExpired needs a periodic caller (BackgroundWorkers timer) to be wired in integration phase

## Self-Check: PASSED

---
*Phase: 55-workflow-owner-state*
*Completed: 2026-02-10*
