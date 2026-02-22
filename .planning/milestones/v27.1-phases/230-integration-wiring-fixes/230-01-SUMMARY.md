---
phase: 230-integration-wiring-fixes
plan: 01
subsystem: infra
tags: [background-workers, incoming-tx, subscription-multiplexer, gap-recovery, polling]

# Dependency graph
requires:
  - phase: 224-229 (v27.1 incoming TX phases)
    provides: IncomingTxMonitorService, SubscriptionMultiplexer, BackgroundWorkers, createGapRecoveryHandler
provides:
  - Shared BackgroundWorkers instance between daemon lifecycle and IncomingTxMonitorService
  - SubscriptionMultiplexer accessor methods (getSubscribersForChain, getSubscriberEntries)
  - Wired polling worker handlers (Solana + EVM) calling subscriber.pollAll()
  - Wired gap recovery callback to createGapRecoveryHandler
affects: [incoming-tx-monitoring, daemon-lifecycle]

# Tech tracking
tech-stack:
  added: []
  patterns: [pre-creation of shared instances before fail-soft steps, multiplexer accessor pattern for worker-subscriber wiring]

key-files:
  created: []
  modified:
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/services/incoming/subscription-multiplexer.ts
    - packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts

key-decisions:
  - "BackgroundWorkers pre-created with double guard (before Step 4c-9 + inside Step 6 try block) for defensive coding"
  - "Polling workers use structural typing cast (subscriber as unknown as { pollAll }) since pollAll() is not on IChainSubscriber interface"

patterns-established:
  - "Pre-creation pattern: shared instances created before fail-soft steps that depend on them"
  - "Multiplexer accessor pattern: getSubscribersForChain(prefix) filters connections by chain key prefix"

requirements-completed: [SUB-02, SUB-03, SUB-04, SUB-05, STO-02, STO-03, STO-05, CFG-04]

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 230 Plan 01: Integration Wiring Fixes Summary

**3 cross-phase wiring bugs fixed: BackgroundWorkers orphan, empty polling workers, and gap recovery stub -- connecting existing tested components at daemon lifecycle level**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-21T23:07:27Z
- **Completed:** 2026-02-21T23:10:01Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- BUG-1 FIXED: BackgroundWorkers instance shared between daemon and IncomingTxMonitorService (no orphan instance)
- BUG-2 FIXED: Polling workers 5 (Solana) and 6 (EVM) now call subscriber.pollAll() via multiplexer accessors
- BUG-3 FIXED: onGapRecovery callback wired to createGapRecoveryHandler using multiplexer.getSubscriberEntries()
- All 68 existing tests pass (15 monitor + 19 multiplexer + 20 pitfall + 14 resilience)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix BUG-1 BackgroundWorkers + BUG-2 multiplexer accessor + BUG-3 gap recovery wiring** - `61324096` (fix)

## Files Created/Modified
- `packages/daemon/src/lifecycle/daemon.ts` - Pre-create BackgroundWorkers before Step 4c-9; remove duplicate creation in Step 6
- `packages/daemon/src/services/incoming/subscription-multiplexer.ts` - Add getSubscriberEntries() and getSubscribersForChain() accessor methods
- `packages/daemon/src/services/incoming/incoming-tx-monitor-service.ts` - Import createGapRecoveryHandler; fill Worker 5/6 handlers; wire onGapRecovery callback

## Decisions Made
- BackgroundWorkers uses double guard pattern (before Step 4c-9 AND inside Step 6) for defensive coding -- ensures workers instance exists even if execution flow changes
- Polling workers cast subscriber via structural typing since pollAll() exists on concrete implementations but not on IChainSubscriber interface

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All integration wiring for incoming TX monitoring is complete
- Ready for Plan 02 (additional integration fixes if any)

## Self-Check: PASSED

- [x] daemon.ts exists
- [x] subscription-multiplexer.ts exists
- [x] incoming-tx-monitor-service.ts exists
- [x] SUMMARY.md exists
- [x] Commit 61324096 found

---
*Phase: 230-integration-wiring-fixes*
*Completed: 2026-02-22*
