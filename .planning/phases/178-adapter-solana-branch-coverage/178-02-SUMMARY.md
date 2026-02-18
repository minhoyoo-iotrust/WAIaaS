---
phase: 178-adapter-solana-branch-coverage
plan: 02
subsystem: testing
tags: [solana, vitest, branch-coverage, tx-parser, adapter]

# Dependency graph
requires:
  - phase: 178-adapter-solana-branch-coverage
    provides: "Plan 01 buildBatch/signExternal branch tests established coverage foundation"
provides:
  - "tx-parser.ts branch coverage: all instruction type branches (System, Token, Token-2022, unknown) exercised"
  - "adapter.ts misc branch coverage: error re-throw paths, sort comparator, getTokenInfo data handling"
  - "28 new test cases across 2 test files"
  - "Branch coverage 84.87% (from ~65% baseline)"
affects: [181-coverage-threshold-update]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw instruction binary data construction for tx-parser branch testing"
    - "vi.hoisted + vi.mock pattern for adapter.ts error path testing"

key-files:
  created:
    - packages/adapters/solana/src/__tests__/solana-tx-parser-branches.test.ts
    - packages/adapters/solana/src/__tests__/solana-misc-branches.test.ts
  modified: []

key-decisions:
  - "Used real @solana/kit transaction building for tx-parser tests (offline, no mocks needed)"
  - "Tested non-Error throws (string, number, null, undefined) to exercise Error instanceof branches"
  - "Documented staticAccounts/instructions null coalescing as untestable defensive fallbacks"

patterns-established:
  - "Raw instruction building: construct Uint8Array with specific binary layout to test parser branches"
  - "Non-Error throw testing: mock RPC to reject with primitive values to test instanceof Error ternaries"

requirements-completed: [SOL-03, SOL-04]

# Metrics
duration: 4min
completed: 2026-02-18
---

# Phase 178 Plan 02: tx-parser edge cases + adapter misc branches Summary

**28 branch-coverage tests for tx-parser instruction parsing and adapter.ts error/sort/tokenInfo paths, raising branch coverage from ~65% to 84.87%**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-18T03:06:44Z
- **Completed:** 2026-02-18T03:10:48Z
- **Tasks:** 2
- **Files modified:** 2 (created)

## Accomplishments
- tx-parser.ts: All instruction type branches exercised (parseSystemInstruction short data + non-transfer index, parseTokenInstruction empty/SPL_APPROVE/short TransferChecked/other types, Token-2022 dispatch, CONTRACT_CALL method variants)
- adapter.ts: Error instanceof branches tested with non-Error values (string, number, null, undefined)
- adapter.ts: getAssets sort comparator equal-balance, WAIaaSError re-throw, estimateFee token error paths
- adapter.ts: signTransaction 32-byte key, getTokenInfo raw data edge cases (not-array, short array, short buffer)
- Branch coverage 84.87% -- significantly above 75% target

## Task Commits

Each task was committed atomically:

1. **Task 1: tx-parser.ts branch-coverage tests** - `6f59894` (test)
2. **Task 2: Error instanceof + getAssets sort + estimateFee error branch tests** - `ea7b21f` (test)

## Files Created/Modified
- `packages/adapters/solana/src/__tests__/solana-tx-parser-branches.test.ts` - 14 tests: parseSystem/Token instruction branches, Token-2022 dispatch, CONTRACT_CALL method variants, null coalescing fallbacks
- `packages/adapters/solana/src/__tests__/solana-misc-branches.test.ts` - 14 tests: getAssets sort/re-throw, estimateFee errors, Error instanceof, signTransaction 32-byte key, getTokenInfo data handling

## Decisions Made
- Used real @solana/kit transaction building for tx-parser tests rather than mocking the decoder -- this tests the actual parsing path end-to-end
- Tested non-Error throws (string, number, null, undefined) via mock RPC rejection to exercise the `error instanceof Error ? error.message : String(error)` ternaries
- Documented that `compiledMessage.staticAccounts ?? []` and `compiledMessage.instructions ?? []` are defensive fallbacks that cannot be triggered with real decoders

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- adapter-solana branch coverage at 84.87%, well above the 75% target
- Phase 181 can update the branch coverage threshold in vitest.config.ts if desired
- All 166 tests pass with 0 regressions

## Self-Check: PASSED

- [x] solana-tx-parser-branches.test.ts exists
- [x] solana-misc-branches.test.ts exists
- [x] 178-02-SUMMARY.md exists
- [x] Commit 6f59894 found
- [x] Commit ea7b21f found

---
*Phase: 178-adapter-solana-branch-coverage*
*Completed: 2026-02-18*
