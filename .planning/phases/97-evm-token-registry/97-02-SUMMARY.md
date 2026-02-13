---
phase: 97-evm-token-registry
plan: 02
subsystem: api, testing
tags: [erc-20, token-registry, openapi, hono, rest-api, vitest]

# Dependency graph
requires:
  - phase: 97-evm-token-registry (plan 01)
    provides: TokenRegistryService, tokenRegistry DB table, built-in token data
provides:
  - GET /v1/tokens?network= endpoint returning builtin+custom tokens
  - POST /v1/tokens endpoint for adding custom tokens (masterAuth)
  - DELETE /v1/tokens endpoint for removing custom tokens (masterAuth)
  - OpenAPI schemas for all token registry endpoints
  - 17 tests covering service unit tests and API integration
affects: [MCP token listing, SDK getTokens, Admin UI token panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [EVM network validation in route handlers, UNIQUE constraint catch for 409-like response]

key-files:
  created:
    - packages/daemon/src/api/routes/tokens.ts
    - packages/daemon/src/__tests__/token-registry.test.ts
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/__tests__/notification-log.test.ts

key-decisions:
  - "Token routes mounted under existing masterAuth admin block (/v1/tokens)"
  - "EVM network validation uses EVM_NETWORK_TYPES from @waiaas/core (rejects Solana networks)"
  - "UNIQUE constraint violation on POST returns ACTION_VALIDATION_FAILED with 'already exists' message"
  - "DELETE for built-in tokens returns removed:false (not an error)"

patterns-established:
  - "UNIQUE constraint catch: SQLite UNIQUE errors caught and mapped to WAIaaSError"
  - "EVM-only route validation: validateEvmNetwork() rejects non-EVM networks"

# Metrics
duration: 5min
completed: 2026-02-13
---

# Phase 97 Plan 02: Token Registry REST API + Comprehensive Tests Summary

**GET/POST/DELETE /v1/tokens endpoints with OpenAPI schemas, EVM network validation, and 17 tests covering service + API integration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-13T12:37:12Z
- **Completed:** 2026-02-13T12:42:10Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created 3 REST API endpoints (GET/POST/DELETE /v1/tokens) with full OpenAPI schema documentation
- Added EVM network validation rejecting non-EVM networks (Solana, unknown)
- 10 TokenRegistryService unit tests covering all service methods with edge cases
- 7 API integration tests verifying end-to-end CRUD with masterAuth protection

## Task Commits

Each task was committed atomically:

1. **Task 1: Token registry API routes + OpenAPI schemas + server wiring** - `f062252` (feat)
2. **Task 2: Token registry tests (service + API integration)** - `560b035` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/tokens.ts` - Token registry route handlers (GET/POST/DELETE /tokens) with EVM validation
- `packages/daemon/src/api/routes/openapi-schemas.ts` - Added 6 OpenAPI schemas: TokenRegistryItem, ListResponse, AddRequest/Response, RemoveRequest/Response
- `packages/daemon/src/api/routes/index.ts` - Barrel export for tokenRegistryRoutes
- `packages/daemon/src/api/server.ts` - TokenRegistryService instantiation, route mounting, masterAuth for /v1/tokens
- `packages/daemon/src/__tests__/token-registry.test.ts` - 17 tests (10 service unit + 7 API integration)
- `packages/daemon/src/__tests__/notification-log.test.ts` - Fixed table count assertion (9->10)

## Decisions Made
- Token routes mounted under existing masterAuth admin block -- all 3 endpoints require master password
- EVM network validation uses EVM_NETWORK_TYPES from @waiaas/core, rejecting Solana networks and unknowns
- UNIQUE constraint violation on POST returns ACTION_VALIDATION_FAILED (httpStatus 400) with 'Token already exists in registry' message
- DELETE for built-in tokens returns `{ removed: false }` gracefully rather than throwing an error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed notification-log.test.ts table count assertion**
- **Found during:** Task 2 (regression test run)
- **Issue:** notification-log.test.ts asserted "Initial schema (9 tables)" but 97-01 added token_registry table making it 10
- **Fix:** Updated assertion from 9 to 10 tables
- **Files modified:** packages/daemon/src/__tests__/notification-log.test.ts
- **Verification:** All 699 daemon tests pass
- **Committed in:** 560b035 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix for test assertion)
**Impact on plan:** Necessary update for new table count. No scope creep.

## Issues Encountered
- Pre-existing TS error in stages.ts (unrelated to this plan) -- confirmed exists on branch before changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Token registry API complete (GET/POST/DELETE) with comprehensive test coverage
- Ready for MCP token listing integration and SDK getTokens() wiring
- All 699 daemon tests pass with zero regressions

---
*Phase: 97-evm-token-registry*
*Completed: 2026-02-13*
