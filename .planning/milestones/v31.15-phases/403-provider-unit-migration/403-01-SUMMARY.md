---
phase: 403-provider-unit-migration
plan: 01
subsystem: actions
tags: [migrateAmount, aave-v3, smallest-unit, backward-compatibility, deprecation]

requires:
  - phase: 402-schema-hardening
    provides: Provider schema .describe() with unit information
provides:
  - migrateAmount() shared helper for backward-compatible unit migration
  - Aave V3 provider migrated to smallest-unit (wei) input
  - Aave V3 schemas updated with smallest-unit descriptions
affects: [403-02, 404, 405]

tech-stack:
  added: []
  patterns: [migrateAmount decimal-detection pattern, deprecation warning for legacy inputs]

key-files:
  created:
    - packages/actions/src/common/migrate-amount.ts
    - packages/actions/src/common/migrate-amount.test.ts
    - packages/actions/src/providers/aave-v3/aave-v3.test.ts
  modified:
    - packages/actions/src/providers/aave-v3/index.ts
    - packages/actions/src/providers/aave-v3/schemas.ts

key-decisions:
  - "migrateAmount uses string.includes('.') for decimal detection -- simple and reliable"
  - "Zero value (0n) passed through without validation -- provider-level validation handles it"

patterns-established:
  - "migrateAmount pattern: import migrateAmount, replace parseTokenAmount calls, keep max keyword guard above"

requirements-completed: [UNIT-01, UNIT-02, UNIT-05]

duration: 3min
completed: 2026-03-14
---

# Phase 403 Plan 01: migrateAmount() helper + Aave V3 migration Summary

**migrateAmount() shared helper with decimal-detection deprecation + Aave V3 4-action smallest-unit migration preserving max keyword**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T07:04:09Z
- **Completed:** 2026-03-14T07:08:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created migrateAmount() shared helper that detects decimal inputs for auto-conversion with deprecation warning
- Migrated all 4 Aave V3 actions (supply, borrow, repay, withdraw) from parseTokenAmount to migrateAmount
- Updated Aave V3 schemas with smallest-unit (wei) descriptions
- Preserved max keyword handling for repay/withdraw (MAX_UINT256)
- 14 total tests passing (7 helper + 7 provider)

## Task Commits

Each task was committed atomically:

1. **Task 1: migrateAmount() shared helper** - `fee9a520` (feat)
2. **Task 2: Aave V3 provider smallest-unit migration** - `1af37611` (feat)

## Files Created/Modified
- `packages/actions/src/common/migrate-amount.ts` - Shared helper: decimal detection + parseTokenAmount fallback + deprecation warning
- `packages/actions/src/common/migrate-amount.test.ts` - 7 tests: integer passthrough, decimal conversion, zero, fractional-only, warning verification
- `packages/actions/src/providers/aave-v3/index.ts` - Replaced parseTokenAmount with migrateAmount in all 4 resolve methods
- `packages/actions/src/providers/aave-v3/schemas.ts` - Updated amount descriptions to smallest-unit format
- `packages/actions/src/providers/aave-v3/aave-v3.test.ts` - 7 tests: smallest-unit, legacy decimal, max keyword for all actions

## Decisions Made
- migrateAmount uses `value.includes('.')` for decimal detection -- simple, covers all legacy input patterns including ".5"
- Zero value (0n) is passed through without validation -- provider-level checks handle zero/negative amounts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test file type errors**
- **Found during:** Task 2 (Aave V3 test verification)
- **Issue:** Test context included `network` property not in ActionContext type; unused MAX_UINT256 import
- **Fix:** Removed `network` from test context, removed unused import
- **Files modified:** packages/actions/src/providers/aave-v3/aave-v3.test.ts
- **Verification:** typecheck passes
- **Committed in:** 1af37611 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type fix in test file. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- migrateAmount() helper ready for use by Kamino, Lido, Jito providers (Plan 403-02)
- Pattern established: import migrateAmount, replace parseTokenAmount, guard max keyword

---
*Phase: 403-provider-unit-migration*
*Completed: 2026-03-14*
