---
phase: 386-type-system-errors-db
plan: 03
subsystem: core
tags: [action-provider, typescript, backward-compat, risk-level]

requires:
  - phase: 386-01
    provides: ResolvedAction 3-kind types (SignedDataAction, SignedHttpAction)

provides:
  - IActionProvider.resolve() 6-type return union (added SignedDataAction/SignedHttpAction/ResolvedAction[])
  - ActionDefinition.riskLevel 4-grade (added 'critical')
  - 18 backward compatibility tests

affects: [387, 388, 389, 390]

tech-stack:
  added: []
  patterns: [union-superset-backward-compat]

key-files:
  created:
    - packages/core/src/__tests__/action-provider-compat.test.ts
  modified:
    - packages/core/src/interfaces/action-provider.types.ts

key-decisions:
  - "Return type uses flat union (not nested discriminatedUnion) for IActionProvider compatibility"
  - "Existing 13 ActionProviders unchanged -- union superset guarantees backward compat"
  - "'critical' riskLevel added for high-stakes external actions (e.g., withdraw, large trades)"

patterns-established:
  - "Union superset extension: add new types to existing union without breaking implementors"

requirements-completed: [RTYPE-05, RTYPE-07]

duration: 4min
completed: 2026-03-12
---

# Phase 386 Plan 03: IActionProvider Return Type Extension + Backward Compat Summary

**IActionProvider.resolve() extended to 6-type union with SignedDataAction/SignedHttpAction/ResolvedAction[] and riskLevel 4-grade (critical added)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T18:03:00Z
- **Completed:** 2026-03-12T18:07:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- IActionProvider.resolve() return type extended from 3 to 6 types (added SignedDataAction, SignedHttpAction, ResolvedAction[])
- ActionDefinition.riskLevel extended from 3 to 4 grades (added 'critical')
- All 13 existing ActionProviders compile without any source changes
- Full monorepo typecheck passes (19/19 tasks)
- 18 backward compatibility tests covering all return types, riskLevel grades, and type guard behavior

## Task Commits

1. **Task 1 RED: Failing tests for return type extension** - `3174d306` (test)
2. **Task 1 GREEN: Implement IActionProvider extension** - `53fbe842` (feat)

## Files Created/Modified
- `packages/core/src/interfaces/action-provider.types.ts` - Extended resolve() return type union + riskLevel 4-grade
- `packages/core/src/__tests__/action-provider-compat.test.ts` - 18 backward compatibility tests

## Decisions Made
- Return type uses flat union (not nested discriminatedUnion) -- simpler for interface consumers
- Existing 13 ActionProviders unchanged -- union superset guarantees backward compat
- 'critical' riskLevel for high-stakes external actions requiring APPROVAL tier

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ContractCallRequest test fixture**
- **Found during:** Task 1 GREEN typecheck
- **Issue:** Test fixture included `chain` and `data` fields not in ContractCallRequest schema
- **Fix:** Removed invalid fields from test fixture
- **Files modified:** action-provider-compat.test.ts
- **Committed in:** 53fbe842

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test fixture correction only. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- IActionProvider interface ready for new providers returning SignedDataAction/SignedHttpAction
- riskLevel 4-grade ready for policy engine integration (Phase 389)
- All Phase 386 objectives complete -- ready for Phase 387 (Signer Capability registry)

---
*Phase: 386-type-system-errors-db*
*Completed: 2026-03-12*
