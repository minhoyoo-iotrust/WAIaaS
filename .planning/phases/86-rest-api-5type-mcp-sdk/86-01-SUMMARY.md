---
phase: 86-rest-api-5type-mcp-sdk
plan: 01
subsystem: api
tags: [openapi, zod, hono, discriminated-union, rest-api, transaction]

# Dependency graph
requires:
  - phase: 81-discriminated-union-5type
    provides: "5-type Zod schemas + stage1Validate pipeline support"
  - phase: 84-adapter-pool-route-integration
    provides: "AdapterPool resolve + resolveRpcUrl in route handler"
provides:
  - "POST /v1/transactions/send accepts all 5 types via stage1Validate delegation"
  - "OpenAPI oneOf 6-variant for send transaction request schema"
  - "5-type + legacy schemas registered as OpenAPI components"
  - "Legacy backward compatibility (no type field = TRANSFER)"
affects: [86-02-mcp-sdk-extension, rest-api, openapi-doc]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Route schema separation (z.any() passthrough + manual oneOf for OpenAPI)", "stage1Validate delegation from route handler"]

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/__tests__/api-transactions.test.ts

key-decisions:
  - "TransactionRequestOpenAPI uses z.any() with manual oneOf $ref (route schema separation pattern C)"
  - "5-type + SendTransactionRequest schemas registered via router.openAPIRegistry.register() for OpenAPI component inclusion"
  - "stage1Validate is single Zod validation SSoT (not Hono built-in)"
  - "ZodError from stage1Validate handled by existing errorHandler middleware (400 ACTION_VALIDATION_FAILED)"

patterns-established:
  - "Route schema separation: z.any() passthrough in route definition, pipeline stage handles real Zod validation"
  - "OpenAPI component registration: router.openAPIRegistry.register() for schemas not directly referenced by routes"

# Metrics
duration: 5min
completed: 2026-02-12
---

# Phase 86 Plan 01: REST API 5-type Route + OpenAPI Summary

**POST /v1/transactions/send route schema separation with stage1Validate delegation and OpenAPI oneOf 6-variant component registration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-12T12:01:10Z
- **Completed:** 2026-02-12T12:06:51Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- POST /v1/transactions/send accepts all 5 transaction types (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH) plus legacy fallback
- OpenAPI spec at GET /doc contains oneOf 6-variant with all type schemas as registered components
- stage1Validate is single Zod validation SSoT (route handler uses c.req.json() bypass)
- Invalid type requests properly return 400 ACTION_VALIDATION_FAILED
- Zero test regressions (635 daemon tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED -- failing tests for 5-type route + OpenAPI** - `ea3aaab` (test)
2. **Task 2: TDD GREEN -- implement route schema separation + OpenAPI 5-type components** - `4a5646a` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/openapi-schemas.ts` - Added 5-type OpenAPI component exports + TransactionRequestOpenAPI with oneOf 6-variant
- `packages/daemon/src/api/routes/transactions.ts` - Replaced inline Stage 1 with stage1Validate delegation, registered 6 schemas on openAPIRegistry
- `packages/daemon/src/__tests__/api-transactions.test.ts` - Added 8 tests for 5-type support, legacy fallback, invalid type, OpenAPI oneOf

## Decisions Made
- **TransactionRequestOpenAPI = z.any() with manual oneOf**: Route schema separation pattern C -- the route definition uses a passthrough schema (z.any()) that never fails Hono's built-in validation. Actual Zod validation is delegated to stage1Validate which uses the correct discriminatedUnion or legacy schema. The OpenAPI doc uses manually specified oneOf $ref entries.
- **Explicit openAPIRegistry.register()**: OpenAPIHono only includes schemas in components/schemas when referenced by routes. Since TransferRequest etc. are only referenced via manual $ref in z.any().openapi(), they must be explicitly registered on the router's openAPIRegistry.
- **ZodError handling via existing errorHandler**: When stage1Validate throws a ZodError (e.g., invalid type), the global errorHandler in server.ts catches it and returns 400 ACTION_VALIDATION_FAILED. No wrapper needed.
- **generateId import removed**: No longer needed in transactions.ts since stage1Validate handles ID generation internally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SendTransactionRequest legacy schema not in OpenAPI components**
- **Found during:** Task 2 (OpenAPI test failing)
- **Issue:** After replacing SendTransactionRequestOpenAPI with TransactionRequestOpenAPI in the route definition, the legacy SendTransactionRequest schema was no longer referenced by any route and disappeared from OpenAPI components/schemas
- **Fix:** Added explicit `router.openAPIRegistry.register('SendTransactionRequest', SendTransactionRequestOpenAPI)` alongside the 5 new schema registrations
- **Files modified:** packages/daemon/src/api/routes/transactions.ts
- **Verification:** OpenAPI spec test passes with all 6 schema refs present
- **Committed in:** 4a5646a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for OpenAPI spec completeness. No scope creep.

## Issues Encountered
None - implementation was straightforward once the schema registration pattern was resolved.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- REST API now accepts all 5 transaction types with correct OpenAPI documentation
- Ready for Phase 86-02: MCP/SDK extension to support TOKEN_TRANSFER
- All existing tests pass, no blockers

## Self-Check: PASSED

All files verified present, all commit hashes found in git log.

---
*Phase: 86-rest-api-5type-mcp-sdk*
*Completed: 2026-02-12*
