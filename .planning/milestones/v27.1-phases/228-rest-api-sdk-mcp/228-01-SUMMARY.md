---
phase: 228-rest-api-sdk-mcp
plan: 01
subsystem: api
tags: [rest-api, openapi, incoming-tx, cursor-pagination, bigint, drizzle, hono]

# Dependency graph
requires:
  - phase: 224-db-schema-types
    provides: incomingTransactions table, Drizzle schema, IncomingTxStatus enum
  - phase: 225-chain-subscribers
    provides: IChainSubscriber implementations (Solana/EVM)
  - phase: 226-monitor-service
    provides: IncomingTxMonitorService with syncSubscriptions()
provides:
  - GET /v1/wallet/incoming endpoint with composite cursor pagination and 8 filters
  - GET /v1/wallet/incoming/summary endpoint with daily/weekly/monthly aggregation
  - PATCH /v1/wallets/:id endpoint for monitorIncoming toggle
  - 6 OpenAPI schemas for incoming transaction API
  - incomingTxMonitorService DI in CreateAppDeps and WalletCrudRouteDeps
affects: [228-02-sdk, 228-03-mcp, admin-ui-incoming]

# Tech tracking
tech-stack:
  added: []
  patterns: [composite-cursor-pagination, bigint-app-layer-summation, duck-typed-service-dep]

key-files:
  created:
    - packages/daemon/src/api/routes/incoming.ts
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/wallets.ts
    - packages/daemon/src/api/server.ts

key-decisions:
  - "Composite cursor uses base64url JSON {d: detectedAt, i: id} for keyset pagination"
  - "Summary endpoint uses raw SQL via deps.sqlite for strftime GROUP BY, aggregates amounts in JS BigInt"
  - "Duck-typed incomingTxMonitorService dep avoids circular import (consistent with Phase 226-04 pattern)"
  - "PriceInfo.usdPrice field used for native token USD conversion (not .price)"

patterns-established:
  - "Composite cursor: encodeCursor/decodeCursor with base64url JSON for two-field keyset pagination"
  - "BigInt summation: fetch raw rows, group in JS, sum amounts as BigInt to prevent SQL overflow"

requirements-completed: [API-01, API-02, API-03]

# Metrics
duration: 4min
completed: 2026-02-22
---

# Phase 228 Plan 01: REST API Incoming Transaction Endpoints Summary

**Three REST API endpoints for incoming TX monitoring: paginated list with composite cursor, period summary with BigInt summation, and monitorIncoming toggle via PATCH**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-21T17:18:00Z
- **Completed:** 2026-02-21T17:22:23Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- GET /v1/wallet/incoming with composite (detectedAt, id) cursor, 8 filter params, default status=CONFIRMED
- GET /v1/wallet/incoming/summary with daily/weekly/monthly period aggregation using BigInt app-layer summation
- PATCH /v1/wallets/:id with monitorIncoming boolean toggle and async syncSubscriptions() call
- 6 OpenAPI schemas registered: IncomingTxItem, IncomingTxListResponse, IncomingTxSummaryEntry, IncomingTxSummaryResponse, PatchWalletRequest, PatchWalletResponse

## Task Commits

Each task was committed atomically:

1. **Task 1: Create incoming.ts route file with list + summary endpoints and OpenAPI schemas** - `7a5026ab` (feat)
2. **Task 2: Add PATCH /v1/wallets/:id to wallets.ts and mount incoming routes in server.ts** - `fe71253a` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/incoming.ts` - New route file with GET /wallet/incoming and GET /wallet/incoming/summary handlers
- `packages/daemon/src/api/routes/openapi-schemas.ts` - 6 new Zod OpenAPI schemas for incoming TX API
- `packages/daemon/src/api/routes/wallets.ts` - PATCH /wallets/:id route for monitorIncoming toggle
- `packages/daemon/src/api/server.ts` - Import and mount incomingRoutes, add incomingTxMonitorService to CreateAppDeps

## Decisions Made
- Used `PriceInfo.usdPrice` (not `.price`) after discovering the actual PriceInfo type structure
- Composite cursor uses base64url-encoded JSON `{d, i}` for compact two-field keyset pagination
- Summary endpoint fetches all matching rows without GROUP BY and aggregates entirely in JS for BigInt safety
- Duck-typed `incomingTxMonitorService` with `{ syncSubscriptions(): void | Promise<void> }` to avoid circular deps

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed PriceInfo field name from .price to .usdPrice**
- **Found during:** Task 1 (incoming.ts summary endpoint)
- **Issue:** Plan referenced `priceInfo.price` but actual IPriceOracle PriceInfo type has `usdPrice` field
- **Fix:** Changed `priceInfo.price` to `priceInfo.usdPrice`
- **Files modified:** packages/daemon/src/api/routes/incoming.ts
- **Verification:** TypeScript compilation passes
- **Committed in:** 7a5026ab (Task 1 commit)

**2. [Rule 1 - Bug] Removed unused `sql` import from drizzle-orm**
- **Found during:** Task 1 (typecheck)
- **Issue:** `sql` was imported but not used (all conditions use drizzle-orm operators)
- **Fix:** Removed `sql` from import statement
- **Files modified:** packages/daemon/src/api/routes/incoming.ts
- **Verification:** TypeScript compilation passes, no unused imports
- **Committed in:** 7a5026ab (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Minor type corrections. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 REST API endpoints implemented and type-safe
- Ready for SDK integration (228-02) and MCP tool definitions (228-03)
- OpenAPI schemas registered for /doc endpoint auto-generation

---
*Phase: 228-rest-api-sdk-mcp*
*Completed: 2026-02-22*

## Self-Check: PASSED
- All created files verified to exist on disk
- All commit hashes verified in git log
- TypeScript compilation: zero errors
- Lint: zero errors (267 pre-existing warnings)
