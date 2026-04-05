---
phase: 81-pipeline-integration-stage5
plan: 02
subsystem: pipeline
tags: [CONC-01, ChainError, retry-logic, buildByType, exponential-backoff, TDD]

# Dependency graph
requires:
  - phase: 81-pipeline-integration-stage5
    provides: Stage 1 discriminatedUnion 5-type + Stage 3 type-based policy routing
  - phase: 80-batch-transactions
    provides: buildBatch, evaluateBatch, classifyInstruction
  - phase: 76-infra-pipeline-foundation
    provides: ChainError 27 codes 3-category system
provides:
  - Stage 5 CONC-01 complete implementation with build->simulate->sign->submit retry loop
  - buildByType 5-type adapter method routing (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH)
  - ChainError category-based retry (PERMANENT/TRANSIENT/STALE) with shared retryCount
  - ChainError -> WAIaaSError('CHAIN_ERROR') conversion for API responses
affects: [route handler pipeline error handling, Stage 6 confirmation, future tier-based timeout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildByType helper: dispatch to correct IChainAdapter method based on request.type"
    - "CONC-01 retry loop: outer buildLoop for STALE rebuild, inner retry for TRANSIENT backoff"
    - "Shared retryCount across TRANSIENT and STALE categories for total retry budget"
    - "sleep() extracted to separate module (pipeline/sleep.ts) for testability"

key-files:
  created:
    - packages/daemon/src/pipeline/sleep.ts
    - packages/daemon/src/__tests__/pipeline-stage5-execute.test.ts
  modified:
    - packages/daemon/src/pipeline/stages.ts

key-decisions:
  - "sleep() extracted to pipeline/sleep.ts for vi.mock testability -- internal module calls cannot be mocked via module-level mock"
  - "CONC-01 TRANSIENT retry rebuilds from Stage 5a (continue buildLoop) rather than retrying just the failed step -- simpler loop structure, same practical behavior since build/sign are local ops"
  - "buildByType default case uses CHAIN_ERROR error code (not INVALID_REQUEST which doesn't exist in error codes)"

patterns-established:
  - "buildByType: centralized request.type->adapter.build* dispatch for Stage 5"
  - "CONC-01 retry pattern: labeled while loop with retryCount guards (>=3 TRANSIENT, >=1 STALE)"

# Metrics
duration: 6min
completed: 2026-02-12
---

# Phase 81 Plan 02: Stage 5 CONC-01 Retry Loop + buildByType Summary

**Stage 5 CONC-01 complete: build->simulate->sign->submit loop with ChainError 3-category retry (PERMANENT instant fail, TRANSIENT 1s/2s/4s backoff max 3, STALE rebuild max 1) and buildByType 5-type adapter routing**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-12T04:09:05Z
- **Completed:** 2026-02-12T04:14:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Stage 5 now implements full CONC-01 pseudocode with retry logic for all 3 ChainError categories
- buildByType helper dispatches to correct IChainAdapter method for all 5 transaction types
- PERMANENT errors fail immediately (0 retries), TRANSIENT errors retry with exponential backoff (max 3 retries = 4 total attempts), STALE errors rebuild from Stage 5a (max 1 retry)
- retryCount shared between TRANSIENT and STALE to limit total retry budget
- ChainError instances converted to WAIaaSError('CHAIN_ERROR') for consistent API error responses
- 15 TDD tests pass, 582 total daemon tests pass, zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED -- Stage 5 CONC-01 failing tests** - `aa16b7c` (test)
2. **Task 2: TDD GREEN -- Stage 5 CONC-01 implementation + buildByType** - `f8cd8d0` (feat)

## Files Created/Modified
- `packages/daemon/src/pipeline/sleep.ts` - Extracted sleep utility for exponential backoff (vi.mock testable)
- `packages/daemon/src/__tests__/pipeline-stage5-execute.test.ts` - 15 TDD tests: 5 buildByType routing + 7 ChainError retry + 3 integration
- `packages/daemon/src/pipeline/stages.ts` - stage5Execute CONC-01 rewrite with buildByType, retry loop, ChainError->WAIaaSError conversion

## Decisions Made
- **sleep() extracted to separate module:** Internal module function calls cannot be intercepted by vi.mock at the module level. Extracting `sleep` to `pipeline/sleep.ts` allows clean vi.mock in tests without fake timers complexity.
- **TRANSIENT retry rebuilds from Stage 5a:** The CONC-01 pseudocode uses `continue buildLoop` for TRANSIENT, which rebuilds the entire transaction. This is simpler than tracking which step failed, and practically equivalent since build (5a) and sign (5c) are local operations that never throw TRANSIENT errors (only simulate/submit can have RPC issues).
- **buildByType default case uses CHAIN_ERROR:** `INVALID_REQUEST` is not in the WAIaaSError error codes enum. The default case (unknown type) uses `CHAIN_ERROR` -- this path should never be reached since Stage 1 validates the type field.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted sleep to separate module for testability**
- **Found during:** Task 2 (implementation)
- **Issue:** Plan specified sleep as module-level function in stages.ts. But vi.mock cannot intercept internal function calls within the same module -- tests would need real 1s/2s/4s delays.
- **Fix:** Created `pipeline/sleep.ts` with exported sleep function, imported by stages.ts. Tests vi.mock the sleep module.
- **Files modified:** packages/daemon/src/pipeline/sleep.ts (created), packages/daemon/src/pipeline/stages.ts
- **Verification:** All 15 tests pass in <100ms (no actual delays)
- **Committed in:** f8cd8d0

**2. [Rule 1 - Bug] Fixed INVALID_REQUEST error code to CHAIN_ERROR**
- **Found during:** Task 2 (build verification)
- **Issue:** `WAIaaSError('INVALID_REQUEST', ...)` in buildByType default case causes TypeScript error -- INVALID_REQUEST is not a valid error code in ERROR_CODES enum.
- **Fix:** Changed to `WAIaaSError('CHAIN_ERROR', ...)` which exists in the error codes.
- **Files modified:** packages/daemon/src/pipeline/stages.ts
- **Verification:** `pnpm turbo build` succeeds
- **Committed in:** f8cd8d0

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for testability and compilation. No scope creep.

## Issues Encountered
- TypeScript compilation error with INVALID_REQUEST error code -- resolved by using CHAIN_ERROR which is a valid error code in the enum.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Stage 5 pipeline integration fully complete for all 5 transaction types with CONC-01 retry logic
- Stage 1 + Stage 3 (Plan 01) + Stage 5 (Plan 02) = complete pipeline integration for v1.4
- Route handler discriminatedUnion OpenAPI support deferred (not blocking)
- Tier-based timeout (30s INSTANT/NOTIFY, 60s DELAY/APPROVAL from CONC-01 design doc) not implemented yet -- could be a future enhancement

## Self-Check: PASSED
---
*Phase: 81-pipeline-integration-stage5*
*Completed: 2026-02-12*
