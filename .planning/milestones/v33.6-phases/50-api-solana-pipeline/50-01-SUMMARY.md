---
phase: 50-api-solana-pipeline
plan: 01
subsystem: api
tags: [hono, middleware, http-server, health-endpoint, request-id, host-guard, kill-switch]

# Dependency graph
requires:
  - phase: 49-daemon-infra
    provides: DaemonLifecycle stubs (Steps 4/5), WAIaaSError, generateId, DaemonConfigSchema
provides:
  - createApp() factory returning Hono instance with 5 middleware + error handler
  - GET /health endpoint
  - requestId, hostGuard, killSwitchGuard, requestLogger middleware
  - errorHandler (WAIaaSError/ZodError/generic -> JSON)
affects: [50-02, 50-03, 50-04, all future route plans]

# Tech tracking
tech-stack:
  added: [hono 4.x, @hono/node-server]
  patterns: [Hono createMiddleware, app.onError handler, app.route() sub-router, app.request() testing]

key-files:
  created:
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/middleware/request-id.ts
    - packages/daemon/src/api/middleware/host-guard.ts
    - packages/daemon/src/api/middleware/kill-switch-guard.ts
    - packages/daemon/src/api/middleware/request-logger.ts
    - packages/daemon/src/api/middleware/error-handler.ts
    - packages/daemon/src/api/middleware/index.ts
    - packages/daemon/src/api/routes/health.ts
    - packages/daemon/src/api/index.ts
    - packages/daemon/src/__tests__/api-server.test.ts
  modified:
    - packages/daemon/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Hono createMiddleware pattern for all middleware (typed c.set/c.get)"
  - "hostGuard uses Host header string matching (not IP binding check)"
  - "killSwitchGuard factory pattern: createKillSwitchGuard(getState) for DI"
  - "errorHandler registered via app.onError (not middleware)"
  - "ZodError mapped to ACTION_VALIDATION_FAILED error code (400)"
  - "Generic errors mapped to SYSTEM_LOCKED (500)"

patterns-established:
  - "Hono middleware: createMiddleware() from hono/factory with c.set/c.get for request context"
  - "Error handling: app.onError with WAIaaSError/ZodError/generic branching"
  - "Route sub-routers: new Hono() per route file, mounted via app.route()"
  - "API testing: app.request() with Host header, no real HTTP server"
  - "createApp(deps) factory pattern for DI (getKillSwitchState, future extensibility)"

# Metrics
duration: 5min
completed: 2026-02-10
---

# Phase 50 Plan 01: Hono API Server Summary

**Hono 4.x API server with 5 middleware (requestId/hostGuard/killSwitchGuard/requestLogger) + errorHandler + GET /health, 19 tests passing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-10T02:20:56Z
- **Completed:** 2026-02-10T02:25:56Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- createApp() factory returning fully configured Hono instance with middleware pipeline
- 5 middleware + 1 error handler covering security (hostGuard, killSwitchGuard), observability (requestId, requestLogger), and error formatting (errorHandler)
- GET /health endpoint returning daemon status JSON (status, version, uptime, timestamp)
- 19 tests covering all middleware and route behaviors via Hono's app.request() pattern
- 133 total daemon tests passing (114 existing + 19 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Hono + create server factory and 6 middleware** - `63d4164` (feat)
2. **Task 2: API server + middleware tests** - `d92a05e` (test)

## Files Created/Modified
- `packages/daemon/src/api/server.ts` - createApp() factory, Hono instance with middleware + routes
- `packages/daemon/src/api/middleware/request-id.ts` - UUID v7 request ID generation/echo
- `packages/daemon/src/api/middleware/host-guard.ts` - Localhost-only access guard (127.0.0.1/localhost/[::1])
- `packages/daemon/src/api/middleware/kill-switch-guard.ts` - Kill switch guard with factory pattern
- `packages/daemon/src/api/middleware/request-logger.ts` - Request logging ([REQ] method path status duration)
- `packages/daemon/src/api/middleware/error-handler.ts` - WAIaaSError/ZodError/generic error -> JSON handler
- `packages/daemon/src/api/middleware/index.ts` - Barrel export for all middleware
- `packages/daemon/src/api/routes/health.ts` - GET /health sub-router
- `packages/daemon/src/api/index.ts` - API module barrel export
- `packages/daemon/src/__tests__/api-server.test.ts` - 19 tests for all middleware + routes
- `packages/daemon/package.json` - Added hono, @hono/node-server dependencies
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- **Hono createMiddleware pattern:** Used `createMiddleware()` from `hono/factory` for typed context access (c.set/c.get)
- **hostGuard Host header matching:** Checks Host header for 127.0.0.1/localhost/[::1] rather than connection IP (simpler, sufficient for daemon binding to 127.0.0.1)
- **killSwitchGuard factory DI:** `createKillSwitchGuard(getState)` factory function allows injecting state provider, defaulting to () => 'NORMAL'
- **ZodError -> ACTION_VALIDATION_FAILED:** Mapped Zod validation errors to existing error code with structured issue details
- **Generic errors -> SYSTEM_LOCKED (500):** Unmapped errors use SYSTEM_LOCKED as generic 500 error code
- **errorHandler via app.onError:** Used Hono's built-in error handler registration, not middleware, for proper error boundary

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript strict mode required `res.json()` return type to be explicitly cast from `unknown` -- resolved by adding a `json()` helper function in test file

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API server framework complete, ready for route registration in Plans 50-02/03/04
- createApp() returns configured Hono instance, DaemonLifecycle Step 5 can bind it via @hono/node-server
- All middleware tested and working, future routes only need to be mounted via app.route()

## Self-Check: PASSED

---
*Phase: 50-api-solana-pipeline*
*Completed: 2026-02-10*
