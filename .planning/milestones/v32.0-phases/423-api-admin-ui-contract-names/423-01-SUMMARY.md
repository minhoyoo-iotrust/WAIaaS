---
phase: 423-api-admin-ui-contract-names
plan: 01
subsystem: api, ui
tags: [openapi, preact, contract-name, admin-ui, transaction-enrichment]

# Dependency graph
requires:
  - phase: 421-registry-core-well-known-data
    provides: ContractNameRegistry with 4-tier resolve()
  - phase: 422-notification-pipeline-integration
    provides: Notification pipeline wiring pattern
provides:
  - contractName/contractNameSource fields in TxDetailResponse and admin transaction endpoints
  - Admin UI contract name display in transaction list and wallet detail Activity tab
  - resolveContractFields() reusable helper for transaction enrichment
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - resolveContractFields() helper pattern for spreading contract name into response objects
    - Fallback source returns null (not truncated address) to keep API clean

key-files:
  created: []
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/admin.ts
    - packages/daemon/src/api/routes/admin-monitoring.ts
    - packages/daemon/src/api/routes/admin-wallets.ts
    - packages/daemon/src/api/routes/transactions.ts
    - packages/daemon/src/api/server.ts
    - packages/admin/src/pages/transactions.tsx
    - packages/admin/src/pages/wallets.tsx
    - packages/admin/src/api/types.generated.ts

key-decisions:
  - "Fallback source returns null for both contractName/contractNameSource to keep API clean -- toAddress already provides raw address"
  - "resolveContractFields() exported from admin-monitoring.ts and reused across admin-wallets.ts and transactions.ts"
  - "Admin inline OpenAPI schemas updated alongside TxDetailResponseSchema for consistent API surface"

patterns-established:
  - "resolveContractFields() pattern: check type===CONTRACT_CALL, resolve via registry, filter out fallback source"

requirements-completed: [ADM-01, ADM-02, ADM-03, ADM-04]

# Metrics
duration: 7min
completed: 2026-03-15
---

# Phase 423 Plan 01: API + Admin UI Contract Names Summary

**Transaction API responses enriched with contractName/contractNameSource fields; Admin UI shows resolved contract names in transaction list Counterparty column and wallet detail Activity tab**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-15T13:37:18Z
- **Completed:** 2026-03-15T13:44:50Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- TxDetailResponseSchema extended with contractName and contractNameSource nullable optional fields
- resolveContractFields() helper created for consistent contract name resolution across all transaction endpoints
- 5 transaction endpoints enriched: GET /admin/transactions, GET /admin/wallets/:id/transactions, GET /transactions/:id, GET /transactions, GET /transactions/pending
- Admin UI transaction list shows "Protocol Name (0xabcd...1234)" format for CONTRACT_CALL rows
- Admin UI wallet detail Activity tab shows contract names in To column
- Expanded detail view includes "Contract Name" row when available

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend TxDetailResponse enrichment** - `04ab0fae` (feat)
2. **Task 2: Admin UI contract name display** - `e7532805` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/openapi-schemas.ts` - Added contractName/contractNameSource to TxDetailResponseSchema
- `packages/daemon/src/api/routes/admin.ts` - Added contractNameRegistry to AdminRouteDeps
- `packages/daemon/src/api/routes/admin-monitoring.ts` - resolveContractFields() helper + enrichment in GET /admin/transactions
- `packages/daemon/src/api/routes/admin-wallets.ts` - Contract name enrichment in GET /admin/wallets/:id/transactions
- `packages/daemon/src/api/routes/transactions.ts` - Contract name enrichment in GET /transactions/:id, list, pending
- `packages/daemon/src/api/server.ts` - Pass contractNameRegistry to adminRoutes
- `packages/admin/src/pages/transactions.tsx` - Contract name display in Counterparty column + detail view
- `packages/admin/src/pages/wallets.tsx` - Contract name display in Activity tab To column
- `packages/admin/src/api/types.generated.ts` - Regenerated with new fields

## Decisions Made
- Fallback source returns null (not truncated address) for both fields -- toAddress already serves that purpose
- resolveContractFields() exported from admin-monitoring.ts as shared helper, reused by admin-wallets.ts and transactions.ts
- Admin endpoint inline OpenAPI schemas updated alongside TxDetailResponseSchema for consistent API surface

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 423 is the final phase of milestone v32.0
- All 3 phases complete: Registry Core (421), Notification Pipeline (422), API + Admin UI (423)
- Ready for milestone completion

---
*Phase: 423-api-admin-ui-contract-names*
*Completed: 2026-03-15*
