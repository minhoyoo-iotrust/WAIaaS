---
phase: 96-pipeline-confirmation-fix
plan: 01
subsystem: pipeline
tags: [evm, viem, confirmation, receipt, fallback, stage6]

# Dependency graph
requires:
  - phase: 77-evm-adapter
    provides: EvmAdapter waitForConfirmation, IChainAdapter interface
  - phase: 73-notification-triggers
    provides: pipeline notification fire-and-forget triggers
provides:
  - SubmitResult.status 'failed' union member for on-chain reverts
  - EVM waitForConfirmation fallback receipt query pattern
  - stage6Confirm 3-way status branching (confirmed/failed/submitted)
  - SUBMITTED status preserved on confirmation timeout (not overwritten to FAILED)
affects: [solana-adapter, pipeline, mcp, sdk]

# Tech tracking
tech-stack:
  added: []
  patterns: [fallback-receipt-query, return-value-branching]

key-files:
  modified:
    - packages/core/src/interfaces/chain-adapter.types.ts
    - packages/adapters/evm/src/adapter.ts
    - packages/daemon/src/pipeline/stages.ts
    - packages/adapters/evm/src/__tests__/evm-adapter.test.ts
    - packages/daemon/src/__tests__/pipeline.test.ts
    - packages/daemon/src/__tests__/pipeline-notification.test.ts

key-decisions:
  - "waitForConfirmation never throws -- all error paths return SubmitResult with status"
  - "submitted status on timeout means 'still pending' -- not overwritten to FAILED"
  - "On-chain revert returns 'failed' status -- distinct from timeout 'submitted'"

patterns-established:
  - "Fallback receipt query: on any waitForTransactionReceipt error, try getTransactionReceipt before giving up"
  - "Return-value branching: stage6Confirm uses result.status instead of try-catch for control flow"

# Metrics
duration: 3min
completed: 2026-02-13
---

# Phase 96 Plan 01: Pipeline Confirmation Fix Summary

**EVM waitForConfirmation fallback receipt query + stage6Confirm 3-way status branching to prevent SUBMITTED->FAILED false overwrite**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-13T12:08:30Z
- **Completed:** 2026-02-13T12:11:20Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- SubmitResult.status extended with 'failed' for on-chain revert detection
- EVM waitForConfirmation now falls back to getTransactionReceipt on timeout/RPC errors, accurately detecting on-chain status
- stage6Confirm replaced try-catch with 3-way return-value branching: confirmed->CONFIRMED, failed->FAILED, submitted->keep SUBMITTED
- BUG-015 root cause eliminated: SUBMITTED transactions no longer falsely marked FAILED on confirmation timeout
- 4 new tests + 2 modified tests covering all paths, 1,330 total tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: SubmitResult type + EVM adapter fallback receipt** - `362f83d` (fix)
2. **Task 2: Stage 6 return-value branching + test updates** - `9eaca9b` (fix)

## Files Created/Modified
- `packages/core/src/interfaces/chain-adapter.types.ts` - Added 'failed' to SubmitResult.status union
- `packages/adapters/evm/src/adapter.ts` - waitForConfirmation fallback receipt query, reverted->failed
- `packages/daemon/src/pipeline/stages.ts` - stage6Confirm 3-way branching (confirmed/failed/submitted)
- `packages/adapters/evm/src/__tests__/evm-adapter.test.ts` - 3 new tests, 1 modified (fallback, RPC error, revert)
- `packages/daemon/src/__tests__/pipeline.test.ts` - 1 new test (on-chain revert), 1 modified (submitted keeps SUBMITTED)
- `packages/daemon/src/__tests__/pipeline-notification.test.ts` - 1 modified (TX_FAILED on failed status, not throw)

## Decisions Made
- waitForConfirmation never throws: all error paths return SubmitResult with appropriate status, moving control flow from exception-based to return-value-based
- submitted status on timeout means "still pending": DB stays at SUBMITTED, no notification fired, no throw. This is the core BUG-015 fix
- On-chain revert returns 'failed' status: distinct from timeout 'submitted', allows accurate DB FAILED + TX_FAILED notification

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- BUG-015 resolved: EVM confirmation timeout no longer marks on-chain success as FAILED
- Solana adapter could benefit from same fallback pattern (noted in BUG-015, deferred to separate plan)
- Ready for Phase 96 Plan 02 (if exists) or next phase

## Self-Check: PASSED

- All 7 files verified present
- Both commits (362f83d, 9eaca9b) verified in git log
- Key content verified: 'failed' in SubmitResult, getTransactionReceipt in adapter, result.status branch in stage6

---
*Phase: 96-pipeline-confirmation-fix*
*Completed: 2026-02-13*
