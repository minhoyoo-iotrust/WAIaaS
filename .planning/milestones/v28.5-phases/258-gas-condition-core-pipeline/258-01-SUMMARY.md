---
phase: 258-gas-condition-core-pipeline
plan: 01
subsystem: pipeline
tags: [gas-condition, zod, pipeline, notification, i18n, GAS_WAITING]

# Dependency graph
requires:
  - phase: 257-staking-pipeline-integration-fix
    provides: AsyncPollingService with GAS_WAITING pickup, TRANSACTION_STATUSES with GAS_WAITING
provides:
  - GasConditionSchema Zod SSoT with at-least-one refine
  - gasCondition optional field on all 5 discriminatedUnion request schemas
  - TX_GAS_WAITING and TX_GAS_CONDITION_MET notification events
  - i18n en/ko messages for gas condition notifications
  - Pipeline Stage 3.5 gas condition check (stage3_5GasCondition)
  - GAS_WAITING transition with bridgeMetadata for GasConditionTracker
  - max_pending_count enforcement
affects: [258-02 (GasConditionTracker, Settings), 259 (REST API, Admin UI, MCP, SDK)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stage 3.5 insertion pattern: new stage between policy evaluation and wait branching"
    - "Graceful settings fallback: try/catch for unregistered setting keys with sensible defaults"
    - "bridgeMetadata tracker convention: tracker='gas-condition' for AsyncPollingService routing"

key-files:
  created:
    - packages/daemon/src/__tests__/pipeline-stage3-5-gas-condition.test.ts
  modified:
    - packages/core/src/schemas/transaction.schema.ts
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/daemon/src/pipeline/pipeline.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/routes/actions.ts
    - packages/core/src/__tests__/schemas.test.ts
    - packages/core/src/__tests__/enums.test.ts

key-decisions:
  - "Graceful settings fallback for gas_condition.* keys not yet registered (258-02 adds them) -- try/catch with defaults"
  - "Store gasCondition + chain + network + createdAt in bridgeMetadata (not metadata) for AsyncPollingService compatibility"
  - "Timeout clamping: request.timeout capped at max_timeout_sec, defaults to default_timeout_sec or hardcoded 3600"
  - "max_pending_count counts all GAS_WAITING transactions globally (not per-wallet)"

patterns-established:
  - "Stage 3.5 pattern: stage3_5GasCondition between stage3Policy and stage4Wait in all pipeline entry points"
  - "gasCondition field convention: optional on all 5 request types via shared gasConditionField spread"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-06, WRKR-06, NOTF-01]

# Metrics
duration: 7min
completed: 2026-02-25
---

# Phase 258 Plan 01: GasCondition Schema + Pipeline Stage 3.5 Summary

**GasCondition Zod schema with at-least-one refine, Pipeline Stage 3.5 gas condition check with GAS_WAITING transition, TX_GAS_WAITING/TX_GAS_CONDITION_MET notification events, and 33 unit tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-24T16:50:21Z
- **Completed:** 2026-02-24T16:57:39Z
- **Tasks:** 5 (3 from previous session + 2 in this session)
- **Files modified:** 11

## Accomplishments
- GasConditionSchema with maxGasPrice/maxPriorityFee (numeric string) + timeout (60-86400) validation
- gasCondition optional field on all 5 discriminatedUnion request schemas (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)
- TX_GAS_WAITING and TX_GAS_CONDITION_MET notification events with i18n en/ko messages
- Pipeline Stage 3.5 inserted between Stage 3 (policy) and Stage 4 (wait) across all entry points
- max_pending_count limit enforcement with graceful settings fallback
- 33 new unit tests (13 schema + 7 gasCondition field + 13 stage3_5)

## Task Commits

Each task was committed atomically:

1. **Tasks 1-3: GasConditionSchema + notification events + i18n** - `23d2471f` (feat) -- previous session
2. **Task 4: Pipeline Stage 3.5 gas condition check** - `5d154013` (feat)
3. **Task 5: Unit tests** - `34b8b39d` (test)

## Files Created/Modified
- `packages/core/src/schemas/transaction.schema.ts` - GasConditionSchema, gasCondition on 5 request types
- `packages/core/src/enums/notification.ts` - TX_GAS_WAITING, TX_GAS_CONDITION_MET events
- `packages/core/src/i18n/en.ts` - English messages for gas condition events
- `packages/core/src/i18n/ko.ts` - Korean messages for gas condition events
- `packages/daemon/src/pipeline/stages.ts` - stage3_5GasCondition function (150 lines)
- `packages/daemon/src/pipeline/pipeline.ts` - Wire stage3_5GasCondition in TransactionPipeline
- `packages/daemon/src/api/routes/transactions.ts` - Wire stage3_5GasCondition in send route
- `packages/daemon/src/api/routes/actions.ts` - Wire stage3_5GasCondition in actions route
- `packages/core/src/__tests__/schemas.test.ts` - 20 new tests (GasConditionSchema + gasCondition field)
- `packages/core/src/__tests__/enums.test.ts` - Updated notification event count (40->42)
- `packages/daemon/src/__tests__/pipeline-stage3-5-gas-condition.test.ts` - 13 new tests (created)

## Decisions Made
- **Graceful settings fallback**: gas_condition.* setting keys are registered in 258-02, so stage3_5 uses try/catch with defaults (enabled=true, max_pending=100, timeout=3600)
- **bridgeMetadata storage**: gasCondition metadata stored in bridgeMetadata (not metadata column) for AsyncPollingService compatibility -- tracker='gas-condition' triggers GasConditionTracker routing
- **Global pending count**: max_pending_count counts all GAS_WAITING transactions globally, not per-wallet -- simpler, consistent with existing max_pending_tx pattern
- **Timeout chain**: request.timeout > settings default_timeout_sec > hardcoded 3600, then clamped to max_timeout_sec

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- NotificationEventType count was 42 (not 40 as in the previous test) after the previous commit added 2 new events -- fixed by updating the expected count in enums.test.ts

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 258-02 can now implement GasConditionTracker (IAsyncStatusTracker) that reads gasCondition from bridgeMetadata
- Settings keys (gas_condition.*) need to be added in 258-02 to SETTING_DEFINITIONS
- executeFromStage4 re-entry method needed in daemon.ts (258-02)
- Stage 3.5 already handles graceful fallback when settings are not yet registered

## Self-Check: PASSED

- FOUND: pipeline-stage3-5-gas-condition.test.ts
- FOUND: commit 23d2471f (Tasks 1-3)
- FOUND: commit 5d154013 (Task 4)
- FOUND: commit 34b8b39d (Task 5)
- FOUND: 258-01-SUMMARY.md

---
*Phase: 258-gas-condition-core-pipeline*
*Completed: 2026-02-25*
