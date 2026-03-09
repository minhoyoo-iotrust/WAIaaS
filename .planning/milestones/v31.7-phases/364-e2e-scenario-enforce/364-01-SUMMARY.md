---
phase: 364-e2e-scenario-enforce
plan: 01
subsystem: testing
tags: [e2e, coverage, verification, tsx]

requires:
  - phase: 357-e2e-infra
    provides: E2E scenario registry and types
provides:
  - E2E coverage map (providerCoverage, routeCoverage)
  - verify-e2e-coverage.ts script with fix hints
  - verify:e2e-coverage npm script
affects: [364-02, ci]

tech-stack:
  added: []
  patterns: [filesystem-scan-verify pattern for coverage enforcement]

key-files:
  created:
    - packages/e2e-tests/src/e2e-coverage-map.ts
    - scripts/verify-e2e-coverage.ts
  modified:
    - package.json

key-decisions:
  - "Fix hints always shown on failure (no --fix-hint flag needed)"
  - "ROUTE_EXCLUDES covers index/openapi-schemas/utils/display-currency-helper"
  - "Mainnet-only DeFi providers mapped to offchain settings test"

patterns-established:
  - "Coverage map pattern: declarative mapping of source artifacts to E2E scenario files"

requirements-completed: [ENFORCE-01, ENFORCE-02, ENFORCE-04]

duration: 3min
completed: 2026-03-09
---

# Phase 364 Plan 01: E2E Coverage Mapping Registry + Verification Script Summary

**Declarative provider/route-to-scenario mapping with filesystem scan verification script enforcing E2E coverage completeness**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T08:17:46Z
- **Completed:** 2026-03-09T08:21:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created e2e-coverage-map.ts with 13 provider mappings and 28 route mappings
- Created verify-e2e-coverage.ts that scans filesystem and validates coverage
- Script detects missing providers, missing routes, and empty scenario files
- All 13 providers, 28 routes, and 13 scenarios pass verification

## Task Commits

Each task was committed atomically:

1. **Task 1: E2E coverage mapping registry** - `6f2dc736` (feat)
2. **Task 2: verify-e2e-coverage.ts script** - `2c245eaf` (feat)

## Files Created/Modified
- `packages/e2e-tests/src/e2e-coverage-map.ts` - Declarative provider/route to scenario mapping
- `scripts/verify-e2e-coverage.ts` - Verification script scanning filesystem against coverage map
- `package.json` - Added verify:e2e-coverage script

## Decisions Made
- Fix hints always displayed on failure for developer convenience
- ROUTE_EXCLUDES set to index, openapi-schemas, utils, display-currency-helper
- Mainnet-only DeFi providers mapped to advanced-defi-settings-push-relay.ts (offchain settings test)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- verify:e2e-coverage script ready for CI integration in Plan 364-02
- Script exit code 0/1 enables direct use in CI workflows

---
*Phase: 364-e2e-scenario-enforce*
*Completed: 2026-03-09*
