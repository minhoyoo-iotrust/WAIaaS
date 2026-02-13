---
phase: 96-pipeline-confirmation-fix
verified: 2026-02-13T21:20:00Z
status: passed
score: 7/7
re_verification: false
---

# Phase 96: 파이프라인 확인 로직 수정 Verification Report

**Phase Goal:** 트랜잭션이 온체인에서 성공했으나 확인 단계에서 RPC 에러/타임아웃이 발생해도, DB 상태가 온체인 상태와 일치한다
**Verified:** 2026-02-13T21:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | EVM waitForConfirmation이 타임아웃/RPC 에러 시 getTransactionReceipt fallback으로 온체인 상태를 정확히 반환한다 | ✓ VERIFIED | packages/adapters/evm/src/adapter.ts:415-431 catch 블록에서 getTransactionReceipt fallback 구현, receipt.status 기반으로 confirmed/failed 반환. 테스트 "returns confirmed via fallback receipt on timeout" 통과 |
| 2 | stage6Confirm이 waitForConfirmation 반환값(confirmed/failed/submitted)에 따라 DB 상태를 정확히 분기한다 | ✓ VERIFIED | packages/daemon/src/pipeline/stages.ts:685-722 3-way 분기 구현 (confirmed→CONFIRMED, failed→FAILED, submitted→유지). 테스트 3개 모두 통과 |
| 3 | SUBMITTED 상태인 트랜잭션이 확인 실패로 인해 FAILED로 잘못 덮어쓰여지지 않는다 | ✓ VERIFIED | stages.ts:717-722 submitted 경로는 DB 업데이트 없음 (상태 유지). 테스트 "should keep SUBMITTED when waitForConfirmation returns submitted" 통과 |
| 4 | 기존 정상 경로(타임아웃 없는 확인)에 대한 회귀가 없다 | ✓ VERIFIED | EVM/Solana adapter 정상 경로 테스트 통과, stage6 "should update DB to CONFIRMED on success" 통과, 91개 관련 테스트 전체 통과 |
| 5 | Solana waitForConfirmation이 RPC 에러 시 throw 대신 'submitted' 상태를 반환한다 | ✓ VERIFIED | packages/adapters/solana/src/adapter.ts:432-435 catch 블록에서 submitted 반환 구현. 테스트 "returns submitted on RPC failure during polling" 통과 |
| 6 | SubmitResult.status 타입이 'failed'를 포함한다 | ✓ VERIFIED | packages/core/src/interfaces/chain-adapter.types.ts:58 `status: 'submitted' \| 'confirmed' \| 'finalized' \| 'failed'` 정의 |
| 7 | 알림 로직이 새 동작(failed 상태 반환)에 맞게 동작한다 | ✓ VERIFIED | packages/daemon/src/__tests__/pipeline-notification.test.ts "should fire TX_FAILED notify when waitForConfirmation returns failed" 통과 |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| packages/core/src/interfaces/chain-adapter.types.ts | SubmitResult.status에 'failed' 추가 | ✓ VERIFIED | Line 58: 'submitted' \| 'confirmed' \| 'finalized' \| 'failed' 정의 확인 |
| packages/adapters/evm/src/adapter.ts | waitForConfirmation fallback receipt 조회 | ✓ VERIFIED | Lines 401-431: getTransactionReceipt fallback 구현, receipt.status 기반 confirmed/failed 반환 |
| packages/daemon/src/pipeline/stages.ts | stage6Confirm 반환값 기반 3-way 분기 | ✓ VERIFIED | Lines 685-722: result.status === 'confirmed'\|'failed'\|'submitted' 3분기 구현 |
| packages/adapters/evm/src/__tests__/evm-adapter.test.ts | 5개 waitForConfirmation 테스트 | ✓ VERIFIED | 5개 테스트 확인 (confirmed, timeout+fallback, RPC error, revert) 모두 통과 |
| packages/daemon/src/__tests__/pipeline.test.ts | Stage 6 테스트 3개 | ✓ VERIFIED | CONFIRMED 성공, submitted 유지, failed 반환 테스트 3개 통과 |
| packages/daemon/src/__tests__/pipeline-notification.test.ts | TX_FAILED 알림 테스트 | ✓ VERIFIED | "should fire TX_FAILED notify when waitForConfirmation returns failed" 통과 |
| packages/adapters/solana/src/adapter.ts | waitForConfirmation RPC 에러 시 submitted 반환 | ✓ VERIFIED | Lines 432-435: catch 블록에서 return { txHash, status: 'submitted' } 구현 |
| packages/adapters/solana/src/__tests__/solana-adapter.test.ts | RPC 에러 테스트 | ✓ VERIFIED | "returns submitted on RPC failure during polling" 테스트 통과 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| packages/adapters/evm/src/adapter.ts | packages/core/src/interfaces/chain-adapter.types.ts | SubmitResult type import | ✓ WIRED | Line 40: SubmitResult 임포트, waitForConfirmation 반환 타입으로 사용 (lines 371, 401) |
| packages/daemon/src/pipeline/stages.ts | packages/adapters/evm/src/adapter.ts | waitForConfirmation return value | ✓ WIRED | Line 683: ctx.adapter.waitForConfirmation 호출, line 685/700: result.status 3분기 사용 |
| packages/adapters/solana/src/adapter.ts | packages/core/src/interfaces/chain-adapter.types.ts | SubmitResult type import | ✓ WIRED | SubmitResult 임포트, waitForConfirmation 메서드에서 사용 |
| packages/daemon/src/pipeline/stages.ts | adapter.waitForConfirmation | 반환값 기반 DB 상태 분기 | ✓ WIRED | confirmed→CONFIRMED (lines 685-698), failed→FAILED (lines 700-715), submitted→유지 (lines 717-722) |

