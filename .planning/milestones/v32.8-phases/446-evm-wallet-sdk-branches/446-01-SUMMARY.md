---
phase: 446-evm-wallet-sdk-branches
plan: 01
subsystem: testing
tags: [evm, viem, coverage, branches, error-paths, mapError, tx-parser]

requires:
  - phase: 444-daemon-defi-pipeline
    provides: test infrastructure patterns (mock-based unit testing)
provides:
  - EVM adapter.ts branch coverage 91.35%
  - EVM tx-parser.ts branch coverage 100%
  - EVM package total branches 91.34%
  - vitest.config.ts branches threshold raised to 85
affects: [448-unified-thresholds]

tech-stack:
  added: []
  patterns: [mock-client error injection, mapError classification testing]

key-files:
  created:
    - packages/adapters/evm/src/__tests__/evm-adapter-errors.test.ts
    - packages/adapters/evm/src/__tests__/tx-parser.test.ts
  modified:
    - packages/adapters/evm/vitest.config.ts

key-decisions:
  - "Error path tests use same mock-client pattern as existing evm-adapter.test.ts for consistency"
  - "tx-parser tests use real viem serializeTransaction to create realistic fixtures"

patterns-established:
  - "Error classification testing: inject specific error messages via mockRejectedValue, assert ChainError code"

requirements-completed: [EVM-01, EVM-02, EVM-03, EVM-04]

duration: 6min
completed: 2026-03-17
---

# Phase 446 Plan 01: EVM adapter.ts Error Path + tx-parser.ts Branch Tests Summary

**EVM adapter.ts mapError/rethrow/fallback 72 tests + tx-parser.ts 15 tests bringing branches from 76.53% to 91.34%**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-17T12:07:50Z
- **Completed:** 2026-03-17T12:14:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- adapter.ts branches raised from 72.34% to 91.35% with 72 new error path tests
- tx-parser.ts branches raised from 66.66% to 100% with 15 new tests covering all 4 classifications + null to
- Total EVM package branches raised from 76.53% to 91.34%, vitest threshold raised from 71 to 85

## Task Commits

1. **Task 1: adapter.ts error path + branch tests** - `018f5347` (test)
2. **Task 2: tx-parser.ts branch tests + vitest threshold** - `ed4ff632` (test)

## Files Created/Modified
- `packages/adapters/evm/src/__tests__/evm-adapter-errors.test.ts` - 72 tests covering mapError 5 branches, error rethrow, waitForConfirmation 3-stage, getAssets multicall fallback, getTokenInfo defaults, NFT errors, signExternalTransaction errors, getTransactionFee null fallback
- `packages/adapters/evm/src/__tests__/tx-parser.test.ts` - 15 tests covering NATIVE_TRANSFER, TOKEN_TRANSFER, APPROVE, CONTRACT_CALL, null to fallback, parse errors
- `packages/adapters/evm/vitest.config.ts` - branches threshold 71 -> 85

## Decisions Made
- Used mock-client error injection pattern consistent with existing evm-adapter.test.ts
- tx-parser tests use real viem serializeTransaction/encodeFunctionData for realistic fixtures rather than hardcoded hex

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EVM package branches at 91.34%, well above 85% target
- Ready for Phase 448 unified threshold enforcement

---
*Phase: 446-evm-wallet-sdk-branches*
*Completed: 2026-03-17*
