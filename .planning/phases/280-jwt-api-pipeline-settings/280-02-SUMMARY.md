---
phase: 280-jwt-api-pipeline-settings
plan: "02"
subsystem: api
tags: [openapi, rest-api, network-resolution, endpoint-deletion, schema-cleanup]

# Dependency graph
requires:
  - phase: 279-resolver-migration
    provides: getSingleNetwork, 3-param resolveNetwork, wallets.defaultNetwork column removed
provides:
  - PUT /wallets/:id/default-network endpoint deleted
  - PUT /wallet/default-network endpoint deleted
  - defaultNetwork/isDefault/defaultWalletId removed from all OpenAPI schemas
  - All API routes use getSingleNetwork instead of getDefaultNetwork
  - Transaction/action routes use 3-param resolveNetwork
  - Connect-info response cleaned of defaultNetwork/isDefault
  - Admin balance display no longer uses isDefault for sorting
  - WC pairing uses getSingleNetwork for network resolution
affects: [280-03-pipeline-types, admin-ui-wallet-detail, mcp-tools]

# Tech tracking
tech-stack:
  added: []
  patterns: [getSingleNetwork-fallback-pattern, network-required-error-for-evm]

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/wallets.ts
    - packages/daemon/src/api/routes/wallet.ts
    - packages/daemon/src/api/routes/connect-info.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/wc.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/routes/actions.ts

key-decisions:
  - "Wallet creation uses getSingleNetwork ?? getNetworksForEnvironment[0] for key generation network (EVM keys are chain-level)"
  - "Wallet list/detail network field uses getSingleNetwork ?? chain as fallback display value"
  - "WC pairing uses getSingleNetwork ?? first network (not NETWORK_REQUIRED error, since WC needs a network to function)"
  - "GET /wallet/balance and /wallet/assets throw NETWORK_REQUIRED for EVM without query network param"
  - "Admin balance route iterates all networks without isDefault sorting"
  - "Cascade defense simplified: no more isDefault promotion on wallet termination"

patterns-established:
  - "getSingleNetwork fallback: Use getSingleNetwork(chain, env) ?? getNetworksForEnvironment(chain, env)[0]! for non-user-facing operations"
  - "NETWORK_REQUIRED for user-facing EVM queries: Throw explicit error when EVM wallet has no network param"

requirements-completed: [API-02, API-03, API-04, API-05, API-06, API-07, API-08, API-09, API-10]

# Metrics
duration: 11min
completed: 2026-02-27
---

# Phase 280 Plan 02: API Route Endpoint Deletion + Response Field Removal + OpenAPI Schema Cleanup Summary

**Deleted 2 default-network endpoints, removed defaultNetwork/isDefault from all API responses and OpenAPI schemas, updated 8 route files to use getSingleNetwork and 3-param resolveNetwork**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-27T10:24:56Z
- **Completed:** 2026-02-27T10:35:51Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Deleted PUT /wallets/:id/default-network and PUT /wallet/default-network endpoints (route definitions + handlers)
- Removed defaultNetwork, isDefault, defaultWalletId from all OpenAPI schemas (WalletDetail, WalletNetworks, ConnectInfo)
- Updated all 8 API route files to use getSingleNetwork instead of getDefaultNetwork
- Transaction and action routes now use 3-param resolveNetwork (requestNetwork, environment, chain)
- Connect-info prompt no longer shows "(default: network)" per wallet
- Admin balance display no longer uses isDefault for network sorting
- WC pairing routes use getSingleNetwork for network resolution instead of raw SQL default_network column

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete default-network endpoints + update wallets.ts + wallet.ts + connect-info.ts + openapi-schemas.ts + wc.ts + admin.ts** - `38f5586b` (refactor)
2. **Task 2: Update transaction/action routes to use 3-param resolveNetwork** - `4a02a602` (refactor)

## Files Created/Modified
- `packages/daemon/src/api/routes/wallets.ts` - Deleted PUT /wallets/:id/default-network, replaced getDefaultNetwork with getSingleNetwork, simplified cascade defense
- `packages/daemon/src/api/routes/wallet.ts` - Deleted PUT /wallet/default-network, added NETWORK_REQUIRED for EVM balance/assets queries
- `packages/daemon/src/api/routes/connect-info.ts` - Removed defaultNetwork/isDefault from response and prompt builder
- `packages/daemon/src/api/routes/openapi-schemas.ts` - Removed UpdateDefaultNetwork schemas, cleaned WalletDetail/WalletNetworks/ConnectInfo schemas
- `packages/daemon/src/api/routes/wc.ts` - Replaced raw SQL default_network with getSingleNetwork resolution
- `packages/daemon/src/api/routes/admin.ts` - Replaced getDefaultNetwork import, removed isDefault from balance display, cleaned agent-prompt wallet mapping
- `packages/daemon/src/api/routes/transactions.ts` - 4-param to 3-param resolveNetwork, removed defaultNetwork from PipelineContext
- `packages/daemon/src/api/routes/actions.ts` - 4-param to 3-param resolveNetwork, removed defaultNetwork from wallet data

## Decisions Made
- Wallet creation uses `getSingleNetwork ?? getNetworksForEnvironment[0]` for key generation -- EVM keys are chain-level, network is just metadata
- Wallet list/detail `network` field uses `getSingleNetwork ?? chain` as display fallback (non-breaking for API consumers)
- WC pairing uses `getSingleNetwork ?? first network` instead of throwing NETWORK_REQUIRED (WC needs a network to function)
- Session-scoped balance/assets endpoints throw NETWORK_REQUIRED for EVM wallets without ?network query param
- Cascade defense simplified: removed isDefault promotion logic since column no longer exists

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed cascade defense referencing removed isDefault column**
- **Found during:** Task 1 (wallets.ts cascade defense)
- **Issue:** DELETE /wallets/:id handler referenced sessionWallets.isDefault for default wallet promotion, but column was removed in Phase 279
- **Fix:** Simplified cascade defense to only check if other wallets remain (auto-revoke if last wallet), removed promotion logic
- **Files modified:** packages/daemon/src/api/routes/wallets.ts
- **Committed in:** 38f5586b

**2. [Rule 1 - Bug] Fixed session_wallets insert referencing removed isDefault column**
- **Found during:** Task 1 (wallets.ts POST /wallets auto-session)
- **Issue:** POST /wallets auto-session creation set isDefault: true in session_wallets insert, but column was removed
- **Fix:** Removed isDefault from session_wallets insert values
- **Files modified:** packages/daemon/src/api/routes/wallets.ts
- **Committed in:** 38f5586b

---

**Total deviations:** 2 auto-fixed (2 bugs from removed schema columns)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- PipelineContext type still requires defaultNetwork in wallet object -- this is expected and will be fixed by 280-03 (pipeline types). Type errors only in transactions.ts and actions.ts PipelineContext construction.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API routes fully cleaned of defaultNetwork/isDefault concepts
- 280-03 can proceed to update PipelineContext type and pipeline stage files
- TypeScript compilation will be fully clean after 280-03 completes

---
*Phase: 280-jwt-api-pipeline-settings*
*Completed: 2026-02-27*

## Self-Check: PASSED
- 280-02-SUMMARY.md: FOUND
- Commit 38f5586b: FOUND
- Commit 4a02a602: FOUND
