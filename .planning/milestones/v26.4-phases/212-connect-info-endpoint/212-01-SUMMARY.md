---
phase: 212-connect-info-endpoint
plan: 01
subsystem: api
tags: [openapi, hono, session, discovery, zod, drizzle]

# Dependency graph
requires:
  - phase: 210-session-model-restructure
    provides: session_wallets junction table, 1:N session-wallet model
  - phase: 211-api-wallet-selection
    provides: resolveWalletId, sessionAuth with defaultWalletId
provides:
  - GET /v1/connect-info endpoint with sessionAuth
  - ConnectInfoResponseSchema (Zod + OpenAPI)
  - buildConnectInfoPrompt reusable helper function
  - ConnectInfoRouteDeps interface
affects: [212-02 agent-prompt, 213 integration layer]

# Tech tracking
tech-stack:
  added: []
  patterns: [session-scoped query via session_wallets JOIN, dynamic capability detection]

key-files:
  created:
    - packages/daemon/src/api/routes/connect-info.ts
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts

key-decisions:
  - "policies grouped by walletId (not by wallet address) in response -- consistent with session_wallets model"
  - "capabilities dynamically computed: always includes transfer/token_transfer/balance/assets; conditionally adds sign/actions/x402"
  - "signing_sdk capability checked via settingsService (not DaemonConfig) since signing_sdk is settings-only"
  - "buildConnectInfoPrompt accepts policies embedded in wallet objects for prompt building"

patterns-established:
  - "Discovery endpoint pattern: sessionAuth-only, returns session-scoped data via session_wallets JOIN"
  - "Reusable prompt builder exported for multi-endpoint use (connect-info + agent-prompt)"

requirements-completed: [DISC-01, DISC-02, DISC-03]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 212 Plan 01: Connect-Info Endpoint Summary

**GET /v1/connect-info with sessionAuth returning wallets, per-wallet policies, dynamic capabilities, and AI-friendly prompt string**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T17:19:26Z
- **Completed:** 2026-02-20T17:22:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- ConnectInfoResponseSchema added to openapi-schemas.ts with session, wallets, policies, capabilities, daemon, prompt fields
- connect-info.ts route file with factory pattern (connectInfoRoutes), reusable buildConnectInfoPrompt helper
- Dynamic capability detection: transfer, token_transfer, balance, assets (always), sign (settings), actions (apiKeyStore), x402 (config)
- Server integration: sessionAuth middleware on /v1/connect-info, route mounted with all deps

## Task Commits

Each task was committed atomically:

1. **Task 1: ConnectInfoResponseSchema + GET /v1/connect-info route handler** - `9c3bfb9` (feat)
2. **Task 2: Server integration + sessionAuth + route barrel export** - `771b9d9` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/connect-info.ts` - GET /connect-info route with factory pattern, prompt builder, capability detection
- `packages/daemon/src/api/routes/openapi-schemas.ts` - ConnectInfoResponseSchema Zod/OpenAPI schema
- `packages/daemon/src/api/routes/index.ts` - Barrel export for connectInfoRoutes + ConnectInfoRouteDeps
- `packages/daemon/src/api/server.ts` - sessionAuth middleware + route registration with deps

## Decisions Made
- Policies grouped by walletId in response (consistent with session_wallets data model)
- signing_sdk capability checked via settingsService.get() rather than DaemonConfig (since signing_sdk section is settings-only, not in config.toml schema)
- buildConnectInfoPrompt designed with policies embedded in wallet objects for prompt readability
- x402 capability derived from config.x402.enabled (boolean check)

## Deviations from Plan

None - plan executed exactly as written. ConnectInfoResponseSchema was already present in openapi-schemas.ts (likely from a prior partial attempt), so Task 1 focused on verifying correctness and creating the route file.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- buildConnectInfoPrompt is exported and ready for reuse in Plan 02 (agent-prompt endpoint)
- ConnectInfoResponseSchema available for SDK type generation
- /v1/connect-info mounted and accessible via sessionAuth tokens

---
*Phase: 212-connect-info-endpoint*
*Completed: 2026-02-21*
