---
phase: 58-openapihono-getassets
plan: 01
subsystem: api
tags: [hono, openapi, zod-openapi, createRoute, openapi-3.0, rest-api]

# Dependency graph
requires:
  - phase: 50-api-chain
    provides: "Hono API server + 18 route handlers across 6 route modules"
  - phase: 55-auth-policy
    provides: "masterAuth, sessionAuth, ownerAuth middleware + policy CRUD routes"
provides:
  - "OpenAPIHono createRoute() pattern on all 18 routes"
  - "GET /doc endpoint returning OpenAPI 3.0 JSON spec"
  - "Shared openapi-schemas.ts with 17 response schemas + buildErrorResponses()"
  - "openApiValidationHook defaultHook for WAIaaSError format preservation"
affects: [59-api-extension, 61-ts-sdk, 62-python-sdk, 63-mcp-server]

# Tech tracking
tech-stack:
  added: ["@hono/zod-openapi@0.19.10"]
  patterns: ["createRoute() typed route definitions", "openApiValidationHook defaultHook", "buildErrorResponses() error code grouping"]

key-files:
  created:
    - packages/daemon/src/api/routes/openapi-schemas.ts
  modified:
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/routes/health.ts
    - packages/daemon/src/api/routes/agents.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/api/routes/sessions.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/routes/policies.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/package.json
    - packages/daemon/src/__tests__/api-server.test.ts

key-decisions:
  - "@hono/zod-openapi v0.19.10 (not v1.x) because v1.x requires zod@^4.0.0 and project uses zod@3.x"
  - "openApiValidationHook throws WAIaaSError to preserve error format across all routes"
  - "OpenAPI path params use {id} syntax in createRoute, auto-mapped to :id by OpenAPIHono"

patterns-established:
  - "createRoute() pattern: define route spec with method/path/tags/summary/request/responses, then register with router.openapi(routeSpec, handler)"
  - "openApiValidationHook as defaultHook on all OpenAPIHono router constructors for consistent error format"
  - "buildErrorResponses(codes) groups ErrorCode[] by httpStatus into OpenAPI response entries"
  - "c.req.valid('json'|'param'|'query') replaces c.req.json()+Schema.parse() and c.req.param()/query()"

# Metrics
duration: 21min
completed: 2026-02-10
---

# Phase 58 Plan 01: OpenAPIHono Conversion Summary

**Converted all 18 Hono routes to OpenAPIHono createRoute() pattern with auto-generated OpenAPI 3.0 spec via GET /doc and shared response schemas**

## Performance

- **Duration:** 21 min
- **Started:** 2026-02-10T13:50:37Z
- **Completed:** 2026-02-10T14:11:45Z
- **Tasks:** 5
- **Files modified:** 25

