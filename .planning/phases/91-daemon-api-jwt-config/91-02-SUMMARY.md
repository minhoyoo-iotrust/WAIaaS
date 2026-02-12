---
phase: 91-daemon-api-jwt-config
plan: 02
subsystem: testing
tags: [vitest, wallet-terminology, agent-rename, test-refactor, notification-boundary]

# Dependency graph
requires:
  - phase: 91-daemon-api-jwt-config
    provides: 27 renamed daemon source files (plan 01)
provides:
  - 37 daemon test files updated from agent to wallet terminology
  - All 681 daemon tests passing with wallet terminology
  - NotificationPayload.agentId boundary correctly preserved in tests
  - database-policy-engine.ts raw SQL agent_id bug fixed
affects: [core-interfaces, notification-payload-rename]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Core interface boundary: NotificationPayload.agentId stays until @waiaas/core rename"
    - "migration-runner.test.ts preserves old agent references (tests v3 migration DDL)"

key-files:
  created: []
  modified:
    - packages/daemon/src/__tests__/*.test.ts (37 test files)
    - packages/daemon/src/pipeline/database-policy-engine.ts (raw SQL fix)

key-decisions:
  - "NotificationPayload.agentId kept in test assertions (core interface unchanged)"
  - "migration-runner.test.ts excluded from rename (tests v2/v3 migration correctness)"
  - "Fixed database-policy-engine.ts raw SQL agent_id -> wallet_id (missed in plan 01)"

patterns-established:
  - "Notification test boundary: daemon tests use payload.agentId when checking NotificationPayload fields"
  - "Config test boundary: config-loader.test.ts already uses wallet terminology (no changes needed)"

# Metrics
duration: 18min
completed: 2026-02-13
---

# Phase 91 Plan 02: Daemon Test Files Wallet Terminology Summary

**37 daemon test files renamed from agent to wallet terminology with NotificationPayload.agentId boundary preserved and raw SQL bug fixed**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-02-13T17:07:00Z
- **Completed:** 2026-02-13T17:25:00Z
- **Tasks:** 2
- **Files modified:** 38 (37 test files + 1 source fix)

## Accomplishments
- Updated 12 API/route test files (Task 1) and 25 infrastructure/pipeline/e2e test files (Task 2)
- Fixed database-policy-engine.ts raw SQL `agent_id` -> `wallet_id` (missed in Plan 01)
- Correctly preserved `NotificationPayload.agentId` boundary in 4 notification test files
- All 681 tests pass across 44 test files with zero regressions
- migration-runner.test.ts intentionally excluded (tests v3 migration from agents -> wallets)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update 12 API/route test files** - `3ca1e4c` (feat)
2. **Task 2: Update 25 infra/pipeline/e2e test files + source fix** - `10f4474` (feat)

## Files Created/Modified

### Task 1 (12 files)
- `api-agents.test.ts` - /v1/agents -> /v1/wallets, agentId -> walletId, agt -> wlt JWT claims
- `api-sessions.test.ts` - seedAgent -> seedWallet, agentId -> walletId in requests
- `api-session-renewal.test.ts` - Same patterns as api-sessions
- `api-transactions.test.ts` - agentId -> walletId, agt -> wlt JWT claims
- `api-policies.test.ts` - agentId -> walletId, AGENT_NOT_FOUND -> WALLET_NOT_FOUND
- `api-admin-endpoints.test.ts` - agentCount -> walletCount, endpoint paths
- `api-server.test.ts` - AGENT_NOT_FOUND -> WALLET_NOT_FOUND error codes
- `api-new-endpoints.test.ts` - /v1/agents -> /v1/wallets, agt -> wlt
- `api-hint-field.test.ts` - Updated hint text assertions to match new error-hints.ts
- `auth-coverage-audit.test.ts` - TEST_AGENT_ID -> TEST_WALLET_ID, agt -> wlt
- `admin-serving.test.ts` - max_sessions_per_agent -> max_sessions_per_wallet
- `admin-notification-api.test.ts` - agentId -> walletId in log queries

### Task 2 (25 test files + 1 source file)
- Pipeline tests (7): pipeline.test.ts, pipeline-integration.test.ts, pipeline-notification.test.ts, pipeline-stage1-stage3.test.ts, pipeline-stage4.test.ts, pipeline-stage5-execute.test.ts, pipeline-5type-e2e.test.ts
- Infrastructure tests (3): session-auth.test.ts, jwt-secret-manager.test.ts, keystore.test.ts
- Database tests (2): database-policy-engine.test.ts, database.test.ts
- Workflow tests (3): owner-state.test.ts, approval-workflow.test.ts, delay-queue.test.ts
- E2E tests (3): session-lifecycle-e2e.test.ts, workflow-owner-e2e.test.ts, evm-lifecycle-e2e.test.ts
- Auth tests (2): owner-auth.test.ts, owner-auth-siwe.test.ts
- Notification tests (4): notification-service.test.ts, notification-channels.test.ts, notification-log.test.ts, route-notification.test.ts
- Policy audit (1): policy-engine-coverage-audit.test.ts
- **Source fix**: database-policy-engine.ts (raw SQL agent_id -> wallet_id)

### Intentionally Excluded
- `migration-runner.test.ts` - Tests v2/v3 migration DDL that references `agents` table and `agent_id` columns

## Decisions Made
1. **NotificationPayload.agentId boundary preserved** - The `@waiaas/core` NotificationPayload interface still uses `agentId`. Daemon maps this at the DB boundary (notification_logs.wallet_id). Test assertions correctly use `payload.agentId`.
2. **migration-runner.test.ts excluded** - Contains raw SQL for v2/v3 migration testing where old `agents` table and `agent_id` columns are correct test data.
3. **config-loader.test.ts already clean** - No changes needed; it already uses wallet terminology after Plan 01 source updates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed database-policy-engine.ts raw SQL agent_id references**
- **Found during:** Task 2 (pipeline-stage1-stage3.test.ts failures)
- **Issue:** `database-policy-engine.ts` lines 415 and 479 contained raw SQL `WHERE agent_id = ?` / `WHERE (agent_id = ? OR agent_id IS NULL)` but the DB column was renamed to `wallet_id` in Plan 91-01's v3 migration
- **Fix:** Changed `agent_id` to `wallet_id` in both raw SQL queries
- **Files modified:** packages/daemon/src/pipeline/database-policy-engine.ts
- **Verification:** All 681 tests pass, specifically database-policy-engine, pipeline-stage1-stage3, session-lifecycle-e2e, workflow-owner-e2e, evm-lifecycle-e2e tests
- **Committed in:** 10f4474 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed notification test payload.walletId -> payload.agentId**
- **Found during:** Task 2 (notification-service.test.ts failures)
- **Issue:** Bulk sed rename incorrectly changed `payload.agentId` to `payload.walletId` in notification test assertions, but `NotificationPayload` (from @waiaas/core) still uses `agentId`
- **Fix:** Reverted `payload.walletId` back to `payload.agentId` in 4 notification test files; fixed `makePayload({ walletId: ... })` to `makePayload({ agentId: ... })` in notification-channels.test.ts
- **Files modified:** notification-service.test.ts, notification-channels.test.ts
- **Verification:** All notification tests pass
- **Committed in:** 10f4474 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for test correctness. The database-policy-engine.ts fix was a bug from Plan 01. The notification boundary fix was a sed over-replacement.

## Issues Encountered
- Initial bulk sed rename produced 354 test failures (expected baseline since source was already renamed)
- After Task 1 + Task 2 sed replacements: 32 failures remained, traced to 3 root causes (raw SQL column, notification interface boundary, error message text)
- All resolved through targeted fixes

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All daemon test files use wallet terminology consistently
- 681/681 tests pass with zero regressions
- Ready for @waiaas/core interface rename in future milestone (NotificationPayload.agentId -> walletId)

---
*Phase: 91-daemon-api-jwt-config*
*Completed: 2026-02-13*
