---
phase: 56-pipeline-integration
plan: 02
subsystem: pipeline
tags: [pipeline, stage4Wait, DELAY, APPROVAL, PIPELINE_HALTED, BackgroundWorkers, DelayQueue, ApprovalWorkflow, executeFromStage5]

# Dependency graph
requires:
  - phase: 56-pipeline-integration-01
    provides: stage3Policy with evaluateAndReserve, PipelineContext with sqlite/sessionId/delaySeconds
  - phase: 55-workflow-owner-state
    provides: DelayQueue, ApprovalWorkflow, OwnerLifecycleService
provides:
  - stage4Wait with DELAY/APPROVAL branching and INSTANT/NOTIFY passthrough
  - PIPELINE_HALTED error code for intentional pipeline halt signaling
  - BackgroundWorkers registrations for delay-expired (5s) and approval-expired (30s)
  - DaemonLifecycle.executeFromStage5 for delay-expired transaction re-entry
  - TransactionRouteDeps.config for policy defaults propagation
affects: [57-api-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PIPELINE_HALTED throw as intentional pipeline halt (caught by async error handler, not FAILED)"
    - "executeFromStage5 re-entry: construct PipelineContext from DB row and run stage5+stage6"
    - "BackgroundWorkers delay-expired/approval-expired periodic processing"

key-files:
  created:
    - packages/daemon/src/__tests__/pipeline-stage4.test.ts
  modified:
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts

key-decisions:
  - "PIPELINE_HALTED as WAIaaSError (domain: TX, httpStatus: 409) caught in async pipeline handler"
  - "Backward-compatible fallback: if delayQueue/approvalWorkflow is missing, DELAY/APPROVAL treated as INSTANT"
  - "executeFromStage5 uses dynamic imports to avoid circular dependencies in daemon.ts"
  - "Workflow instances created in daemon Step 4b after DB and config are available"

patterns-established:
  - "PIPELINE_HALTED sentinel error: thrown by stage4Wait, caught by async pipeline error handler, prevents FAILED marking"
  - "Pipeline re-entry pattern: BackgroundWorker -> processExpired -> executeFromStage5 -> stage5+stage6"

# Metrics
duration: 10min
completed: 2026-02-10
---

# Phase 56 Plan 02: stage4Wait DELAY/APPROVAL Pipeline Integration Summary

**stage4Wait with DELAY/APPROVAL branching via PIPELINE_HALTED halt, BackgroundWorkers delay-expired/approval-expired, executeFromStage5 pipeline re-entry**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-10T09:53:11Z
- **Completed:** 2026-02-10T10:03:11Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- stage4Wait now branches on tier: INSTANT/NOTIFY pass through, DELAY calls queueDelay() + throws PIPELINE_HALTED, APPROVAL calls requestApproval() + throws PIPELINE_HALTED
- Async pipeline error handler recognizes PIPELINE_HALTED as intentional (does not mark transaction FAILED)
- BackgroundWorkers register delay-expired (every 5s) and approval-expired (every 30s) in DaemonLifecycle Step 6
- executeFromStage5 private method re-enters pipeline at stage5Execute + stage6Confirm for expired delay transactions
- PIPELINE_HALTED error code added to @waiaas/core (68 total, TX domain 21 codes)
- TransactionRouteDeps extended with config for policy_defaults_delay_seconds and policy_defaults_approval_timeout
- 10 TDD tests covering all 5 test groups (passthrough, DELAY, APPROVAL, halt mechanism, re-entry)
- 314 daemon tests pass, 65 core tests pass, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED -- Failing tests for stage4Wait DELAY/APPROVAL branching** - `b26c12d` (test)
2. **Task 2: TDD GREEN -- Implement stage4Wait + BackgroundWorkers + pipeline wiring** - `eea1420` (feat)

## Files Created/Modified
- `packages/daemon/src/__tests__/pipeline-stage4.test.ts` - 10 TDD tests for stage4Wait branching, halt mechanism, executeFromStage5 re-entry
- `packages/daemon/src/pipeline/stages.ts` - PipelineContext extended with delayQueue/approvalWorkflow/config, stage4Wait implemented
- `packages/daemon/src/api/routes/transactions.ts` - PIPELINE_HALTED handler in async pipeline, config in TransactionRouteDeps + PipelineContext
- `packages/daemon/src/api/server.ts` - Pass config projection to transactionRoutes
- `packages/daemon/src/lifecycle/daemon.ts` - DelayQueue/ApprovalWorkflow instances, delay-expired/approval-expired workers, executeFromStage5
- `packages/core/src/errors/error-codes.ts` - PIPELINE_HALTED error code (TX domain, 409, non-retryable)
- `packages/core/src/i18n/en.ts` - English message for PIPELINE_HALTED
- `packages/core/src/i18n/ko.ts` - Korean message for PIPELINE_HALTED
- `packages/core/src/__tests__/errors.test.ts` - Updated error count assertions (68 total, 21 TX)
- `packages/core/src/__tests__/i18n.test.ts` - Updated error count assertion (68)
- `packages/core/src/__tests__/package-exports.test.ts` - Updated error count assertion (68)

## Decisions Made
- **PIPELINE_HALTED as WAIaaSError:** Used WAIaaSError with a dedicated error code rather than a boolean flag or custom sentinel. This integrates cleanly with the existing async pipeline error handler -- a simple `error.code === 'PIPELINE_HALTED'` check. httpStatus is 409 (Conflict) for consistency with the error matrix constraint (all codes >= 400).
- **Backward-compatible fallback:** If delayQueue or approvalWorkflow is undefined on ctx, DELAY/APPROVAL tiers fall through as INSTANT. This prevents breaking existing pipelines that don't inject workflow deps.
- **Dynamic imports in executeFromStage5:** Used `await import()` for stages and schema to avoid circular dependencies between daemon.ts and the pipeline module.
- **Workflow instances created in Step 4b:** After database (Step 2) and config (Step 1) are available but before HTTP server start (Step 5), ensuring deps are ready before routes receive requests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale error count assertions in @waiaas/core tests**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Core test assertions expected 66 error codes but there were already 67 before this plan (POLICY_NOT_FOUND was added in 54-02 but test counts were not updated). Adding PIPELINE_HALTED made it 68.
- **Fix:** Updated error count assertions in errors.test.ts (68 total, 21 TX), i18n.test.ts (68), package-exports.test.ts (68)
- **Files modified:** packages/core/src/__tests__/errors.test.ts, packages/core/src/__tests__/i18n.test.ts, packages/core/src/__tests__/package-exports.test.ts
- **Verification:** All 65 core tests pass
- **Committed in:** eea1420 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added PIPELINE_HALTED to i18n translations**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** @waiaas/core i18n Messages type enforces Record<ErrorCode, string> -- adding PIPELINE_HALTED without i18n entries caused TypeScript build failure
- **Fix:** Added English and Korean translations for PIPELINE_HALTED
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** tsc build succeeds, i18n tests pass
- **Committed in:** eea1420 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None - implementation followed plan as specified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full 6-stage pipeline is now complete: stage1-stage6 with real policy evaluation, DELAY/APPROVAL branching, and background processing
- Ready for 57-api-integration-tests: end-to-end API tests covering the complete transaction flow
- All pipeline deps (sqlite, sessionId, delayQueue, approvalWorkflow, config) propagated through routes -> pipeline -> stages -> daemon lifecycle

## Self-Check: PASSED

---
*Phase: 56-pipeline-integration*
*Completed: 2026-02-10*
