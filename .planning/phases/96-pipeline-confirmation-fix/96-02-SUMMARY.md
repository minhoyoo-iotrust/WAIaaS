---
phase: 96-pipeline-confirmation-fix
plan: 02
subsystem: solana-adapter
tags: [solana, confirmation, fallback, rpc-error, submitted]

# Dependency graph
requires:
  - phase: 96-pipeline-confirmation-fix
    provides: stage6Confirm 3-way return-value branching, 'failed' SubmitResult status
  - phase: 48-core-infra
    provides: SolanaAdapter IChainAdapter implementation
provides:
  - Solana waitForConfirmation RPC error fallback (return submitted instead of throw)
  - Consistent confirmation error handling across both adapters (EVM + Solana)
affects: [pipeline, mcp, sdk]

# Tech tracking
tech-stack:
  added: []
  patterns: [rpc-error-fallback-submitted]

key-files:
  modified:
    - packages/adapters/solana/src/adapter.ts
    - packages/adapters/solana/src/__tests__/solana-adapter.test.ts

key-decisions:
  - "Solana waitForConfirmation catch block returns submitted instead of throwing WAIaaSError"
  - "RPC polling errors are not transaction failures -- preserve SUBMITTED status for later confirmation"

patterns-established:
  - "Both EVM and Solana adapters: waitForConfirmation never throws, always returns SubmitResult"

# Metrics
duration: 2min
completed: 2026-02-13
---

# Phase 96 Plan 02: Solana Confirmation Fallback Summary

**Solana waitForConfirmation returns submitted on RPC error instead of throwing, matching EVM adapter fallback pattern**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-13T12:13:42Z
- **Completed:** 2026-02-13T12:15:30Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Solana waitForConfirmation catch block now returns `{ txHash, status: 'submitted' }` instead of throwing WAIaaSError
- RPC errors during confirmation polling no longer trigger Stage 6 FAILED path -- SUBMITTED status preserved
- Both adapters (EVM + Solana) now follow identical "never throw" confirmation pattern
- Updated test from expecting CHAIN_ERROR throw to verifying submitted return value
- All 1,330 tests passing with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Solana adapter waitForConfirmation fallback + test update** - `3eb5ae9` (fix)

## Files Created/Modified
- `packages/adapters/solana/src/adapter.ts` - catch block in waitForConfirmation: throw -> return submitted
- `packages/adapters/solana/src/__tests__/solana-adapter.test.ts` - RPC failure test: expect submitted return, not throw

## Decisions Made
- Solana waitForConfirmation catch block returns submitted instead of throwing WAIaaSError -- consistent with EVM adapter pattern from Plan 01
- RPC polling errors (rate limit, connection lost, etc.) are not transaction failures. Already-submitted transactions may confirm later, so SUBMITTED status must be preserved
- ensureConnected() guard (via getRpc()) still throws ADAPTER_NOT_AVAILABLE when adapter is not connected -- this is correct because it's a programming error, not a runtime RPC issue

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- BUG-015 fully resolved across both adapters (EVM in Plan 01, Solana in Plan 02)
- Phase 96 complete: all plans executed
- Ready for next phase in v1.4.3 roadmap

## Self-Check: PASSED

- Both files verified present
- Commit 3eb5ae9 verified in git log
- Key content verified: `return { txHash, status: 'submitted' }` in catch block, test name updated

---
*Phase: 96-pipeline-confirmation-fix*
*Completed: 2026-02-13*
