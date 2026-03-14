---
phase: 413-typed-client-first-migration
plan: 02
subsystem: admin-dashboard
tags: [migration, typed-client, satisfies, generated-types]
dependency_graph:
  requires: [413-01, 412-01]
  provides: [dashboard-typed-migration-pattern]
  affects: [admin-pages, admin-tests]
tech_stack:
  added: []
  patterns: [satisfies-mock-verification, openapi-fetch-GET-POST, path-level-type-extraction]
key_files:
  created: []
  modified:
    - packages/admin/src/pages/dashboard.tsx
    - packages/admin/src/__tests__/dashboard.test.tsx
    - packages/admin/src/__tests__/dashboard-coverage.test.tsx
    - packages/admin/src/__tests__/dashboard-transactions.test.tsx
    - packages/admin/src/__tests__/dashboard-defi.test.tsx
decisions:
  - "AdminStats kept as manual interface -- generated type is `unknown` for /v1/admin/stats"
  - "DefiPositionSummary extracted from path-level type (no named schema)"
  - "Mock api uses function wrapper for GET/POST to enable mockImplementation per-test"
metrics:
  duration: 8min
  completed: "2026-03-15"
---

# Phase 413 Plan 02: Dashboard page migration + test mock satisfies Summary

Dashboard migrated from manual interfaces + apiGet/apiPost to typed client with 14 satisfies-verified mock objects.

## What Was Done

### Task 1: Migrate dashboard.tsx to typed client and generated types

- Replaced `apiGet/apiPost` imports with `api` from typed-client
- Replaced 4 manual interfaces with generated type aliases:
  - `AdminStatus` -> `components['schemas']['AdminStatusResponse']`
  - `RecentTransaction` -> `AdminStatus['recentTransactions'][number]`
  - `AgentPromptResult` -> `components['schemas']['AgentPromptResponse']`
  - `DefiPositionSummary` -> path-level extraction from `/v1/admin/defi/positions`
- Kept `AdminStats` as manual interface (generated type is `unknown`)
- Replaced all 7 API calls with typed client calls
- Used typed query params for transactions and defi endpoints
- **Commit**: 4f7d2d43

### Task 2: Update dashboard test mocks with satisfies generated types

- Updated all 4 test files to mock `../api/typed-client` instead of `../api/client`
- Mock `api.GET`/`api.POST` returning `{ data: ... }` shape per openapi-fetch contract
- Added 14 `satisfies` checks against `components['schemas']` generated types
- All 46 dashboard tests pass without regression
- **Commit**: a223c825

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Generated type for /v1/admin/stats is `unknown`**
- **Found during:** Task 1
- **Issue:** The OpenAPI spec does not have a named schema for AdminStats response (returns `unknown`)
- **Fix:** Kept AdminStats as a manual interface (1 remaining interface instead of 0)
- **Impact:** Phase 415 should add a named Zod schema for this endpoint

**2. [Rule 2 - Missing] Mock formattedAmount field for satisfies compliance**
- **Found during:** Task 2
- **Issue:** Generated AdminStatusResponse includes `formattedAmount: string | null` in recentTransactions, which old mocks omitted
- **Fix:** Added `formattedAmount: null as string | null` to all transaction mock objects
- **Files modified:** dashboard-coverage.test.tsx, dashboard-transactions.test.tsx

## Verification Results

- `pnpm --filter @waiaas/admin test -- --run dashboard` -- 46/46 tests pass
- `grep -c 'interface ' dashboard.tsx` = 1 (AdminStats only, generated type is `unknown`)
- `grep -c 'apiGet\|apiPost' dashboard.tsx` = 0 (all migrated)
- `grep -c 'satisfies' dashboard*.test.tsx` = 14 total
