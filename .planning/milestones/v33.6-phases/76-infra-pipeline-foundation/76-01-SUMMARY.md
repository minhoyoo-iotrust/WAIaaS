---
phase: 76-infra-pipeline-foundation
plan: 01
subsystem: infra
tags: [chain-error, error-handling, tdd, retry-category, pipeline]

# Dependency graph
requires:
  - phase: 48-monorepo-scaffold-core
    provides: WAIaaSError class, ERROR_CODES 68-code matrix, @waiaas/core package structure
provides:
  - ChainError class with 3-category system (PERMANENT/TRANSIENT/STALE)
  - 25 ChainErrorCode type-safe union + CHAIN_ERROR_CATEGORIES mapping
  - INSUFFICIENT_FOR_FEE error code moved to TX domain (DD-04 resolved)
affects:
  - 76-02 (Stage 5 pipeline uses ChainError.category for retry/abort branching)
  - 76-03 (retry logic depends on ChainError.retryable)
  - adapter-solana (will throw ChainError instead of generic errors)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ChainError 3-category: PERMANENT(no retry) / TRANSIENT(retry same) / STALE(rebuild+retry)"
    - "retryable auto-derived from category (category !== 'PERMANENT')"
    - "ChainError extends Error (not WAIaaSError) -- chain adapter internal, Stage 5 converts to WAIaaSError"

key-files:
  created:
    - packages/core/src/errors/chain-error.ts
    - packages/core/src/__tests__/chain-error.test.ts
  modified:
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/errors/index.ts
    - packages/core/src/index.ts
    - packages/core/src/__tests__/errors.test.ts

key-decisions:
  - "ChainError extends Error (not WAIaaSError) -- no httpStatus needed at chain adapter layer"
  - "INSUFFICIENT_FOR_FEE moved WITHDRAW->TX domain, httpStatus 500->400 (INFRA-05, DD-04 resolved)"
  - "Default message format 'Chain error: {CODE}' for consistency"

patterns-established:
  - "ChainError 3-category pattern: category auto-derived from CHAIN_ERROR_CATEGORIES map, retryable auto-derived from category"
  - "Chain adapter errors are separate from HTTP error codes -- Stage 5 catches and converts"

# Metrics
duration: 3min
completed: 2026-02-12
---

# Phase 76 Plan 01: ChainError + 3-Category System Summary

**ChainError class with 25 codes mapped to PERMANENT/TRANSIENT/STALE categories, retryable auto-derivation, INSUFFICIENT_FOR_FEE moved to TX domain**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-11T17:16:10Z
- **Completed:** 2026-02-11T17:19:17Z
- **Tasks:** 1
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- ChainError class with code, category, chain, retryable fields and toJSON() serialization
- 25 ChainErrorCode mapped to 3 categories: PERMANENT (17), TRANSIENT (4), STALE (4)
- retryable automatically derived from category (PERMANENT=false, TRANSIENT/STALE=true)
- INSUFFICIENT_FOR_FEE error code moved from WITHDRAW to TX domain (httpStatus 500->400), resolving DD-04 design debt
- 21 new tests covering construction, category mapping, retryable derivation, toJSON, cause chaining
- All 86 core tests pass, full monorepo build (7 packages) successful

## Task Commits

Each task was committed atomically:

1. **Task 1: ChainError class + 25 category mapping (TDD RED-GREEN)** - `8cb8791` (feat)

## Files Created/Modified
- `packages/core/src/errors/chain-error.ts` - ChainError class, ChainErrorCode type, CHAIN_ERROR_CATEGORIES mapping (127 lines)
- `packages/core/src/__tests__/chain-error.test.ts` - 21 tests: construction, 25-code category mapping, retryable derivation, toJSON, cause chaining (195 lines)
- `packages/core/src/errors/error-codes.ts` - INSUFFICIENT_FOR_FEE domain WITHDRAW->TX, httpStatus 500->400
- `packages/core/src/errors/index.ts` - Added ChainError, ChainErrorCategory, ChainErrorCode, CHAIN_ERROR_CATEGORIES exports
- `packages/core/src/index.ts` - Added ChainError-related exports to top-level barrel
- `packages/core/src/__tests__/errors.test.ts` - Updated TX domain count 21->22

## Decisions Made
- **ChainError extends Error (not WAIaaSError):** Chain adapter errors are internal; httpStatus is irrelevant at adapter layer. Stage 5 catches ChainError and converts to WAIaaSError for API responses. Keeps adapter layer decoupled from HTTP concerns.
- **INSUFFICIENT_FOR_FEE moved to TX domain (DD-04):** Gas fee insufficiency is a transaction concern, not a withdrawal concern. httpStatus changed from 500 to 400 since it's a client-detectable condition. This resolves design debt DD-04 (inability to distinguish gas fee insufficiency from transfer amount insufficiency).
- **Default message format:** `Chain error: {CODE}` provides consistent, grep-friendly default messages while allowing custom overrides.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused ChainErrorCategory type import in test file**
- **Found during:** Task 1 (build verification)
- **Issue:** `type ChainErrorCategory` was imported but never used in chain-error.test.ts, causing TS6133 build error
- **Fix:** Removed the unused type import
- **Files modified:** packages/core/src/__tests__/chain-error.test.ts
- **Verification:** `pnpm --filter @waiaas/core build` passes clean
- **Committed in:** 8cb8791 (part of task commit)

**2. [Rule 1 - Bug] Updated TX domain count in errors.test.ts**
- **Found during:** Task 1 (impact analysis)
- **Issue:** Existing test expected TX domain to have 21 codes, but after INSUFFICIENT_FOR_FEE domain move it has 22
- **Fix:** Changed assertion from `toHaveLength(21)` to `toHaveLength(22)`
- **Files modified:** packages/core/src/__tests__/errors.test.ts
- **Verification:** `pnpm --filter @waiaas/core test` passes all 86 tests
- **Committed in:** 8cb8791 (part of task commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for build/test correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ChainError class ready for use in Stage 5 pipeline (76-02, 76-03)
- Chain adapters (adapter-solana, future adapter-evm) can now throw ChainError with specific codes
- Pipeline retry logic can branch on `err.category` (PERMANENT=abort, TRANSIENT=retry, STALE=rebuild+retry)
- DD-04 resolved: SDK consumers can distinguish gas fee insufficiency (`INSUFFICIENT_FOR_FEE`) from transfer amount insufficiency (`INSUFFICIENT_BALANCE`)

## Self-Check: PASSED

---
*Phase: 76-infra-pipeline-foundation*
*Completed: 2026-02-12*
