---
phase: 399-core-rpc-proxy-engine
plan: 02
subsystem: rpc-proxy
tags: [completion-waiter, event-bus, nonce-tracker, sync-pipeline, pipeline]

requires:
  - phase: 398-type-system-infra-foundation
    provides: PIPELINE_HALTED error code, PipelineContext interface

provides:
  - CompletionWaiter (EventBus-based transaction completion waiting)
  - SyncPipelineExecutor (synchronous pipeline wrapper for JSON-RPC)
  - NonceTracker (per-address nonce management for Forge scripts)

affects: [399-03, 400-route-assembly]

tech-stack:
  added: []
  patterns: [pipeline-halted-catch-pattern, eventbus-completion-bridge]

key-files:
  created:
    - packages/daemon/src/rpc-proxy/completion-waiter.ts
    - packages/daemon/src/rpc-proxy/sync-pipeline.ts
    - packages/daemon/src/rpc-proxy/nonce-tracker.ts
    - packages/daemon/src/__tests__/rpc-proxy/completion-waiter.test.ts
    - packages/daemon/src/__tests__/rpc-proxy/sync-pipeline.test.ts
    - packages/daemon/src/__tests__/rpc-proxy/nonce-tracker.test.ts

key-decisions:
  - "PIPELINE_HALTED catch pattern keeps existing pipeline code unmodified (Anti-Pattern 1)"
  - "Default timeouts: DELAY 300s, APPROVAL 600s (configurable via SettingsService)"
  - "NonceTracker uses case-insensitive address keys"

patterns-established:
  - "SyncPipelineExecutor wraps fire-and-forget pipeline into request-response"
  - "CompletionWaiter: two global EventBus listeners, pending Map keyed by txId"

requirements-completed: [SIGN-01, SIGN-02, SIGN-04]

duration: 15min
completed: 2026-03-13
---

# Plan 399-02: CompletionWaiter + SyncPipelineExecutor + NonceTracker Summary

**EventBus-based completion waiting for DELAY/APPROVAL tiers, synchronous pipeline executor wrapping 6-stage pipeline, and per-address nonce tracking for Forge multi-TX support**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-13T12:08:00Z
- **Completed:** 2026-03-13T12:23:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- CompletionWaiter bridges async DELAY/APPROVAL pipeline flow with synchronous JSON-RPC responses via EventBus events
- SyncPipelineExecutor wraps the existing 6-stage pipeline with PIPELINE_HALTED catch pattern, zero modifications to existing pipeline code
- NonceTracker solves Pitfall 4 (Forge Script Multi-TX Nonce) with per-address sequential nonce allocation
- 26 tests covering completion/failure/timeout, INSTANT/DELAY/APPROVAL paths, and nonce lifecycle

## Task Commits

1. **Task 1: CompletionWaiter + NonceTracker** - `3642315d` (feat)
2. **Task 2: SyncPipelineExecutor** - `e60a6772` (feat)

## Files Created/Modified
- `packages/daemon/src/rpc-proxy/completion-waiter.ts` - EventBus transaction completion waiting with timeout and dispose
- `packages/daemon/src/rpc-proxy/sync-pipeline.ts` - Synchronous pipeline executor with PIPELINE_HALTED catch
- `packages/daemon/src/rpc-proxy/nonce-tracker.ts` - Per-address nonce management with confirm/rollback
- `packages/daemon/src/__tests__/rpc-proxy/completion-waiter.test.ts` - 6 tests
- `packages/daemon/src/__tests__/rpc-proxy/sync-pipeline.test.ts` - 8 tests
- `packages/daemon/src/__tests__/rpc-proxy/nonce-tracker.test.ts` - 12 tests

## Decisions Made
- Zero modifications to existing pipeline code (Anti-Pattern 1)
- Default timeouts: DELAY 300s, APPROVAL 600s, configurable via SettingsService

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed timeout regex in completion waiter test**
- **Found during:** Task 1 (CompletionWaiter)
- **Issue:** Test regex `/timeout/i` did not match actual error message "timed out"
- **Fix:** Changed regex to `/timed out/i`
- **Files modified:** completion-waiter.test.ts
- **Verification:** Test passes
- **Committed in:** 3642315d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial test assertion fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All runtime components ready for RpcMethodHandlers (399-03) integration

---
*Phase: 399-core-rpc-proxy-engine*
*Completed: 2026-03-13*
