---
phase: 356-tests-verification
plan: 02
subsystem: testing
tags: [vitest, msw, viem, decodeFunctionData, across, bridge-provider, status-tracker]

requires:
  - phase: 353
    provides: AcrossBridgeActionProvider, AcrossBridgeStatusTracker
provides:
  - AcrossBridgeActionProvider 5 actions integration tests (25 tests)
  - BridgeStatusTracker 2-phase polling tests (18 tests)
  - depositV3 calldata 12-param verification via decodeFunctionData
affects: []

tech-stack:
  added: []
  patterns: [viem decodeFunctionData for calldata verification in tests]

key-files:
  created:
    - packages/actions/src/providers/across/__tests__/across-bridge-provider.test.ts
    - packages/actions/src/providers/across/__tests__/bridge-status-tracker.test.ts
  modified: []

key-decisions:
  - "Used case-insensitive address comparison for custom recipient (viem returns checksummed)"

patterns-established:
  - "decodeFunctionData pattern for verifying ABI-encoded calldata in tests"
  - "StatusTracker mock: server.use() dynamic handler per test case"

requirements-completed: [TST-02, TST-03, TST-04, TST-05, TST-06]

duration: 4min
completed: 2026-03-09
---

# Phase 356 Plan 02: AcrossBridgeActionProvider + StatusTracker Integration Tests Summary

**ERC-20 BATCH/네이티브 ETH depositV3 calldata 12-param 검증 + 2-phase polling 상태 매핑 테스트 43건**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T16:37:30Z
- **Completed:** 2026-03-08T16:42:30Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- AcrossBridgeActionProvider 5 actions(quote/execute/status/routes/limits) 통합 테스트
- ERC-20 approve+depositV3 BATCH 2-element 배열 + 네이티브 ETH msg.value 분기 검증
- depositV3 calldata를 viem decodeFunctionData로 역파싱하여 12개 파라미터 정확성 검증
- 에러 시나리오 5가지(isAmountTooLow, limits, outputAmount=0, stale quote, unsupported chain) 검증
- AcrossBridgeStatusTracker/MonitoringTracker의 filled/pending/expired/refunded 상태 매핑 검증

## Task Commits

1. **Task 1+2: Provider + tracker tests** - `ed951120` (test)

## Files Created/Modified
- `packages/actions/src/providers/across/__tests__/across-bridge-provider.test.ts` - Provider 5 actions integration tests
- `packages/actions/src/providers/across/__tests__/bridge-status-tracker.test.ts` - StatusTracker 2-phase polling tests

## Decisions Made
- Custom recipient test uses case-insensitive comparison (viem returns EIP-55 checksummed addresses)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid Ethereum address in custom recipient test**
- **Found during:** Task 1 (provider tests)
- **Issue:** viem rejects non-checksummed mixed-case addresses
- **Fix:** Used lowercase address and case-insensitive comparison
- **Files modified:** across-bridge-provider.test.ts
- **Verification:** Test passes with lowercase address comparison
- **Committed in:** ed951120

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test data fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 110 tests passing across 5 test files
- Phase 356 (final phase) complete -- milestone v31.6 ready for completion

---
*Phase: 356-tests-verification*
*Completed: 2026-03-09*
