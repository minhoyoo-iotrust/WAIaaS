---
phase: 59-rest-api-expansion
plan: 01
subsystem: api
tags: [hono, openapi, zod, rest, cursor-pagination, nonce]

# Dependency graph
requires:
  - phase: 58-openapihono-getassets
    provides: OpenAPIHono createRoute() pattern, getAssets() adapter method
provides:
  - 6 new REST endpoints (wallet/assets, tx list, tx pending, nonce, agents list, agent detail)
  - Cursor-based pagination pattern for transaction listing
  - ownerState derived field on agent detail endpoint
  - Stateless nonce endpoint for ownerAuth signature construction
affects: [61-ts-sdk, 62-python-sdk, 63-mcp-server, 59-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Cursor pagination via UUID v7 ID ordering (lt + desc + limit+1)
    - Stateless nonce (randomBytes 32-byte hex, 5min expiry, no server storage)
    - ownerState derived field via resolveOwnerState() on GET response

key-files:
  created:
    - packages/daemon/src/api/routes/nonce.ts
    - packages/daemon/src/__tests__/api-new-endpoints.test.ts
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/routes/agents.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts

key-decisions:
  - "Pending transactions filter uses PENDING/QUEUED statuses (not DELAYED/PENDING_APPROVAL which do not exist in schema)"
  - "Nonce is stateless (no server-side storage) -- ownerAuth validates Ed25519 signatures independently"
  - "Cursor pagination uses UUID v7 ID column (not createdAt) for stable ordering"
  - "sessionAuth added on exact /v1/transactions path (Hono wildcard * does not match base)"

patterns-established:
  - "Cursor pagination: fetch limit+1, detect hasMore, return last item ID as cursor"
  - "Derived fields: ownerState computed in handler via resolveOwnerState(), not stored in DB"

# Metrics
duration: 10min
completed: 2026-02-10
---

# Phase 59 Plan 01: REST API Expansion Summary

**6 new OpenAPIHono endpoints (assets, tx list/pending, nonce, agents list/detail) with cursor pagination, ownerState, and 17 test cases**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-10T14:33:46Z
- **Completed:** 2026-02-10T14:44:10Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Added 6 new REST endpoints consumed by SDK/MCP (Phases 61-63)
- Implemented cursor-based pagination on transaction list (UUID v7 ordering)
- Added ownerState derived field (NONE/GRACE/LOCKED) on agent detail
- 17 new tests with zero regressions on existing 345 tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Add OpenAPI response schemas + nonce route file** - `e2214aa` (feat)
2. **Task 2: Add assets/transactions/agents routes + server wiring** - `c47c326` (feat)
3. **Task 3: Add tests for 6 new endpoints + verify all tests pass** - `b696ca0` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/nonce.ts` - GET /nonce route (public, stateless 32-byte hex nonce)
- `packages/daemon/src/api/routes/openapi-schemas.ts` - 6 new Zod response schemas (WalletAssets, TxList, TxPending, Nonce, AgentList, AgentDetail)
- `packages/daemon/src/api/routes/wallet.ts` - GET /wallet/assets via adapter.getAssets()
- `packages/daemon/src/api/routes/transactions.ts` - GET /transactions (cursor pagination), GET /transactions/pending
- `packages/daemon/src/api/routes/agents.ts` - GET /agents (list), GET /agents/:id (detail with ownerState)
- `packages/daemon/src/api/routes/index.ts` - Barrel export for nonceRoutes
- `packages/daemon/src/api/server.ts` - Auth middleware wiring (masterAuth on agents/:id, sessionAuth on /transactions exact)
- `packages/daemon/src/__tests__/api-new-endpoints.test.ts` - 17 test cases for all 6 endpoints

## Decisions Made
- **Pending statuses = PENDING + QUEUED**: The plan specified DELAYED/PENDING_APPROVAL but these do not exist in TRANSACTION_STATUSES enum. The actual statuses for "waiting" transactions are PENDING (stage 1 initial) and QUEUED (after stage 3 policy evaluation). Fixed filter accordingly.
- **Stateless nonce**: No server-side nonce storage in v1.3. The ownerAuth middleware validates Ed25519 signatures independently. Nonce endpoint exists for SDK/MCP clients to construct ownerAuth request payloads.
- **UUID v7 cursor**: Cursor pagination uses the transaction ID (UUID v7) for ordering rather than createdAt, providing ms-precision ordering without timestamp ties.
- **sessionAuth on exact path**: Hono's `app.use('/v1/transactions/*', ...)` does NOT match `/v1/transactions` (no trailing path). Added explicit `app.use('/v1/transactions', sessionAuth)` for the new GET /transactions list endpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid transaction status values in pending filter**
- **Found during:** Task 3 (test writing)
- **Issue:** Plan specified DELAYED/PENDING_APPROVAL statuses which do not exist in TRANSACTION_STATUSES enum CHECK constraint
- **Fix:** Changed pending filter to use PENDING/QUEUED (actual valid statuses for "waiting" transactions)
- **Files modified:** packages/daemon/src/api/routes/transactions.ts
- **Verification:** Tests pass, CHECK constraint satisfied
- **Committed in:** b696ca0 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix -- invalid statuses would cause CHECK constraint failures at runtime. No scope creep.

## Issues Encountered
- Transaction routes require policyEngine dep in createApp() -- tests initially failed with 404 because policyEngine was not provided, causing transaction routes to not be registered. Fixed by adding DefaultPolicyEngine to test setup.
- Mock keyStore returned identical public keys causing UNIQUE constraint violation when creating multiple agents. Fixed by using counter-based unique key generation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 new endpoints operational, ready for 59-02 (remaining REST endpoints)
- SDK/MCP phases (61-63) can now consume: wallet/assets, transactions list/pending, nonce, agents list/detail
- Pre-existing known issues remain: flaky lifecycle.test.ts timer test, CLI e2e-errors.test.ts 401-vs-404

## Self-Check: PASSED

---
*Phase: 59-rest-api-expansion*
*Completed: 2026-02-10*
