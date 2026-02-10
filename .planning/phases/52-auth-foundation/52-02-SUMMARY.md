---
phase: 52-auth-foundation
plan: 02
subsystem: auth
tags: [masterAuth, ownerAuth, argon2id, ed25519, sodium-native, hono-middleware, route-auth]

# Dependency graph
requires:
  - phase: 52-auth-foundation/01
    provides: "createSessionAuth middleware, JwtSecretManager, wai_sess_ token format, error codes"
  - phase: 51-basic-transfer
    provides: "Hono middleware pattern, SQLite schema (agents, sessions), WAIaaSError, error-handler"
provides:
  - "createMasterAuth middleware factory (Argon2id password verification via X-Master-Password)"
  - "createOwnerAuth middleware factory (Ed25519 signature verification for Solana owner addresses)"
  - "Server-level auth: masterAuth on /v1/agents, sessionAuth on /v1/wallet/* and /v1/transactions/*"
  - "All 6 endpoints auth-protected except /health (public)"
affects: [53-session-management, 54-cli-flow, 55-dx-spec]

# Tech tracking
tech-stack:
  added: []
  patterns: [server-level app.use() auth isolation, createRequire for sodium-native CJS, base58 decode for Solana addresses]

key-files:
  created:
    - packages/daemon/src/api/middleware/master-auth.ts
    - packages/daemon/src/api/middleware/owner-auth.ts
    - packages/daemon/src/__tests__/master-auth.test.ts
    - packages/daemon/src/__tests__/owner-auth.test.ts
  modified:
    - packages/daemon/src/api/middleware/index.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/routes/agents.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/__tests__/api-agents.test.ts
    - packages/daemon/src/__tests__/api-transactions.test.ts

key-decisions:
  - "Server-level auth middleware: app.use('/v1/agents', masterAuth) instead of sub-router use('*') to prevent middleware leakage across sub-routers on same base path"
  - "ownerAuth uses sodium-native with createRequire pattern (consistent with keystore.ts) + inline base58 decode"
  - "Wallet/transaction routes read agentId from c.get('agentId') set by sessionAuth, no fallback to X-Agent-Id header"
  - "masterAuth deps: masterPasswordHash (Argon2id) injected via CreateAppDeps, verified at middleware level (not route handler)"

patterns-established:
  - "Server-level route auth: auth middleware registered on app before sub-routers, not inside sub-routers"
  - "ownerAuth: X-Owner-Signature (base64) + X-Owner-Message (utf8) + X-Owner-Address (base58) triple header pattern"
  - "Test auth helpers: createSessionToken() + createTestAgent() for tests requiring authenticated requests"

# Metrics
duration: 11min
completed: 2026-02-10
---

# Phase 52 Plan 02: masterAuth + ownerAuth Middleware + Endpoint Auth Summary

**masterAuth (Argon2id) and ownerAuth (Ed25519) middleware, all 6 endpoints auth-protected via server-level app.use() with 17 new tests**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-10T06:29:51Z
- **Completed:** 2026-02-10T06:40:41Z
- **Tasks:** 2/2
- **Files modified:** 11

## Accomplishments
- masterAuth middleware verifies X-Master-Password header against Argon2id hash, rejecting 401 on invalid/missing
- ownerAuth middleware verifies Ed25519 detached signatures for Solana owner addresses with base58 decode + sodium-native
- All 6 endpoints now auth-protected: POST /v1/agents (masterAuth), wallet/transaction routes (sessionAuth), /health (public)
- Server-level app.use() pattern prevents middleware leakage across sub-routers mounted on same /v1 base path
- 17 new tests (3 masterAuth + 6 ownerAuth + 8 auth rejection), 204 total daemon tests passing, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement masterAuth + ownerAuth middleware + tests** - `6dacf67` (feat)
2. **Task 2: Apply auth middleware to endpoints + update server factory + tests** - `948393e` (feat)

