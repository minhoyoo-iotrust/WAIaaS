---
phase: 178-adapter-solana-branch-coverage
plan: 01
subsystem: testing
tags: [vitest, solana, branch-coverage, adapter, batch, sign-external]

# Dependency graph
requires:
  - phase: 117-sign-only-api
    provides: signExternalTransaction implementation in SolanaAdapter
  - phase: 113-batch-operations
    provides: buildBatch and convertBatchInstruction implementation
provides:
  - "Branch-coverage tests for convertBatchInstruction 4-type dispatch (TOKEN_TRANSFER, CONTRACT_CALL, APPROVE error paths)"
  - "Branch-coverage tests for signExternalTransaction (32-byte key, decode failure, outer catch)"
  - "adapter.ts branch coverage improved to 84.58%"
affects: [178-02, adapter-solana-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns: [branch-focused test isolation, dead-code documentation via skip]

key-files:
  created:
    - packages/adapters/solana/src/__tests__/solana-batch-branches.test.ts
    - packages/adapters/solana/src/__tests__/solana-sign-external-branches.test.ts
  modified: []

key-decisions:
  - "Unknown instruction type throw is dead code -- classifyInstruction is exhaustive, documented via it.skip"
  - "Buffer.from(str, 'base64') never throws in Node.js -- Step 1 catch in signExternalTransaction is unreachable dead code"
  - "0xFF bytes trigger compact-u16 decode failure for invalid transaction testing"

patterns-established:
  - "Dead code documentation: use it.skip with explanation comment instead of ignoring or forcing unreachable paths"
  - "Branch-focused test files complement existing happy-path tests without duplication"

requirements-completed: [SOL-01, SOL-02]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 178 Plan 01: Batch + SignExternal Branch Coverage Summary

**21 new branch-coverage tests for convertBatchInstruction 4-type dispatch and signExternalTransaction edge cases, bringing adapter.ts to 84.58% branch coverage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T03:06:41Z
- **Completed:** 2026-02-18T03:10:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- 14 passing + 1 skipped tests for convertBatchInstruction covering TOKEN_TRANSFER (mint not found, invalid owner, Token-2022, ATA exists), CONTRACT_CALL (missing programId/data/accounts, base64 data, 4 AccountRole combos), APPROVE (mint not found, invalid owner, Token-2022), and buildBatch outer catch (ChainError re-throw, WAIaaSError wrap)
- 7 passing tests for signExternalTransaction covering 32-byte private key path, transaction decode failure, malformed base64 handling, and outer catch wrapping
- All 175 adapter-solana tests pass (161 before + 14 new, previously 152 + 21 new = 175 total including existing misc branches tests)
- adapter.ts branch coverage at 84.58%, remaining uncovered: sweepAll (not implemented) and base64 decode try/catch (dead code)

## Task Commits

Each task was committed atomically:

1. **Task 1: convertBatchInstruction branch-coverage tests** - `cd4ef81` (test)
2. **Task 2: signExternalTransaction branch-coverage tests** - `516225f` (test)

## Files Created/Modified
- `packages/adapters/solana/src/__tests__/solana-batch-branches.test.ts` - Branch-focused tests for convertBatchInstruction 4-type dispatch + buildBatch error handling
- `packages/adapters/solana/src/__tests__/solana-sign-external-branches.test.ts` - Branch-focused tests for signExternalTransaction 32-byte key, decode failure, outer catch

## Decisions Made
- Unknown instruction type throw in convertBatchInstruction (line 1215) is dead code since classifyInstruction always returns a known type -- documented via `it.skip` instead of forcing unreachable code
- Buffer.from(str, 'base64') in Node.js is lenient and never throws -- Step 1 catch in signExternalTransaction is unreachable dead code, documented in test
- Used 0xFF repeated bytes to trigger compact-u16 signature count decode failure for invalid transaction testing (6 zero-bytes were actually decodable as a minimal tx)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed corrupted bytes test using 0xFF instead of 0x00**
- **Found during:** Task 2 (signExternalTransaction branch tests)
- **Issue:** `Buffer.from([0,0,0,0,0,0])` was actually decodable as a minimal Solana transaction, causing WALLET_NOT_SIGNER instead of expected INVALID_RAW_TRANSACTION
- **Fix:** Changed to `0xFF` repeated bytes which trigger compact-u16 decode overflow
- **Files modified:** solana-sign-external-branches.test.ts
- **Verification:** Test now correctly catches INVALID_RAW_TRANSACTION
- **Committed in:** 516225f (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test fixture correction. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Branch coverage for adapter.ts at 84.58%, remaining branches are sweepAll (unimplemented) and dead code
- Ready for Plan 02 (additional coverage targets if any)

## Self-Check: PASSED

All files verified present, all commit hashes found in git log.

---
*Phase: 178-adapter-solana-branch-coverage*
*Completed: 2026-02-18*
