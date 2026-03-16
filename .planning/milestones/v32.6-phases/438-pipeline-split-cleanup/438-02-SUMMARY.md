---
phase: 438-pipeline-split-cleanup
plan: 02
subsystem: adapters, core
tags: [error-handling, mapError, logging, ILogger, solana, refactoring]

# Dependency graph
requires:
  - phase: 438-pipeline-split-cleanup
    provides: Plan 01 pipeline split (no direct dependency, same phase)
provides:
  - Centralized Solana error handling via mapError()
  - ILogger interface and ConsoleLogger in @waiaas/core
affects: [adapters-solana, core, daemon]

# Tech tracking
tech-stack:
  added: []
  patterns: [centralized-error-mapping-method, logger-abstraction-interface]

key-files:
  created:
    - packages/core/src/interfaces/logger.ts
    - packages/adapters/solana/src/__tests__/solana-error-mapping.test.ts
  modified:
    - packages/adapters/solana/src/adapter.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/index.ts

key-decisions:
  - "Used human-readable operation names in mapError (e.g., 'get balance' not 'getBalance') for clearer error messages"
  - "mapError checks both WAIaaSError and ChainError passthrough (both are valid upstream error types)"
  - "Kept 3 specialized catch blocks unchanged (parseTransaction, signExternalTransaction use ChainError directly)"

patterns-established:
  - "mapError pattern: private method in adapter class centralizes error wrapping logic"
  - "ILogger interface: 4 methods (debug/info/warn/error) with optional context Record"

requirements-completed: [CLN-01, CLN-02, CLN-03, CLN-04]

# Metrics
duration: 10min
completed: 2026-03-17
---

# Phase 438 Plan 02: Solana mapError + ILogger Summary

**Centralized Solana adapter error handling with mapError() replacing 14 duplicated catch patterns, plus ILogger abstraction interface in @waiaas/core**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-16T19:35:00Z
- **Completed:** 2026-03-16T19:45:00Z
- **Tasks:** 2 (TDD task + ILogger task)
- **Files modified:** 5

## Accomplishments
- Added private mapError() method to SolanaAdapter (WAIaaSError/ChainError passthrough, generic Error wrapping)
- Replaced 14 duplicated catch patterns with single this.mapError() calls (-48 lines of boilerplate)
- Created 6 error classification tests via TDD (RED -> GREEN)
- Created ILogger interface + ConsoleLogger with prefix support in @waiaas/core
- Full monorepo: 20 packages typecheck, 0 lint errors, 5,251 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing tests** - `897f90bb` (test)
2. **Task 1 GREEN: mapError() + catch replacements** - `5316a643` (feat)
3. **Task 2: ILogger + ConsoleLogger** - `e5d61e68` (feat)

## Files Created/Modified
- `packages/adapters/solana/src/adapter.ts` - Added mapError(), replaced 14 catch blocks
- `packages/adapters/solana/src/__tests__/solana-error-mapping.test.ts` - 6 error classification tests
- `packages/core/src/interfaces/logger.ts` - ILogger interface + ConsoleLogger class
- `packages/core/src/interfaces/index.ts` - Re-export ILogger/ConsoleLogger
- `packages/core/src/index.ts` - Re-export from interfaces barrel

## Decisions Made
- Human-readable operation names in mapError for clearer error messages
- Kept parseTransaction/signExternalTransaction catch blocks unchanged (they throw ChainError directly, different pattern)
- ConsoleLogger uses optional prefix for component identification

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test typecheck error for mapError return type**
- **Found during:** Task 2 (full typecheck)
- **Issue:** Test function returned `(adapter as any).mapError()` but return type `any` not assignable to `never`
- **Fix:** Removed return, added unreachable throw
- **Verification:** tsc --noEmit passes for all 20 packages

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial typecheck fix in test file. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 438 complete, milestone v32.6 ready for PR

---
*Phase: 438-pipeline-split-cleanup*
*Completed: 2026-03-17*