## Files Created/Modified
- `packages/daemon/src/api/middleware/master-auth.ts` - createMasterAuth factory, Argon2id verification
- `packages/daemon/src/api/middleware/owner-auth.ts` - createOwnerAuth factory, Ed25519 verification, base58 decode
- `packages/daemon/src/api/middleware/index.ts` - Updated barrel with createMasterAuth + createOwnerAuth exports
- `packages/daemon/src/api/server.ts` - Added masterPasswordHash + jwtSecretManager to CreateAppDeps, server-level auth middleware
- `packages/daemon/src/api/routes/agents.ts` - Simplified (auth handled at server level), doc updated
- `packages/daemon/src/api/routes/wallet.ts` - Read agentId from sessionAuth context instead of X-Agent-Id header
- `packages/daemon/src/api/routes/transactions.ts` - Read agentId from sessionAuth context, removed X-Agent-Id dependency
- `packages/daemon/src/__tests__/master-auth.test.ts` - 3 tests: missing header, wrong password, valid password
- `packages/daemon/src/__tests__/owner-auth.test.ts` - 6 tests: missing headers, agent not found, no owner, address mismatch, bad sig, valid sig
- `packages/daemon/src/__tests__/api-agents.test.ts` - Updated with masterAuth + sessionAuth headers, 2 new auth rejection tests
- `packages/daemon/src/__tests__/api-transactions.test.ts` - Replaced X-Agent-Id with sessionAuth, 4 new auth tests

## Decisions Made
- **Server-level auth middleware vs sub-router middleware:** Chose `app.use('/v1/agents', masterAuth)` at createApp() level because mounting multiple Hono sub-routers on the same `/v1` base path causes `use('*')` middleware from one sub-router to leak to others. Server-level path-scoped middleware provides clean isolation.
- **ownerAuth Ed25519 only (Solana):** For v1.2, ownerAuth supports only Solana Ed25519 signatures via sodium-native. EVM SIWE verification deferred to v1.4+ per design docs.
- **No X-Agent-Id fallback:** Wallet and transaction routes now exclusively use `c.get('agentId')` from sessionAuth context. The X-Agent-Id header pattern is fully removed from authenticated routes.
- **createRequire for sodium-native:** Consistent with keystore.ts pattern for loading CJS sodium-native in ESM context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Hono sub-router middleware leakage**
- **Found during:** Task 2 (Apply auth to endpoints)
- **Issue:** Plan specified passing masterAuth/sessionAuth as deps to sub-router factories and using `router.use('*', middleware)`. This caused masterAuth from agentRoutes to leak to walletRoutes and transactionRoutes because all three are mounted on the same `/v1` path via `app.route('/v1', ...)`.
- **Fix:** Moved auth middleware registration to server level (`app.use('/v1/agents', masterAuth)`, `app.use('/v1/wallet/*', sessionAuth)`, `app.use('/v1/transactions/*', sessionAuth)`) instead of sub-router level. Route deps interfaces simplified to remove middleware fields.
- **Files modified:** server.ts, agents.ts, wallet.ts, transactions.ts
- **Verification:** All 204 tests pass, auth correctly scoped per endpoint
- **Committed in:** 948393e (Task 2 commit)

**2. [Rule 1 - Bug] Fixed FK cascade test expectations**
- **Found during:** Task 2 (Update tests)
- **Issue:** Tests expected AGENT_NOT_FOUND after deleting an agent, but session cascade delete (FK on sessions.agent_id with ON DELETE CASCADE) removes the session first, so sessionAuth returns SESSION_NOT_FOUND before the route handler can check the agent.
- **Fix:** Changed test expectations to match actual behavior (SESSION_NOT_FOUND) and restructured tests to verify auth flow correctly.
- **Files modified:** api-agents.test.ts, api-transactions.test.ts
- **Verification:** All tests pass with correct expectations
- **Committed in:** 948393e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct operation. Server-level auth is actually a better pattern than the sub-router approach in the plan. No scope creep.

## Issues Encountered
- **Hono TypeScript overload mismatch:** Initially tried `router.post('/agents', ...middlewares, handler)` with spread array, but Hono's TypeScript overloads don't accept spread `MiddlewareHandler[]`. Solved by moving auth to server-level `app.use()` which avoids the spread typing issue entirely.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- Phase 52 auth foundation complete: sessionAuth (JWT), masterAuth (Argon2id), ownerAuth (Ed25519)
- All endpoints properly protected, ready for session creation/management in Phase 53
- CreateAppDeps interface ready for daemon lifecycle integration (masterPasswordHash, jwtSecretManager fields)
- No blockers for next phase

## Self-Check: PASSED

---
*Phase: 52-auth-foundation*
*Completed: 2026-02-10*
