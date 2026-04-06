---
phase: 54-policy-engine
plan: 02
subsystem: api
tags: [policy-crud, masterauth, toctou, begin-immediate, reserved-amount, spending-limit, whitelist, zod]

# Dependency graph
requires:
  - phase: 54-policy-engine-01
    provides: "DatabasePolicyEngine with evaluate(), SPENDING_LIMIT 4-tier, WHITELIST filtering"
  - phase: 52-auth
    provides: "masterAuth middleware, createApp factory, Hono route pattern"
provides:
  - "Policy CRUD API (POST/GET/PUT/DELETE /v1/policies) with masterAuth protection"
  - "CreatePolicyRequestSchema + UpdatePolicyRequestSchema Zod schemas"
  - "SPENDING_LIMIT and WHITELIST type-specific rules validation"
  - "evaluateAndReserve() with BEGIN IMMEDIATE for TOCTOU prevention"
  - "reserved_amount column on transactions for concurrent spending limit tracking"
  - "releaseReservation() for clearing reservations on terminal states"
  - "POLICY_NOT_FOUND error code with i18n (en/ko)"
  - "14 new tests (11 CRUD + 3 TOCTOU)"
affects: [55-api-integration, 56-token-policy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "policyRoutes factory pattern (same as sessionRoutes/agentRoutes)"
    - "BEGIN IMMEDIATE via sqlite.transaction().immediate() for serialized concurrent evaluation"
    - "reserved_amount SUM pattern for TOCTOU-safe spending limit checks"
    - "Type-specific rules validation (SPENDING_LIMIT digit strings, WHITELIST string array)"

key-files:
  created:
    - "packages/daemon/src/api/routes/policies.ts"
    - "packages/daemon/src/__tests__/api-policies.test.ts"
  modified:
    - "packages/daemon/src/api/server.ts"
    - "packages/daemon/src/api/routes/index.ts"
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/__tests__/database-policy-engine.test.ts"
    - "packages/daemon/src/infrastructure/database/schema.ts"
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/core/src/schemas/policy.schema.ts"
    - "packages/core/src/schemas/index.ts"
    - "packages/core/src/index.ts"
    - "packages/core/src/errors/error-codes.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"

key-decisions:
  - "POLICY_NOT_FOUND error code added to POLICY domain (5 codes total now)"
  - "masterAuth on both /v1/policies and /v1/policies/:id (explicit per-path registration)"
  - "evaluateAndReserve is synchronous (returns PolicyEvaluation, not Promise) since better-sqlite3 is sync"
  - "reserved_amount stored as TEXT (consistent with amount column for BigInt string representation)"
  - "SUM(CAST(reserved_amount AS INTEGER)) for SQLite aggregation of string amounts"

patterns-established:
  - "Policy CRUD: policyRoutes(deps) factory same as sessionRoutes/agentRoutes"
  - "TOCTOU: sqlite.transaction().immediate() + raw SQL inside for BEGIN IMMEDIATE isolation"
  - "Type-specific validation: validateSpendingLimitRules/validateWhitelistRules dispatched by policy type"

# Metrics
duration: 8min
completed: 2026-02-10
---

# Phase 54 Plan 02: Policy CRUD API + TOCTOU Prevention Summary

**Policy CRUD REST API with masterAuth + BEGIN IMMEDIATE TOCTOU prevention via reserved_amount for concurrent spending limit serialization**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-10T08:32:26Z
- **Completed:** 2026-02-10T08:40:19Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- POST/GET/PUT/DELETE /v1/policies with masterAuth protection and type-specific rules validation
- CreatePolicyRequestSchema + UpdatePolicyRequestSchema exported from @waiaas/core
- evaluateAndReserve() uses BEGIN IMMEDIATE to serialize concurrent SPENDING_LIMIT evaluations
- reserved_amount column tracks pending amounts, SUM prevents two concurrent requests from both passing under the limit
- releaseReservation() clears reservation on terminal transaction states
- 14 new tests (11 CRUD API + 3 TOCTOU prevention), all 253 daemon tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Zod schemas + Policy CRUD routes + tests** - `f119691` (feat)
2. **Task 2: Add TOCTOU prevention pattern with reserved_amount** - `f5b452e` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/policies.ts` - Policy CRUD route factory with type-specific rules validation
- `packages/daemon/src/__tests__/api-policies.test.ts` - 11 CRUD tests covering create, read, update, delete, auth, validation
- `packages/daemon/src/api/server.ts` - policyRoutes registration + masterAuth for /v1/policies
- `packages/daemon/src/api/routes/index.ts` - policyRoutes barrel export
- `packages/daemon/src/pipeline/database-policy-engine.ts` - evaluateAndReserve() + releaseReservation() + dual constructor
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` - 3 TOCTOU tests (reserve, accumulate, release)
- `packages/daemon/src/infrastructure/database/schema.ts` - reserved_amount TEXT column on transactions
- `packages/daemon/src/infrastructure/database/migrate.ts` - reserved_amount in CREATE TABLE DDL
- `packages/core/src/schemas/policy.schema.ts` - CreatePolicyRequestSchema + UpdatePolicyRequestSchema
- `packages/core/src/schemas/index.ts` - New schema exports
- `packages/core/src/index.ts` - New schema exports
- `packages/core/src/errors/error-codes.ts` - POLICY_NOT_FOUND error code
- `packages/core/src/i18n/en.ts` - POLICY_NOT_FOUND English message
- `packages/core/src/i18n/ko.ts` - POLICY_NOT_FOUND Korean message

## Decisions Made
- [54-02]: POLICY_NOT_FOUND error code added to POLICY domain -- needed for PUT/DELETE 404 responses, brings POLICY domain to 5 codes
- [54-02]: masterAuth on both /v1/policies and /v1/policies/:id -- explicit per-path registration matches existing session/agent pattern
- [54-02]: evaluateAndReserve is synchronous (not async) -- better-sqlite3 is inherently synchronous, no reason to wrap in Promise
- [54-02]: reserved_amount as TEXT column -- consistent with amount column, BigInt string representation for lamports/wei precision
- [54-02]: SUM(CAST(reserved_amount AS INTEGER)) in raw SQL -- SQLite aggregation within BEGIN IMMEDIATE for atomic read+write

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added POLICY_NOT_FOUND to i18n files (en.ts, ko.ts)**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Adding POLICY_NOT_FOUND to error-codes.ts made ErrorCode type include it, but i18n Messages type requires Record<ErrorCode, string> -- missing entry caused TS error
- **Fix:** Added POLICY_NOT_FOUND message to both en.ts and ko.ts i18n files
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** pnpm typecheck passes clean
- **Committed in:** f119691 (Task 1 commit)

**2. [Rule 3 - Blocking] Added reserved_amount to migrate.ts DDL**
- **Found during:** Task 2 (TOCTOU tests failing)
- **Issue:** reserved_amount was added to Drizzle schema (schema.ts) but pushSchema uses raw DDL in migrate.ts -- in-memory tables lacked the column
- **Fix:** Added `reserved_amount TEXT` to transactions CREATE TABLE in migrate.ts
- **Files modified:** packages/daemon/src/infrastructure/database/migrate.ts
- **Verification:** All 17 database-policy-engine tests pass
- **Committed in:** f5b452e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary to unblock compilation and test execution. No scope creep.

## Issues Encountered
- Core package needed rebuild before daemon tests could import new schemas/error codes -- stale .js output caused runtime 500 errors until `pnpm --filter @waiaas/core build` was run

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Policy engine complete: DatabasePolicyEngine with evaluate() + evaluateAndReserve() + CRUD API
- Ready for pipeline integration (55-api-integration): DatabasePolicyEngine can replace DefaultPolicyEngine in createApp deps
- Pre-existing flaky test in lifecycle.test.ts (timer-sensitive BackgroundWorkers test) -- not blocking, unrelated to policy engine
- Pre-existing CLI E2E test failures (4 tests) -- not blocking, caused by E2E harness sessionAuth integration gap

## Self-Check: PASSED

---
*Phase: 54-policy-engine*
*Completed: 2026-02-10*
