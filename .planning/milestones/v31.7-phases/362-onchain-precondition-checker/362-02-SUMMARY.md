---
phase: 362-onchain-precondition-checker
plan: 02
subsystem: testing
tags: [e2e, prompt, cli, onchain, runner]

requires:
  - phase: 362-onchain-precondition-checker
    provides: PreconditionChecker class
provides:
  - promptPreconditionAction with CI auto-approval and interactive readline
  - parseCliFilters for --network/--only CLI flag parsing
  - run-onchain.ts entry point with precondition check flow
  - test:onchain:check npm script
affects: [363]

tech-stack:
  added: []
  patterns: [cli-filter-parsing, ci-auto-approval, onchain-skip-networks-env]

key-files:
  created:
    - packages/e2e-tests/src/helpers/precondition-prompt.ts
    - packages/e2e-tests/src/run-onchain.ts
    - packages/e2e-tests/src/__tests__/precondition-prompt.test.ts
  modified:
    - packages/e2e-tests/src/helpers/index.ts
    - packages/e2e-tests/package.json

key-decisions:
  - "CI env auto-selects run-available (failed preconditions become test-level skips)"
  - "ONCHAIN_SKIP_NETWORKS env var passes failed networks to test runner for skip logic"
  - "tsx used for run-onchain.ts entry point (already in root devDependencies)"

patterns-established:
  - "Onchain runner pattern: check -> report -> prompt -> vitest with skip env"

requirements-completed: [ONCH-02]

duration: 3min
completed: 2026-03-09
---

# Phase 362 Plan 02: Interactive Prompt + Onchain Runner Summary

**Interactive precondition prompt with CI auto-approval, CLI filter parsing, and onchain test runner entry point**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-09T07:54:25Z
- **Completed:** 2026-03-09T07:56:30Z
- **Tasks:** 2 (TDD combined)
- **Files modified:** 5

## Accomplishments
- promptPreconditionAction with CI/interactive mode detection
- parseCliFilters for --network and --only flag parsing from argv
- run-onchain.ts entry point orchestrating check -> report -> prompt -> test execution
- 8 unit tests covering all prompt and CLI filter logic

## Task Commits

1. **Task 1+2: Prompt + CLI filters + runner + tests (TDD)** - `34d778f5` (feat)

## Files Created/Modified
- `packages/e2e-tests/src/helpers/precondition-prompt.ts` - PreconditionAction type, parseCliFilters, promptPreconditionAction
- `packages/e2e-tests/src/run-onchain.ts` - Onchain runner entry point
- `packages/e2e-tests/src/__tests__/precondition-prompt.test.ts` - 8 tests for prompt and filter logic
- `packages/e2e-tests/src/helpers/index.ts` - Re-export prompt helpers
- `packages/e2e-tests/package.json` - test:onchain:check script

## Decisions Made
- CI environment auto-selects 'run-available' -- failed preconditions become test-level skips via ONCHAIN_SKIP_NETWORKS
- Used tsx (from root devDependencies) for the entry point runner

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Onchain runner and precondition system ready for Phase 363 (onchain E2E scenarios)
- test:onchain:check script available for local and CI use

---
*Phase: 362-onchain-precondition-checker*
*Completed: 2026-03-09*