## Accomplishments
- Converted all 18 routes across 6 route files (health, agents, wallet, sessions, transactions, policies) to OpenAPIHono createRoute() pattern
- Added GET /doc endpoint returning valid OpenAPI 3.0 JSON with typed request/response schemas
- Created centralized openapi-schemas.ts with 17 response schemas + buildErrorResponses() function
- Created openApiValidationHook to preserve WAIaaSError format when OpenAPIHono validation fails
- Zero test regressions -- 343 existing tests pass + 3 new /doc tests = 346 total

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @hono/zod-openapi and create shared OpenAPI response schemas** - `226dcb8` (feat)
2. **Task 2: Convert server.ts to OpenAPIHono and convert health.ts + wallet.ts** - `741a622` (feat)
3. **Task 3: Convert agents.ts and sessions.ts to createRoute()** - `818256b` (feat)
4. **Task 4: Convert transactions.ts and policies.ts to createRoute()** - `ea92931` (feat)
5. **Task 5: Add GET /doc endpoint, update barrel exports, add tests** - `20410ab` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/openapi-schemas.ts` - NEW: 17 response schemas, buildErrorResponses(), openApiValidationHook, re-exported request schemas with .openapi() metadata
- `packages/daemon/src/api/server.ts` - Hono -> OpenAPIHono, added app.doc('/doc') endpoint
- `packages/daemon/src/api/routes/health.ts` - Converted 1 route to createRoute()
- `packages/daemon/src/api/routes/wallet.ts` - Converted 2 routes to createRoute()
- `packages/daemon/src/api/routes/agents.ts` - Converted 2 routes to createRoute()
- `packages/daemon/src/api/routes/sessions.ts` - Converted 4 routes to createRoute()
- `packages/daemon/src/api/routes/transactions.ts` - Converted 5 routes to createRoute()
- `packages/daemon/src/api/routes/policies.ts` - Converted 4 routes to createRoute()
- `packages/daemon/src/api/routes/index.ts` - Added missing sessionRoutes barrel export
- `packages/daemon/package.json` - Added @hono/zod-openapi@^0.19.10
- `packages/daemon/src/__tests__/api-server.test.ts` - Added 3 new GET /doc tests
- 7 test files - Changed `Hono` type to `OpenAPIHono` for type compatibility
- 7 test files - Added `getAssets: async () => []` to mock adapters (pre-existing IChainAdapter change)
- `packages/adapters/solana/src/__tests__/solana-adapter.test.ts` - Fixed strict TS index access errors

## Decisions Made
- **@hono/zod-openapi v0.19.10:** v1.x requires zod@^4.0.0 which is incompatible with our zod@3.x. v0.19.10 supports zod>=3.0.0 and provides identical createRoute/OpenAPIHono API.
- **openApiValidationHook defaultHook:** OpenAPIHono's built-in validation returns a different error JSON format than our errorHandler. Created a custom defaultHook that throws WAIaaSError('ACTION_VALIDATION_FAILED') to be caught by existing errorHandler, preserving consistent {code, message, retryable} format.
- **OpenAPI path syntax {id}:** createRoute() definitions use `{id}` (not `:id`) for path parameters. OpenAPIHono auto-maps this to Hono's `:id` pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing IChainAdapter.getAssets() mock adapter errors**
- **Found during:** Task 1 (build verification)
- **Issue:** IChainAdapter already had getAssets() added (from 58-02 concurrent work) but 7 daemon test files lacked getAssets in mock adapters, and SolanaAdapter test had strict TS index access errors
- **Fix:** Added `getAssets: async () => []` to 7 mock adapter objects; added `!` non-null assertions in solana adapter test
- **Files modified:** 7 daemon test files + packages/adapters/solana/src/__tests__/solana-adapter.test.ts
- **Verification:** `pnpm build` succeeds, all tests pass
- **Committed in:** 226dcb8 (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed OpenAPIHono type incompatibility in test files**
- **Found during:** Task 2 (test verification after server.ts conversion)
- **Issue:** 7 test files typed `app` as `Hono` but `createApp()` now returns `OpenAPIHono`. TypeScript error: `OpenAPIHono` not assignable to `Hono`
- **Fix:** Changed `import type { Hono }` to `import type { OpenAPIHono }` and `let app: Hono` to `let app: OpenAPIHono` in all 7 test files
- **Files modified:** api-agents, api-policies, api-session-renewal, api-sessions, api-transactions, session-lifecycle-e2e, workflow-owner-e2e test files
- **Verification:** All 343 tests pass with correct types
- **Committed in:** 741a622 (Task 2 commit)

**3. [Rule 1 - Bug] Created openApiValidationHook for validation error format mismatch**
- **Found during:** Task 3 (agents test "should return 400 on missing name field" failed)
- **Issue:** OpenAPIHono's built-in validation returns different JSON format than our errorHandler. Test expected `code: 'ACTION_VALIDATION_FAILED'` but got undefined
- **Fix:** Created `openApiValidationHook` function that throws WAIaaSError on validation failure, added as `defaultHook` to all OpenAPIHono router constructors
- **Files modified:** openapi-schemas.ts (hook definition), health.ts, wallet.ts, agents.ts, sessions.ts, transactions.ts, policies.ts (hook registration)
- **Verification:** All validation error tests pass with correct {code, message, retryable} format
- **Committed in:** 818256b (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and type safety. No scope creep.

## Issues Encountered
- @hono/zod-openapi v1.2.1 (latest) requires zod@^4.0.0 -- downgraded to v0.19.10 which supports zod@3.x
- ErrorResponse schema only appears in /doc output when full deps are provided (routes are conditionally registered). Adjusted test to check HealthResponse only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 18 routes now use OpenAPIHono createRoute() pattern -- ready for phase 59 to add 15 new routes using same pattern
- GET /doc endpoint provides OpenAPI 3.0 spec -- ready for SDK code generation in phases 61-62
- openapi-schemas.ts provides shared response schemas -- new routes can reuse and extend
- openApiValidationHook pattern established -- all new routes get consistent error handling automatically

## Self-Check: PASSED

---
*Phase: 58-openapihono-getassets*
*Completed: 2026-02-10*
