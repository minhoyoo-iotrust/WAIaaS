---
phase: 444-daemon-defi-pipeline-tests
plan: 03
subsystem: daemon
tags: [testing, pipeline, gas-condition, reentry, timeout]
dependency_graph:
  requires: []
  provides: [pipeline-delay-reentry-tests, gas-waiting-reentry-tests, sign-timeout-tests, gas-estimation-error-tests, gas-condition-executor-tests]
  affects: [daemon-coverage]
tech_stack:
  added: []
  patterns: [in-memory-sqlite-testing, gas-price-cache-testing, mock-notification-service]
key_files:
  created:
    - packages/daemon/src/__tests__/pipeline-delay-reentry.test.ts
    - packages/daemon/src/__tests__/pipeline-gas-waiting-reentry.test.ts
    - packages/daemon/src/__tests__/pipeline-sign-timeout.test.ts
    - packages/daemon/src/__tests__/pipeline-gas-estimation-error.test.ts
    - packages/daemon/src/__tests__/gas-condition-executor.test.ts
  modified: []
decisions:
  - APPROVAL is not a valid DB status (pipeline halts with PIPELINE_HALTED, tx stays PENDING); tests use PENDING status for approval timeout scenarios
  - SIGN and X402_PAYMENT types are not in TransactionRequestSchema discriminated union; tests use valid types (APPROVE, TOKEN_TRANSFER) instead
metrics:
  duration: 8m
  completed: "2026-03-17T09:55:00Z"
  tests_added: 29
---

# Phase 444 Plan 03: Pipeline Edge Case Tests Summary

Pipeline 상태 머신의 5종 엣지 케이스(DELAY 재진입, GAS_WAITING 재진입, 서명 타임아웃, 가스 추정 실패, Gas Conditional 실행)를 29개 테스트로 커버했다.

## Completed Tasks

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | DELAY/GAS_WAITING reentry + sign timeout | f901c600 | 18 |
| 2 | Gas estimation error + Gas Conditional executor | f901c600 | 11 |

## What Was Built

### DELAY Reentry Tests (4 tests)
- APPROVE type request serialization (spender, token fields preserved)
- TOKEN_TRANSFER with memo field preservation
- Two independent requests produce independent metadata
- TRANSFER and BATCH stored independently

### GAS_WAITING Reentry Tests (7 tests)
- Combined maxGasPrice + maxPriorityFee condition (both must be met)
- Solana prioritization fee: meets/exceeds threshold
- Polling sequence: PENDING -> PENDING -> COMPLETED as gas drops
- Default timeout (3600s) when not specified
- RPC error isolation (returns PENDING, not throw)

### Sign Timeout Tests (7 tests)
- PENDING transaction creation
- PENDING -> FAILED transition via timeout handler
- Expired tx detection via created_at + timeout comparison
- Non-expired tx stays PENDING
- TX_FAILED notification mock verification
- Complete timeout flow: DB update + notification

### Gas Estimation Error Tests (4 tests)
- simulateTransaction PERMANENT ChainError -> WAIaaSError conversion
- EVM revert reason preserved in error message
- Transaction marked FAILED in DB on simulation error
- buildTransaction failure with FEE_ESTIMATION_FAILED

### Gas Conditional Executor Tests (7 tests)
- Cache TTL: reuses within window, fetches after expiry
- Boundary: gasPrice == maxGasPrice -> COMPLETED
- Boundary: gasPrice == maxGasPrice + 1 wei -> PENDING
- Solana: empty fees array -> 0n gasPrice, single-element array
- Timeout at exact boundary

## Deviations from Plan

### [Rule 1 - Bug] APPROVAL status not valid in DB CHECK constraint
- **Found during:** Task 1
- **Issue:** 'APPROVAL' is not a valid DB status; pipeline halts with PIPELINE_HALTED and tx stays PENDING
- **Fix:** Used 'PENDING' status for approval timeout scenario tests
- **Files modified:** pipeline-sign-timeout.test.ts

### [Rule 1 - Bug] SIGN/X402_PAYMENT not in discriminated union
- **Found during:** Task 1
- **Issue:** SIGN and X402_PAYMENT types are not in TransactionRequestSchema discriminated union (7 valid types)
- **Fix:** Replaced with valid types (APPROVE, TOKEN_TRANSFER with memo) that still test serialization preservation
- **Files modified:** pipeline-delay-reentry.test.ts

## Verification

All 29 tests passing:
```
Test Files  5 passed (5)
Tests       29 passed (29)
Duration    3.42s
```

Full actions package: 1338 tests, 77 files, all passing.
