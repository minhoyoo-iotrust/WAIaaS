---
phase: 400
plan: "02"
subsystem: rpc-proxy
tags: [rpc-proxy, from-validation, async-approval, batch, long-poll]
dependency_graph:
  requires: [400-01]
  provides: [from-validation-tests, timeout-formatting]
  affects: [method-handlers.ts]
tech_stack:
  added: []
  patterns: [txId-in-timeout-error, from-auto-fill]
key_files:
  created:
    - packages/daemon/src/__tests__/rpc-proxy/rpc-proxy-route.test.ts
  modified:
    - packages/daemon/src/rpc-proxy/method-handlers.ts
decisions:
  - Timeout errors include txId in JSON-RPC error data field (ASYNC-04)
  - from validation extracted as testable helper validateAndFillFrom (from 400-01)
metrics:
  duration: ~2min
  completed: 2026-03-13
---

# Phase 400 Plan 02: Long-poll Async Approval + Batch + from Validation Summary

ASYNC-04 timeout error formatting with txId in data field, plus 19 route-level integration tests covering from validation (SEC-02/SEC-03), async timeout, and batch processing (RPC-05).

## What Was Done

### Task 1: from validation + async timeout error formatting
- Added ASYNC-04 txId extraction from timeout error messages in method-handlers.ts
- from validation and batch processing were already implemented in 400-01 (proactive inclusion)

### Task 2: Route-level integration tests
- 19 tests covering:
  - from validation: match, case-insensitive, mismatch, auto-fill (eth_sendTransaction, eth_signTransaction, personal_sign, eth_sign, eth_signTypedData_v4)
  - Timeout error formatting: txId in data field, -32000 error code
  - Batch processing: mixed methods, empty batch

## Deviations from Plan

None -- plan executed as written (from validation logic already in 400-01, only timeout formatting + tests needed).

## Verification

- All 19 new route tests pass
- All 103+ existing rpc-proxy tests continue to pass
- No new type errors

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1+2 | 557aa817 | feat(400-02): add long-poll async timeout formatting, from validation, and batch tests |
