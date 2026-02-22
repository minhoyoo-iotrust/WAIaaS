---
phase: 230-integration-wiring-fixes
plan: 02
subsystem: testing
tags: [integration-tests, background-workers, incoming-tx, polling, gap-recovery, vitest]

# Dependency graph
requires:
  - phase: 230-01
    provides: BackgroundWorkers shared instance, polling worker handlers with pollAll(), gap recovery wiring
provides:
  - Integration tests verifying BUG-1 (6 workers register to shared BackgroundWorkers)
  - Integration tests verifying BUG-2 (polling workers invoke subscriber.pollAll() for solana and ethereum)
  - Integration tests verifying BUG-3 (onGapRecovery wires through createGapRecoveryHandler to subscriber.pollAll())
affects: [incoming-tx-monitoring, daemon-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns: [integration test with real service + mock boundaries, worker handler extraction from register.mock.calls]

key-files:
  created:
    - packages/daemon/src/services/incoming/__tests__/integration-wiring.test.ts
  modified: []

key-decisions:
  - "Access onGapRecovery callback via (multiplexer as any).deps.onGapRecovery for direct invocation testing"
  - "Test pollAll() invocation by creating wallets via DB mock (allFn return) so multiplexer has active connections"

patterns-established:
  - "Worker handler extraction: find specific worker by name from workers.register.mock.calls, extract handler function"
  - "Gap recovery testing: access multiplexer deps through service internals to invoke onGapRecovery directly"

requirements-completed: [SUB-02, SUB-03, SUB-04, SUB-05, STO-02, STO-03, STO-05, CFG-04]

# Metrics
duration: 7min
completed: 2026-02-22
---

# Phase 230 Plan 02: Integration Wiring Tests Summary

**7 integration tests verifying cross-component wiring for BackgroundWorkers sharing, polling worker pollAll() invocation, and gap recovery callback chain**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-21T23:12:18Z
- **Completed:** 2026-02-21T23:19:08Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments
- BUG-1 tests: verify 6 workers register to provided BackgroundWorkers instance with correct names and callable handlers
- BUG-2 tests: verify Solana and EVM polling workers invoke subscriber.pollAll(), with error handling for RPC failures
- BUG-3 tests: verify onGapRecovery callback chains through createGapRecoveryHandler to subscriber.pollAll(), and handles missing chain:network gracefully
- All 7 new tests pass alongside existing 2852 daemon tests (2859 total)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create integration-wiring.test.ts with tests for BUG-1, BUG-2, BUG-3 fixes** - `fe182e1f` (test)

## Files Created/Modified
- `packages/daemon/src/services/incoming/__tests__/integration-wiring.test.ts` - 7 integration tests covering all 3 wiring bug fixes from Plan 01

## Decisions Made
- Accessed onGapRecovery callback via `(multiplexer as any).deps.onGapRecovery` -- cleanest approach since SubscriptionMultiplexer stores deps as private readonly
- Set up wallets via sqlite._allFn mock return so multiplexer creates real subscriber connections during service.start()
- Used `vi.spyOn(console, 'warn')` to verify error logging in polling worker error handling test

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All integration wiring fixes for incoming TX monitoring are complete (both Plan 01 implementation and Plan 02 tests)
- Phase 230 is fully done -- ready for next phase

## Self-Check: PASSED

- [x] integration-wiring.test.ts exists
- [x] Commit fe182e1f found
- [x] All 7 tests pass
- [x] Typecheck passes

---
*Phase: 230-integration-wiring-fixes*
*Completed: 2026-02-22*