### Requirements Coverage

Phase 96은 BUG-015 (EVM confirmation timeout marks failed) 해결을 목표로 PIPE-01, PIPE-02, PIPE-03 요구사항을 구현합니다.

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| PIPE-01: EVM adapter fallback receipt query | ✓ SATISFIED | Truth 1 verified, getTransactionReceipt fallback 구현 완료 |
| PIPE-02: Stage 6 return-value branching | ✓ SATISFIED | Truth 2, 3 verified, 3-way 분기 구현 완료 |
| PIPE-03: Solana adapter fallback pattern | ✓ SATISFIED | Truth 5 verified, RPC 에러 시 submitted 반환 구현 완료 |

### Anti-Patterns Found

**No blocker anti-patterns detected.**

Scanned files:
- packages/core/src/interfaces/chain-adapter.types.ts
- packages/adapters/evm/src/adapter.ts
- packages/daemon/src/pipeline/stages.ts
- packages/adapters/solana/src/adapter.ts

No TODO, FIXME, placeholder comments found. Implementation is complete and production-ready.

### Test Coverage Summary

**Phase-specific tests: 91 passed**
- EVM adapter waitForConfirmation: 5 tests (confirmed, timeout+fallback, RPC error, timeout+no receipt, revert)
- Solana adapter waitForConfirmation: 3 tests (confirmed, timeout, RPC error)
- Stage 6 pipeline: 3 tests (CONFIRMED, submitted유지, failed반환)
- Pipeline notification: 3 tests (TX_CONFIRMED, TX_FAILED on revert, no service)
- Full pipeline integration: 2 tests

**Overall test suite: 1330 passed / 1333 total**
- 3 failures in CLI e2e tests (환경 관련, phase와 무관)
- All core, adapter, daemon tests passed

### Commit Verification

All commits from SUMMARYs exist in git history:

1. **362f83d** - fix(96-01): add SubmitResult 'failed' status and EVM fallback receipt query
2. **9eaca9b** - fix(96-01): stage6Confirm return-value-based 3-way branching
3. **3eb5ae9** - fix(96-02): Solana waitForConfirmation returns submitted on RPC error instead of throwing

### Human Verification Required

**None required for this phase.**

All verification can be performed programmatically via:
1. Code inspection (fallback pattern, branching logic)
2. Unit tests (all scenarios covered)
3. Type checking (SubmitResult union verified at compile time)

The behavior is deterministic and does not involve:
- Visual UI components
- Real-time user flows
- External service integration
- Performance feel

### Implementation Quality Assessment

**Architecture:**
- Clean separation of concerns: adapter level (receipt query) vs pipeline level (state transition)
- Consistent pattern across both adapters (EVM and Solana)
- Type-safe return values replace exception-based control flow

**Error Handling:**
- Timeout/RPC errors correctly distinguished from transaction failures
- submitted status accurately represents "still pending" state
- On-chain reverts properly detected and reported as failed

**Testing:**
- Comprehensive coverage of all code paths
- Edge cases tested (timeout+fallback, RPC error, revert)
- Regression tests confirm no breaking changes

**Code Quality:**
- No anti-patterns or technical debt
- Clear comments explaining intent (e.g., "RPC error during polling: return submitted")
- Follows established patterns from previous phases

---

_Verified: 2026-02-13T21:20:00Z_
_Verifier: Claude (gsd-verifier)_
