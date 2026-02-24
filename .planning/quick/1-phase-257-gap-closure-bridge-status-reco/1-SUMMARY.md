---
phase: 257-staking-pipeline-integration-fix
plan: 01
subsystem: api
tags: [staking, bridge-status, async-polling, metadata, lido, jito, pipeline]

# Dependency graph
requires:
  - phase: 254-lido-evm-staking-provider
    provides: Lido staking action provider + pipeline integration
  - phase: 255-jito-solana-staking-provider
    provides: Jito staking action provider + pipeline integration
  - phase: 256-staking-api-async-tracking
    provides: AsyncPollingService, IAsyncStatusTracker, staking API route
provides:
  - bridge_status=PENDING enrollment after unstake pipeline completion (lido/jito)
  - metadata persistence with {provider, action} for staking position queries
  - Integration tests verifying both gap closures
affects: [staking-api, async-polling, action-routes]

# Tech tracking
tech-stack:
  added: []
  patterns: [post-pipeline-db-update, bridge-status-enrollment]

key-files:
  created:
    - packages/daemon/src/__tests__/actions-staking-integration.test.ts
  modified:
    - packages/daemon/src/api/routes/actions.ts

key-decisions:
  - "GAP-2 metadata UPDATE after Stage 1 (synchronous, before fire-and-forget) ensures metadata is available immediately"
  - "GAP-1 bridge_status enrollment after Stage 6 (inside fire-and-forget) ensures only confirmed unstakes are tracked"
  - "trackerMap pattern for provider-to-tracker mapping (lido_staking -> lido-withdrawal, jito_staking -> jito-epoch)"

patterns-established:
  - "Post-pipeline metadata persistence: UPDATE metadata after Stage 1 for action-specific DB queries"
  - "Bridge status enrollment: Conditional bridge_status=PENDING after Stage 6 for async tracking"

requirements-completed: [ASYNC-01, ASYNC-02, ASYNC-03, ASYNC-04, SAPI-01, SAPI-02]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Quick Task 1: Staking Pipeline Integration Gap Closure Summary

**Post-pipeline bridge_status enrollment + metadata persistence in actions.ts, closing 2 integration gaps for unstake async tracking and staking position queries**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T13:27:53Z
- **Completed:** 2026-02-24T13:32:10Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- GAP-2 closed: Action provider metadata ({provider, action}) now persisted in transactions.metadata column after Stage 1, enabling GET /v1/wallet/staking LIKE queries to find staking transactions
- GAP-1 closed: Unstake actions (lido_staking, jito_staking) now set bridge_status=PENDING + bridge_metadata with tracker name after Stage 6, enabling AsyncPollingService to pick up and poll these transactions
- 4 integration tests verify both gaps are closed with full pipeline execution

## Task Commits

Each task was committed atomically:

1. **Task 1: actions.ts post-pipeline bridge_status + metadata persistence** - `8cfaa0bb` (fix)
2. **Task 2: Integration tests for bridge_status enrollment + metadata persistence** - `bd933b75` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/actions.ts` - Added metadata UPDATE after Stage 1 (GAP-2) and bridge_status enrollment after Stage 6 for unstake (GAP-1)
- `packages/daemon/src/__tests__/actions-staking-integration.test.ts` - 4 integration tests: stake metadata, lido unstake bridge_status, jito unstake bridge_status, non-staking no bridge_status

## Decisions Made
- Metadata UPDATE placed after Stage 1 (synchronous path) rather than in fire-and-forget block, ensuring metadata is written before any asynchronous failure could lose it
- Bridge status enrollment placed after Stage 6 (inside fire-and-forget block), ensuring only transactions that actually confirm on-chain get enrolled in async tracking
- Used a trackerMap record to map provider names to tracker names, keeping the mapping explicit and easily extensible

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ActionDefinition description minimum length in test mocks**
- **Found during:** Task 2 (integration test writing)
- **Issue:** Mock provider action descriptions were under 20 characters, failing ActionDefinitionSchema validation
- **Fix:** Extended descriptions to meet the min(20) requirement
- **Files modified:** packages/daemon/src/__tests__/actions-staking-integration.test.ts
- **Verification:** All 4 tests pass
- **Committed in:** bd933b75 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test setup)
**Impact on plan:** Minor test setup fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both integration gaps are closed -- staking pipeline is fully functional
- AsyncPollingService will now find and poll unstake transactions
- GET /v1/wallet/staking will now return actual staking positions from DB
- Ready for milestone v28.4 audit completion

---
*Quick Task: 1-phase-257-gap-closure-bridge-status-reco*
*Completed: 2026-02-24*
