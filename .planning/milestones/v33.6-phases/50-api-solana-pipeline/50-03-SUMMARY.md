---
phase: 50-api-solana-pipeline
plan: 03
subsystem: api
tags: [hono, routes, agent-creation, wallet-query, solana-adapter, daemon-lifecycle, drizzle]

# Dependency graph
requires:
  - phase: 50-api-solana-pipeline (50-01)
    provides: createApp() factory, middleware pipeline, error handler, Hono patterns
  - phase: 50-api-solana-pipeline (50-02)
    provides: SolanaAdapter with getBalance(), IChainAdapter contract
  - phase: 49-daemon-infra
    provides: DaemonLifecycle stubs (Steps 4/5), LocalKeyStore, createDatabase, pushSchema, generateId
provides:
  - POST /v1/agents route handler (agent creation with Solana key pair + DB insert)
  - GET /v1/wallet/address route handler (agent public key lookup)
  - GET /v1/wallet/balance route handler (SolanaAdapter.getBalance() call)
  - DaemonLifecycle Step 4 (SolanaAdapter connect, fail-soft)
  - DaemonLifecycle Step 5 (Hono HTTP server start, fail-fast)
  - Shutdown HTTP server close + adapter disconnect
  - createApp deps extended with db, keyStore, masterPassword, config, adapter
affects: [50-04, all future route plans, transaction pipeline]

# Tech tracking
tech-stack:
  added: ["@waiaas/adapter-solana (workspace dep in daemon)"]
  patterns: [route factory DI pattern, X-Agent-Id header auth (v1.1 simplified), resolveAgent helper]

key-files:
  created:
    - packages/daemon/src/api/routes/agents.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/__tests__/api-agents.test.ts
  modified:
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/index.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/index.ts
    - packages/daemon/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Route factory DI pattern: agentRoutes(deps) / walletRoutes(deps) returning Hono sub-router"
  - "X-Agent-Id header for agent identification (v1.1 simplified, no sessionAuth)"
  - "resolveAgent() helper: shared agent lookup with 400/404 error handling"
  - "DaemonLifecycle stores Drizzle db instance (not just raw sqlite) for route handler access"
  - "DaemonLifecycle stores masterPassword for keystore operations in route handlers"
  - "Step 4 fail-soft: adapter init failure logs warning, daemon runs without chain adapter"
  - "Balance returned as string (bigint -> string for JSON serialization)"
  - "Adapter disconnect added to shutdown cascade (between HTTP close and worker stop)"

patterns-established:
  - "Route factory DI: function xxxRoutes(deps: XxxRouteDeps): Hono -- deps injected at createApp time"
  - "Agent identification: X-Agent-Id header on all wallet routes (v1.1 simplified auth)"
  - "resolveAgent pattern: shared helper throws WAIaaSError for missing header or agent"
  - "createApp conditional registration: routes registered only when deps available (testing flexibility)"

# Metrics
duration: 6min
completed: 2026-02-10
---

# Phase 50 Plan 03: Agent/Wallet Routes + DaemonLifecycle Integration Summary

**POST /v1/agents creates Solana key pair + DB row, GET /v1/wallet/address and /balance query via SolanaAdapter, DaemonLifecycle Steps 4-5 filled with adapter init and HTTP server start, 13 new tests (146 total)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-10T02:37:42Z
- **Completed:** 2026-02-10T02:43:16Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Agent creation route: POST /v1/agents generates UUID v7 ID, calls keyStore.generateKeyPair(), inserts into agents table, returns 201 with JSON
- Wallet query routes: GET /v1/wallet/address returns base58 public key, GET /v1/wallet/balance calls SolanaAdapter.getBalance() returning lamports as string
- DaemonLifecycle Step 4: dynamic imports @waiaas/adapter-solana, connects SolanaAdapter to devnet RPC (fail-soft)
- DaemonLifecycle Step 5: creates Hono app with all deps, binds to configured hostname:port via @hono/node-server
- Shutdown cascade: HTTP server close, adapter disconnect, then existing worker/DB/keystore cleanup
- 13 new tests covering all route behaviors with in-memory SQLite + mock adapter
- 146 total daemon tests (133 existing + 13 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Agent/wallet routes + DaemonLifecycle Step 4/5 integration** - `3250c95` (feat)
2. **Task 2: Agent and wallet API route tests** - `a028470` (test)

## Files Created/Modified
- `packages/daemon/src/api/routes/agents.ts` - POST /v1/agents route factory with DI (agentRoutes)
- `packages/daemon/src/api/routes/wallet.ts` - GET /v1/wallet/address and /balance route factory (walletRoutes)
- `packages/daemon/src/api/routes/index.ts` - Route barrel export (health, agentRoutes, walletRoutes)
- `packages/daemon/src/api/server.ts` - Extended createApp() deps, conditional route registration
- `packages/daemon/src/api/index.ts` - Updated barrel export with new routes
- `packages/daemon/src/lifecycle/daemon.ts` - Steps 4-5 filled, stores db/masterPassword/adapter/httpServer
- `packages/daemon/src/index.ts` - Re-exports createApp, agentRoutes, walletRoutes
- `packages/daemon/package.json` - Added @waiaas/adapter-solana workspace dependency
- `pnpm-lock.yaml` - Updated lockfile
- `packages/daemon/src/__tests__/api-agents.test.ts` - 13 tests for agent/wallet routes

## Decisions Made
- **Route factory DI pattern:** `agentRoutes(deps)` / `walletRoutes(deps)` accept injected dependencies and return Hono sub-router instances, enabling testability and flexibility
- **X-Agent-Id header auth:** v1.1 simplified authentication -- agent identification via HTTP header, no sessionAuth middleware
- **resolveAgent() helper:** Shared function for agent lookup with standard 400 (missing header) / 404 (not found) error handling
- **DaemonLifecycle stores Drizzle db:** Added `_db` field (BetterSQLite3Database) alongside raw `sqlite` for route handler access via Drizzle ORM
- **DaemonLifecycle stores masterPassword:** Required for keyStore.generateKeyPair() calls in POST /v1/agents route
- **Step 4 fail-soft:** If SolanaAdapter connect fails, daemon continues with adapter=null; balance endpoint returns CHAIN_ERROR
- **Balance as string:** bigint balance converted to string for JSON serialization (JavaScript JSON.stringify cannot handle bigint)
- **Adapter disconnect in shutdown:** Added between HTTP server close and background worker stop

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused WAIaaSError import from agents.ts**
- **Found during:** Task 1 (typecheck)
- **Issue:** WAIaaSError was imported but not used in agents.ts (Zod errors are caught by errorHandler middleware)
- **Fix:** Removed unused import
- **Files modified:** packages/daemon/src/api/routes/agents.ts
- **Verification:** `pnpm typecheck` passes clean
- **Committed in:** 3250c95 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial unused import fix. No scope creep.

## Issues Encountered
None -- plan executed cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Agent creation and wallet query endpoints operational, ready for transaction pipeline in Plan 50-04
- DaemonLifecycle fully integrated: config -> DB -> keystore -> adapter -> HTTP server -> workers
- All 5/5 must-haves verified via tests
- createApp() accepts full deps for production use; testing still works with partial deps

## Self-Check: PASSED

---
*Phase: 50-api-solana-pipeline*
*Completed: 2026-02-10*
