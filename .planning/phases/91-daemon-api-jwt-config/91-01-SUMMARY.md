---
phase: 91-daemon-api-jwt-config
plan: 01
subsystem: api
tags: [openapi, jwt, hono, drizzle, pipeline, wallet-terminology]

# Dependency graph
requires:
  - phase: 90-core-types-error-codes
    provides: "WALLET_STATUSES, WALLET_NOT_FOUND, CreateWalletRequestSchema in @waiaas/core"
provides:
  - "All daemon non-test source files use wallet terminology"
  - "/v1/wallets REST routes (replaced /v1/agents)"
  - "JWT claim wlt (replaced agt)"
  - "PipelineContext.walletId + wallet field"
  - "Config key max_sessions_per_wallet"
  - "OpenAPI schemas: Wallet* naming with walletId fields"
affects: [91-02-test-rename, mcp, cli, sdk, admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "walletCrudRoutes naming to avoid collision with walletRoutes (session-based)"
    - "payload.agentId -> walletId column mapping for core interface compatibility"

key-files:
  created:
    - "packages/daemon/src/api/routes/wallets.ts"
  modified:
    - "packages/daemon/src/api/routes/openapi-schemas.ts"
    - "packages/daemon/src/api/routes/wallet.ts"
    - "packages/daemon/src/api/routes/sessions.ts"
    - "packages/daemon/src/api/routes/transactions.ts"
    - "packages/daemon/src/api/routes/policies.ts"
    - "packages/daemon/src/api/routes/admin.ts"
    - "packages/daemon/src/api/server.ts"
    - "packages/daemon/src/api/middleware/session-auth.ts"
    - "packages/daemon/src/api/middleware/owner-auth.ts"
    - "packages/daemon/src/api/error-hints.ts"
    - "packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts"
    - "packages/daemon/src/infrastructure/config/loader.ts"
    - "packages/daemon/src/infrastructure/database/index.ts"
    - "packages/daemon/src/infrastructure/database/schema.ts"
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/daemon/src/infrastructure/keystore/keystore.ts"
    - "packages/daemon/src/pipeline/stages.ts"
    - "packages/daemon/src/pipeline/pipeline.ts"
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/lifecycle/daemon.ts"
    - "packages/daemon/src/notifications/notification-service.ts"
    - "packages/daemon/src/workflow/delay-queue.ts"
    - "packages/daemon/src/workflow/owner-state.ts"
    - "packages/daemon/src/index.ts"
    - "packages/daemon/src/api/index.ts"
    - "packages/daemon/src/api/routes/index.ts"

key-decisions:
  - "walletCrudRoutes naming avoids collision with existing walletRoutes function"
  - "Core interfaces (ILocalKeyStore, IPolicyEngine, NotificationPayload) still use agentId - daemon maps to walletId at boundary"
  - "NotificationPayload.agentId kept in admin test payload since core interface unchanged"
  - "PipelineContext.agent field renamed to .wallet for consistency"
  - "error-hints.ts updated: AGENT_NOT_FOUND -> WALLET_NOT_FOUND, /v1/agents -> /v1/wallets"

patterns-established:
  - "Core interface boundary: daemon maps payload.agentId -> schema.walletId at DB insert"
  - "Raw SQL in daemon uses wallet_id column name (post-v3 migration)"

# Metrics
duration: 20min
completed: 2026-02-12
---

# Phase 91 Plan 01: Daemon API/JWT/Config Agent-to-Wallet Rename Summary

**Renamed 27 daemon source files from agent to wallet terminology: /v1/wallets routes, JWT wlt claim, PipelineContext.walletId, OpenAPI Wallet* schemas, max_sessions_per_wallet config**

## Performance

- **Duration:** 20 min
- **Started:** 2026-02-12T16:35:01Z
- **Completed:** 2026-02-12T16:55:15Z
- **Tasks:** 2
- **Files modified:** 27

## Accomplishments
- All daemon REST routes changed from /v1/agents to /v1/wallets with Wallet* OpenAPI schemas
- JWT payload claim renamed from agt to wlt, session-auth middleware sets walletId on Hono context
- PipelineContext interface uses walletId and wallet field throughout 6-stage pipeline
- Config key max_sessions_per_agent renamed to max_sessions_per_wallet
- Raw SQL in lifecycle daemon, delay-queue, and owner-state updated from agents/agent_id to wallets/wallet_id
- Error hints updated: WALLET_NOT_FOUND, WALLET_SUSPENDED with /v1/wallets paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename OpenAPI schemas + agents.ts -> wallets.ts + route/middleware source files** - `7ec1f1e` (feat)
2. **Task 2: JWT claim rename + pipeline context + config key** - `d42a187` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/wallets.ts` - NEW: Wallet CRUD routes (renamed from agents.ts)
- `packages/daemon/src/api/routes/agents.ts` - DELETED
- `packages/daemon/src/api/routes/openapi-schemas.ts` - Wallet* schema naming, walletId fields
- `packages/daemon/src/api/routes/wallet.ts` - resolveWalletById, walletId context
- `packages/daemon/src/api/routes/sessions.ts` - walletId fields, wlt JWT claim
- `packages/daemon/src/api/routes/transactions.ts` - walletId pipeline context
- `packages/daemon/src/api/routes/policies.ts` - walletId fields
- `packages/daemon/src/api/routes/admin.ts` - walletCount, walletId in notification logs
- `packages/daemon/src/api/routes/index.ts` - walletCrudRoutes barrel export
- `packages/daemon/src/api/server.ts` - /v1/wallets paths, walletCrudRoutes
- `packages/daemon/src/api/middleware/session-auth.ts` - payload.wlt -> walletId context
- `packages/daemon/src/api/middleware/owner-auth.ts` - wallets table lookup
- `packages/daemon/src/api/error-hints.ts` - WALLET_NOT_FOUND, /v1/wallets paths
- `packages/daemon/src/api/index.ts` - walletCrudRoutes export
- `packages/daemon/src/infrastructure/jwt/jwt-secret-manager.ts` - JwtPayload.wlt claim
- `packages/daemon/src/infrastructure/config/loader.ts` - max_sessions_per_wallet
- `packages/daemon/src/infrastructure/database/index.ts` - Removed agents backward-compat alias
- `packages/daemon/src/infrastructure/database/schema.ts` - WALLET_STATUSES import
- `packages/daemon/src/infrastructure/database/migrate.ts` - WALLET_STATUSES import
- `packages/daemon/src/infrastructure/keystore/keystore.ts` - WALLET_NOT_FOUND error
- `packages/daemon/src/pipeline/stages.ts` - PipelineContext.walletId, wallet field
- `packages/daemon/src/pipeline/pipeline.ts` - wallets table, wallet context
- `packages/daemon/src/pipeline/database-policy-engine.ts` - walletId column refs
- `packages/daemon/src/lifecycle/daemon.ts` - wallets table, wallet_id raw SQL
- `packages/daemon/src/notifications/notification-service.ts` - walletId DB column mapping
- `packages/daemon/src/workflow/delay-queue.ts` - ExpiredTransaction.walletId, wallet_id SQL
- `packages/daemon/src/workflow/owner-state.ts` - wallets table SQL, WALLET_NOT_FOUND
- `packages/daemon/src/index.ts` - walletCrudRoutes export

## Decisions Made
- **walletCrudRoutes naming:** Renamed agentRoutes to walletCrudRoutes (not walletRoutes) to avoid collision with existing walletRoutes function in wallet.ts that handles session-based queries (/wallet/address, /wallet/balance)
- **Core interface boundary:** ILocalKeyStore, IPolicyEngine, and NotificationPayload interfaces in @waiaas/core still use agentId parameter names. Daemon methods that implement these interfaces keep the same parameter names. At the DB boundary, daemon maps payload.agentId to schema.walletId column
- **PipelineContext.agent -> .wallet:** Renamed the agent metadata field to wallet for consistency with the walletId rename, even though it wasn't explicitly in the plan
- **error-hints.ts update:** Updated AGENT_NOT_FOUND and AGENT_SUSPENDED hint keys to WALLET_NOT_FOUND and WALLET_SUSPENDED, with /v1/wallets path references

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed AGENT_STATUSES -> WALLET_STATUSES in schema.ts and migrate.ts**
- **Found during:** Task 1 (tsc verification)
- **Issue:** schema.ts and migrate.ts imported AGENT_STATUSES from @waiaas/core, which was renamed to WALLET_STATUSES in Phase 90
- **Fix:** Updated imports to WALLET_STATUSES, updated CHECK constraint references
- **Files modified:** packages/daemon/src/infrastructure/database/schema.ts, packages/daemon/src/infrastructure/database/migrate.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** 7ec1f1e (Task 1 commit)

**2. [Rule 3 - Blocking] Fixed barrel exports in src/index.ts and api/index.ts**
- **Found during:** Task 1 (tsc verification)
- **Issue:** src/index.ts and api/index.ts still exported agentRoutes/AgentRouteDeps from agents.js
- **Fix:** Updated to walletCrudRoutes/WalletCrudRouteDeps from wallets.js
- **Files modified:** packages/daemon/src/index.ts, packages/daemon/src/api/index.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** 7ec1f1e (Task 1 commit)

**3. [Rule 3 - Blocking] Fixed AGENT_NOT_FOUND -> WALLET_NOT_FOUND in keystore.ts**
- **Found during:** Task 1 (tsc verification)
- **Issue:** keystore.ts used AGENT_NOT_FOUND error code which was renamed in Phase 90 core
- **Fix:** Changed to WALLET_NOT_FOUND
- **Files modified:** packages/daemon/src/infrastructure/keystore/keystore.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** 7ec1f1e (Task 1 commit)

**4. [Rule 3 - Blocking] Fixed lifecycle/daemon.ts agent references**
- **Found during:** Task 2 (tsc verification)
- **Issue:** daemon.ts imported agents from schema, used agent_id in raw SQL, passed agentId to PipelineContext
- **Fix:** Updated to wallets import, wallet_id SQL, walletId in context
- **Files modified:** packages/daemon/src/lifecycle/daemon.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** d42a187 (Task 2 commit)

**5. [Rule 3 - Blocking] Fixed notification-service.ts column name mismatch**
- **Found during:** Task 2 (tsc verification)
- **Issue:** notification-service.ts used agentId: payload.agentId for DB inserts, but schema columns are now walletId
- **Fix:** Changed to walletId: payload.agentId (maps core interface field to DB column)
- **Files modified:** packages/daemon/src/notifications/notification-service.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** d42a187 (Task 2 commit)

**6. [Rule 3 - Blocking] Fixed delay-queue.ts and owner-state.ts raw SQL**
- **Found during:** Task 2 (tsc verification)
- **Issue:** delay-queue used agent_id column and agentId interface field; owner-state used agents table and AGENT_NOT_FOUND
- **Fix:** Updated SQL to wallet_id/wallets, interface to walletId, error to WALLET_NOT_FOUND
- **Files modified:** packages/daemon/src/workflow/delay-queue.ts, packages/daemon/src/workflow/owner-state.ts
- **Verification:** tsc --noEmit passes
- **Committed in:** d42a187 (Task 2 commit)

**7. [Rule 1 - Bug] Updated error-hints.ts stale references**
- **Found during:** Task 1 (grep verification)
- **Issue:** error-hints.ts had AGENT_NOT_FOUND, AGENT_SUSPENDED keys and /v1/agents path references
- **Fix:** Updated to WALLET_NOT_FOUND, WALLET_SUSPENDED with /v1/wallets paths
- **Files modified:** packages/daemon/src/api/error-hints.ts
- **Verification:** grep confirms no /v1/agents paths in non-test source
- **Committed in:** 7ec1f1e (Task 1 commit)

---

**Total deviations:** 7 auto-fixed (6 blocking Rule 3, 1 bug Rule 1)
**Impact on plan:** All auto-fixes necessary for TypeScript compilation. The plan listed 19 files; actual scope was 27 files due to cascading references. No scope creep -- all changes were mechanical renames required for consistency.

## Issues Encountered
- Core package dist was stale (source had CreateWalletRequestSchema but dist still had CreateAgentRequestSchema). Resolved by running tsc --build in packages/core.
- NotificationPayload.agentId in admin.ts test payload was initially changed to walletId but reverted because the core interface still uses agentId. This demonstrates the boundary between daemon-internal naming (walletId) and core interface naming (agentId still pending Phase 91-02 or core rename plan).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All daemon non-test source files use wallet terminology
- Test files still use agent terminology -- Plan 91-02 will update test files
- Core interfaces (ILocalKeyStore, IPolicyEngine, NotificationPayload) still use agentId -- separate core rename needed
- Ready for Plan 91-02 (test file + residual renames)

## Self-Check: PASSED

- All 5 key files verified present
- agents.ts confirmed deleted
- Both commits (7ec1f1e, d42a187) verified in git log
- tsc --noEmit passes with zero errors

---
*Phase: 91-daemon-api-jwt-config*
*Completed: 2026-02-12*
