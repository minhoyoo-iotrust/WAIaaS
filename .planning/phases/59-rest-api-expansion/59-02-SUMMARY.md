---
phase: 59-rest-api-expansion
plan: 02
subsystem: api
tags: [hono, openapi, zod, rest, admin, kill-switch, error-hints, agent-crud]

# Dependency graph
requires:
  - phase: 59-rest-api-expansion
    plan: 01
    provides: OpenAPIHono pattern, 6 new endpoints, cursor pagination, ownerState
  - phase: 58-openapihono-getassets
    provides: OpenAPIHono createRoute() pattern, openapi-schemas.ts
provides:
  - 9 new REST endpoints (PUT/DELETE agents + 6 admin operations)
  - Error hint field enrichment (32 hint templates for AI agent self-recovery)
  - Kill switch admin management (activate/deactivate/status)
  - JWT secret rotation endpoint
  - Daemon status endpoint (uptime/agent count/session count)
affects: [61-ts-sdk, 62-python-sdk, 63-mcp-server]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Error hint enrichment: errorHintMap + resolveHint() with {variable} template substitution"
    - "Admin routes bypass kill switch guard (admin must operate during emergency)"
    - "In-memory kill switch state holder with setKillSwitchState/getKillSwitchState"

key-files:
  created:
    - packages/daemon/src/api/error-hints.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/__tests__/api-hint-field.test.ts
    - packages/daemon/src/__tests__/api-admin-endpoints.test.ts
  modified:
    - packages/core/src/errors/base-error.ts
    - packages/daemon/src/api/middleware/error-handler.ts
    - packages/daemon/src/api/middleware/kill-switch-guard.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/agents.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts

key-decisions:
  - "32 hint entries (not 31): RATE_LIMIT_EXCEEDED included in POLICY domain hints"
  - "Admin paths bypass kill switch guard: /v1/admin/* always accessible for emergency management"
  - "Kill switch state managed in-memory via closure in server.ts (not persisted to DB in v1.3)"
  - "Session count uses raw integer comparison (not Date object) for Drizzle SQLite timestamp columns"

patterns-established:
  - "Error hint enrichment: resolveHint(code, context) for AI agent self-recovery guidance"
  - "Admin bypass: kill switch guard whitelists /v1/admin/* paths"
  - "AdminRouteDeps interface: DI for admin operations (kill switch state, shutdown callback)"

# Metrics
duration: 9min
completed: 2026-02-10
---

# Phase 59 Plan 02: Admin Endpoints + Error Hint Enrichment Summary

**9 new REST endpoints (agent PUT/DELETE + 6 admin ops) with 32-code error hint enrichment for AI agent self-recovery and 29 new test cases**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-10T14:46:40Z
- **Completed:** 2026-02-10T14:55:56Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Added error hint field enrichment: 32 hint templates across 7 error domains enabling AI agents to self-recover from errors
- Added 9 new REST endpoints completing the 33-endpoint API surface (PUT/DELETE agents + 6 admin operations)
- Admin paths bypass kill switch guard enabling emergency management while system is locked
- 29 new tests (12 hint + 17 admin/CRUD) with zero regressions on existing 363 tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Add hint field to WAIaaSError + error-hints.ts + errorHandler integration** - `8d5f143` (feat)
2. **Task 2: Add agent PUT/DELETE + admin routes + server wiring + tests** - `0ee52fb` (feat)

## Files Created/Modified
- `packages/daemon/src/api/error-hints.ts` - 32 hint templates + resolveHint() with variable substitution
- `packages/daemon/src/api/routes/admin.ts` - 6 admin routes (status, kill-switch POST/GET, recover, shutdown, rotate-secret)
- `packages/core/src/errors/base-error.ts` - WAIaaSError hint property (constructor + toJSON)
- `packages/daemon/src/api/middleware/error-handler.ts` - resolveHint() integration
- `packages/daemon/src/api/middleware/kill-switch-guard.ts` - Admin path bypass
- `packages/daemon/src/api/routes/openapi-schemas.ts` - 8 new schemas + hint in ErrorResponseSchema
- `packages/daemon/src/api/routes/agents.ts` - PUT /agents/:id and DELETE /agents/:id routes
- `packages/daemon/src/api/routes/index.ts` - Barrel export for adminRoutes
- `packages/daemon/src/api/server.ts` - Admin auth middleware wiring + route registration
- `packages/daemon/src/__tests__/api-hint-field.test.ts` - 12 hint field tests
- `packages/daemon/src/__tests__/api-admin-endpoints.test.ts` - 17 admin + CRUD tests

## Decisions Made
- **32 hint entries (not 31):** The plan stated "31 of 40 actionable error codes" but actual count is 32 including RATE_LIMIT_EXCEEDED in POLICY domain. This exceeds the minimum requirement.
- **Admin bypass for kill switch guard:** Admin paths (/v1/admin/*) bypass the kill switch guard so administrators can manage the kill switch state even when the system is locked down. This is essential for emergency recovery.
- **In-memory kill switch state:** Kill switch state is managed in-memory via a closure object in server.ts rather than persisted to DB. For v1.3 this is sufficient; full DaemonLifecycle integration can persist state in v1.4.
- **Integer comparison for session count:** Drizzle ORM's `{ mode: 'timestamp' }` column comparison with Date objects caused runtime errors in SQLite. Fixed by comparing directly with epoch seconds integer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed session count query using Date object comparison**
- **Found during:** Task 2
- **Issue:** Drizzle SQL template with `new Date(nowSec * 1000)` for comparing `sessions.expiresAt` caused a 500 error because SQLite stores timestamps as integers
- **Fix:** Changed to compare directly with `nowSec` integer value
- **Files modified:** packages/daemon/src/api/routes/admin.ts
- **Verification:** Admin status endpoint returns 200 with correct active session count
- **Committed in:** 0ee52fb (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added admin path bypass in kill switch guard**
- **Found during:** Task 2
- **Issue:** Without bypass, kill switch would block admin endpoints, preventing recovery
- **Fix:** Added `/v1/admin/*` path check in createKillSwitchGuard to bypass the guard
- **Files modified:** packages/daemon/src/api/middleware/kill-switch-guard.ts
- **Verification:** Admin routes accessible even when kill switch is globally ACTIVATED
- **Committed in:** 0ee52fb (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes essential for correctness. No scope creep.

## Issues Encountered
- Unused variable TS error in test file (TS6133) caught by TypeScript build after tests passed in Vitest. Fixed by using the `res` variable in assertion.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 33 REST endpoints operational (18 original + 6 from 59-01 + 9 from 59-02)
- Phase 59 complete -- ready for Phase 60 (notification system)
- SDK/MCP phases (61-63) have full API surface to consume
- Pre-existing known issues remain: flaky lifecycle.test.ts timer test, CLI e2e-errors.test.ts 401-vs-404

## Self-Check: PASSED
