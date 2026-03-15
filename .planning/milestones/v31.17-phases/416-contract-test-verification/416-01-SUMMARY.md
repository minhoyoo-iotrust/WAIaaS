---
phase: 416-contract-test-verification
plan: 01
subsystem: testing
tags: [openapi, contract-test, vitest, ci]

requires:
  - phase: 412-spec-extraction-pipeline
    provides: openapi.json spec + types.generated.ts + CI freshness gate
  - phase: 414-interface-migration
    provides: types.aliases.ts central type alias module

provides:
  - API contract test script (scripts/check-api-contract.ts)
  - Vitest contract test suite (7 tests)
  - CI gate step for schema-UI consistency

affects: []

tech-stack:
  added: []
  patterns: [schema-reference-validation, negative-test-simulation]

key-files:
  created:
    - scripts/check-api-contract.ts
    - packages/admin/src/__tests__/api-contract.test.ts
  modified:
    - package.json
    - .github/workflows/ci.yml

key-decisions:
  - "Field access check is informational (not blocking) since data.field can refer to destructured vars"
  - "Schema reference check (components['schemas'] existence) is the hard contract gate"
  - "Negative tests simulate missing schemas in-memory rather than modifying openapi.json"

patterns-established:
  - "Contract test pattern: extract references from source, validate against spec"

requirements-completed: [API-05]

duration: 2min
completed: 2026-03-15
---

# Phase 416 Plan 01: Contract Test + CI Summary

**OpenAPI spec vs Admin UI schema reference contract test with 7 vitest cases and CI gate step**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-14T21:03:13Z
- **Completed:** 2026-03-14T21:05:21Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Contract check script validates 28 schema references against 129 spec schemas
- 7 vitest tests covering existence, properties, and negative detection cases
- CI stage2 gate step after API Types Freshness check

## Task Commits

Each task was committed atomically:

1. **Task 1: Contract test script + vitest tests** - `36a1d9f4` (feat)
2. **Task 2: CI workflow integration** - `46455a69` (chore)

## Files Created/Modified
- `scripts/check-api-contract.ts` - Standalone contract validation script (schema ref + property + field access checks)
- `packages/admin/src/__tests__/api-contract.test.ts` - 7 vitest tests for structural consistency
- `package.json` - Added check:api-contract script
- `.github/workflows/ci.yml` - Added "Check API Contract" step in stage2

## Decisions Made
- Field access check (data.field pattern) is INFO-level only, not a hard gate -- too many false positives from destructured variables and nested accesses
- Schema reference validation is the hard contract: if types.aliases.ts references a schema not in openapi.json, it fails
- Negative tests use in-memory simulation (fake schema name injection) rather than file mutation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- This is the final phase of milestone v31.17
- All 5 phases (412-416) complete: spec extraction, typed client, interface migration, API constants, contract test

---
*Phase: 416-contract-test-verification*
*Completed: 2026-03-15*
