---
phase: 390-pipeline-routing-query-api
plan: 02
subsystem: api
tags: [query-api, external-actions, connect-info, openapi, sessionAuth]

requires:
  - phase: 390-pipeline-routing-query-api
    plan: 01
    provides: Off-chain action DB rows with action_kind/venue/operation columns

provides:
  - GET /v1/wallets/:id/actions (list off-chain actions with venue/status filter + pagination)
  - GET /v1/wallets/:id/actions/:actionId (detail with metadata/bridgeMetadata)
  - external_actions capability in connect-info API

affects: [391-admin-ui, 392-mcp-sdk]

tech-stack:
  added: []
  patterns: [drizzle-inArray-filter, openapi-zod-route-pattern]

key-files:
  created:
    - packages/daemon/src/api/routes/external-actions.ts
    - packages/daemon/src/__tests__/external-actions-api.test.ts
  modified:
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/api/routes/connect-info.ts

key-decisions:
  - "Query API filters by action_kind IN (signedData, signedHttp) to exclude regular transactions"
  - "Real JwtSecretManager used in tests instead of mock for proper verifyToken support"
  - "external_actions capability enabled when signerRegistry has any schemes registered"

requirements-completed: [QUERY-01, QUERY-02, QUERY-03, PIPE-07]

duration: 9min
completed: 2026-03-12
---

# Phase 390 Plan 02: Off-Chain Action Query API + connect-info Capability Summary

**Two REST query endpoints for off-chain action history with venue/status/pagination filters, plus external_actions capability in connect-info for agent self-discovery**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-12T05:30:00Z
- **Completed:** 2026-03-12T05:39:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GET /v1/wallets/:id/actions: list off-chain actions with venue/status filter + limit/offset pagination
- GET /v1/wallets/:id/actions/:actionId: detail with full metadata, bridgeMetadata, error, txHash
- OpenAPI Zod schemas: ExternalActionItemSchema, ExternalActionDetailSchema, ExternalActionsListResponseSchema
- Drizzle inArray filter on action_kind column for signedData/signedHttp
- JSON.parse with safe fallback for metadata/bridgeMetadata fields
- external_actions capability in connect-info when signerRegistry has schemes
- Prompt text for External Actions in buildConnectInfoPrompt
- 9 integration tests (list, venue filter, status filter, pagination, detail, 404 cases)
- All 48 related tests passing (9 query + 11 pipeline + 28 connect-info)

## Task Commits

1. **Task 1: Query API routes + tests** - `9b0ecd8e` (feat)
2. **Task 2: connect-info external_actions capability** - `3b6164f2` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/external-actions.ts` - 2 OpenAPI routes, Zod schemas, Drizzle queries
- `packages/daemon/src/__tests__/external-actions-api.test.ts` - 9 integration tests with real JwtSecretManager
- `packages/daemon/src/api/routes/index.ts` - Barrel export for externalActionRoutes
- `packages/daemon/src/api/server.ts` - Route mounting, sessionAuth, signerRegistry in CreateAppDeps
- `packages/daemon/src/api/routes/connect-info.ts` - external_actions capability + prompt text

## Decisions Made
- Query API uses Drizzle inArray(transactions.actionKind, ['signedData', 'signedHttp']) for filtering
- Real JwtSecretManager in tests (not mock) to properly support verifyToken() in sessionAuth middleware
- external_actions capability gated on signerRegistry having registered schemes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed jwtSecretManager mock in test**
- **Found during:** Task 1
- **Issue:** Mock jwtSecretManager only had getSecret()/rotateSecret() but sessionAuth middleware calls verifyToken()
- **Fix:** Replaced mock with real JwtSecretManager(db) + initialize() + signToken()
- **Files modified:** external-actions-api.test.ts

**2. [Rule 3 - Blocking] Fixed import path for signerRegistry in server.ts**
- **Found during:** Task 2
- **Issue:** Used `../../signing/registry.js` but correct relative path from api/server.ts is `../signing/registry.js`
- **Fix:** Corrected import path
- **Files modified:** server.ts

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both essential for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Query API ready for Plan 391 (Admin UI external actions panel)
- Query API ready for Plan 392 (MCP/SDK external action tools)
- connect-info external_actions capability available for agent self-discovery

---
*Phase: 390-pipeline-routing-query-api*
*Completed: 2026-03-12*
