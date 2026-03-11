---
phase: 374-테스트-검증
plan: "01"
subsystem: testing
tags: [e2e, polymarket, coverage-map, scenario-registry]

requires:
  - phase: 373-인터페이스-통합
    provides: Polymarket REST routes and action providers
provides:
  - 4 Polymarket E2E smoke scenarios (market-browse, order-place, position-pnl, settings-crud)
  - Updated E2E coverage map with polymarket provider and route entries
affects: [ci, e2e-tests]

tech-stack:
  added: []
  patterns: [Polymarket E2E scenario pattern following Hyperliquid onchain test structure]

key-files:
  created:
    - packages/e2e-tests/src/scenarios/onchain-polymarket.ts
    - packages/e2e-tests/src/__tests__/onchain-polymarket.e2e.test.ts
  modified:
    - packages/e2e-tests/src/e2e-coverage-map.ts

key-decisions:
  - "Follow Hyperliquid E2E pattern with WAIAAS_E2E_POLYMARKET_ENABLED env gating"
  - "4 scenarios: offchain settings/market/position + onchain order placement"

patterns-established:
  - "Polymarket E2E: offchain-first testing with graceful 4xx skip for onchain CLOB"

requirements-completed: [INTG-08]

duration: 3min
completed: 2026-03-11
---

# Phase 374 Plan 01: E2E Smoke Scenarios Summary

**4 Polymarket E2E smoke scenarios with ScenarioRegistry registration and coverage map integration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T17:19:06Z
- **Completed:** 2026-03-10T17:22:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 4 Polymarket E2E scenarios registered in ScenarioRegistry (market-browse, order-place, position-pnl, settings-crud)
- E2E test file with CLOB mock-based offchain + onchain flow verification
- Coverage map updated: verify-e2e-coverage passes (14 providers, 29 routes, 13 scenarios)

## Task Commits

1. **Task 1: E2E scenario registration + test file** - `6f5c7fc5` (test)
2. **Task 2: E2E coverage map update** - `5984a5cd` (test)

## Files Created/Modified
- `packages/e2e-tests/src/scenarios/onchain-polymarket.ts` - 4 scenario registrations
- `packages/e2e-tests/src/__tests__/onchain-polymarket.e2e.test.ts` - E2E test with 4 describe blocks
- `packages/e2e-tests/src/e2e-coverage-map.ts` - polymarket provider + route entries added

## Decisions Made
- Followed Hyperliquid E2E pattern with env var gating (WAIAAS_E2E_POLYMARKET_ENABLED)
- Mixed offchain (settings, markets, positions) and onchain (order place) scenarios

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- E2E smoke coverage complete for Polymarket
- All CI verification scripts pass
