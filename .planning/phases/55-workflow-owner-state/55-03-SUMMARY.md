---
phase: 55-workflow-owner-state
plan: 03
subsystem: workflow
tags: [owner-state, 3-state-machine, NONE-GRACE-LOCKED, downgrade, ownerAuth, TDD]

# Dependency graph
requires:
  - phase: 55-01
    provides: "DelayQueue with cancelDelay() for DELAY tier cancellation"
  - phase: 55-02
    provides: "ApprovalWorkflow with approve/reject for APPROVAL tier lifecycle"
  - phase: 52-02
    provides: "ownerAuth middleware (Ed25519 signature verification)"
provides:
  - "resolveOwnerState() pure function for NONE/GRACE/LOCKED classification"
  - "OwnerLifecycleService with setOwner/removeOwner/markOwnerVerified"
  - "downgradeIfNoOwner() for APPROVAL->DELAY when no owner"
  - "PUT /v1/agents/:id/owner endpoint (masterAuth)"
  - "POST /v1/transactions/:id/approve and /reject endpoints (ownerAuth)"
  - "POST /v1/transactions/:id/cancel endpoint (sessionAuth)"
affects: [56-pipeline-integration, stage4Wait-wiring, owner-verification-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Owner 3-State Machine: NONE->GRACE->LOCKED from agent fields"
    - "APPROVAL->DELAY downgrade when no owner registered"
    - "ownerAuth auto-verifies owner (GRACE->LOCKED transition on first successful auth)"

key-files:
  created:
    - packages/daemon/src/workflow/owner-state.ts
    - packages/daemon/src/__tests__/owner-state.test.ts
  modified:
    - packages/daemon/src/workflow/index.ts
    - packages/daemon/src/api/routes/agents.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/__tests__/api-agents.test.ts
    - packages/daemon/src/__tests__/api-transactions.test.ts

key-decisions:
  - "resolveOwnerState is a pure function (no DB, no side effects) -- easy to test and reuse"
  - "OwnerLifecycleService uses raw sqlite (consistent with DelayQueue/ApprovalWorkflow dual-DB pattern)"
  - "ownerAuth success auto-triggers markOwnerVerified (GRACE->LOCKED) -- no separate verification endpoint needed"
  - "LOCKED state returns 409 OWNER_ALREADY_CONNECTED on PUT /agents/:id/owner (not 403)"
  - "cancel route uses sessionAuth (agent cancels own tx), approve/reject use ownerAuth (owner action)"

patterns-established:
  - "CreateAppDeps now includes sqlite for raw DB access in route sub-routers"
  - "Workflow deps (approvalWorkflow, delayQueue, ownerLifecycle) passed through createApp -> transactionRoutes"

# Metrics
duration: 5min
completed: 2026-02-10
---

# Phase 55 Plan 03: Owner 3-State Machine Summary

**Owner NONE/GRACE/LOCKED state machine with lifecycle service, APPROVAL->DELAY downgrade, and transaction approve/reject/cancel API routes with 18 TDD tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-10T09:12:54Z
- **Completed:** 2026-02-10T09:17:57Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files created/modified:** 8

## Accomplishments
- Owner 3-State Machine (NONE/GRACE/LOCKED) with pure resolveOwnerState() function
- OwnerLifecycleService enforcing state transition rules (LOCKED blocks change/removal)
- downgradeIfNoOwner() automatically downgrades APPROVAL to DELAY when no owner registered
- PUT /v1/agents/:id/owner for owner registration with masterAuth
- POST /v1/transactions/:id/approve and /reject with ownerAuth + auto-verification
- POST /v1/transactions/:id/cancel for agent DELAY tx cancellation with sessionAuth
- 18 TDD tests covering all state transitions, lifecycle operations, and downgrade logic
- All 296 daemon tests passing with zero regressions

## Task Commits

Each task was committed atomically (TDD RED-GREEN cycle):

1. **RED: Failing tests for Owner 3-State machine** - `d3200d0` (test)
2. **GREEN: Implement Owner state machine + API routes** - `07f0a7b` (feat)

## Files Created/Modified
- `packages/daemon/src/workflow/owner-state.ts` - resolveOwnerState(), OwnerLifecycleService, downgradeIfNoOwner()
- `packages/daemon/src/__tests__/owner-state.test.ts` - 18 TDD tests for state machine and lifecycle
- `packages/daemon/src/workflow/index.ts` - Barrel export updated with owner-state exports
- `packages/daemon/src/api/routes/agents.ts` - Added PUT /agents/:id/owner endpoint
- `packages/daemon/src/api/routes/transactions.ts` - Added approve, reject, cancel endpoints
- `packages/daemon/src/api/server.ts` - Wire ownerAuth middleware, sqlite dep, workflow deps
- `packages/daemon/src/__tests__/api-agents.test.ts` - Pass sqlite to createApp
- `packages/daemon/src/__tests__/api-transactions.test.ts` - Pass sqlite to createApp

## Decisions Made
- **resolveOwnerState as pure function:** No DB access, no side effects. Takes `{ ownerAddress, ownerVerified }` and returns state. Makes testing trivial and allows reuse anywhere without DB dependency.
- **ownerAuth auto-triggers GRACE->LOCKED:** When ownerAuth middleware succeeds on approve/reject, markOwnerVerified is called automatically. No separate "verify owner" endpoint needed -- the first successful ownerAuth action proves ownership.
- **LOCKED returns 409 on owner change:** PUT /agents/:id/owner in LOCKED state responds 409 OWNER_ALREADY_CONNECTED rather than 403, because it's a conflict (owner exists and is verified) not an authorization failure.
- **cancel uses sessionAuth, approve/reject use ownerAuth:** Cancelling a DELAY tx is an agent self-service action (the agent cancels its own pending tx). Approving/rejecting is an owner action requiring wallet signature.
- **sqlite dep added to CreateAppDeps:** Agent routes now need raw sqlite for OwnerLifecycleService. All test files updated to pass `conn.sqlite` to createApp.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added sqlite to CreateAppDeps and updated test files**
- **Found during:** GREEN phase (regression test run)
- **Issue:** AgentRouteDeps interface changed to require `sqlite` for OwnerLifecycleService, but api-agents.test.ts and api-transactions.test.ts didn't pass `sqlite` to createApp, causing agent routes to not register (condition `deps.db && deps.sqlite && ...` failed)
- **Fix:** Added `sqlite?: SQLiteDatabase` to CreateAppDeps, added `sqlite: conn.sqlite` to both test files' createApp calls
- **Files modified:** api-agents.test.ts, api-transactions.test.ts, server.ts
- **Committed in:** 07f0a7b (GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to maintain backward compatibility with existing tests. No scope creep.

## Issues Encountered
None beyond the auto-fixed blocking issue above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Owner 3-State Machine ready for pipeline integration (downgradeIfNoOwner in stage3Policy)
- approve/reject/cancel routes ready for E2E testing
- OwnerLifecycleService wired into transactionRoutes via createApp deps
- All workflow services (DelayQueue, ApprovalWorkflow, OwnerLifecycleService) ready for Phase 56 pipeline integration

---
*Phase: 55-workflow-owner-state*
*Completed: 2026-02-10*

## Self-Check: PASSED
