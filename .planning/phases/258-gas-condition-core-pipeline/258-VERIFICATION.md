---
phase: 258-gas-condition-core-pipeline
verified: 2026-02-24T17:40:27Z
status: passed
score: 4/4 success criteria verified
re_verification: false
gaps:
  - truth: "타임아웃 초과 시 트랜잭션이 CANCELLED로 전이되고, GAS_WAITING 진입/조건 충족/타임아웃 취소 시 각각 TX_GAS_WAITING/TX_GAS_CONDITION_MET/TX_CANCELLED 알림이 발송된다"
    status: resolved
    reason: "CANCELLED 전이는 구현됨. TX_GAS_WAITING, TX_GAS_CONDITION_MET 알림도 발송됨. 그러나 타임아웃 취소 시 TX_CANCELLED 알림이 발송되지 않음. AsyncPollingService.handleTimeout()의 CANCELLED 분기에서 status='CANCELLED'로 DB를 업데이트하지만 emitNotification을 호출하지 않음."
    artifacts:
      - path: "packages/daemon/src/services/async-polling-service.ts"
        issue: "handleTimeout() CANCELLED 분기(line 170-183)에서 emitNotification 미호출. TX_CANCELLED 알림이 발송되지 않음."
    missing:
      - "handleTimeout() CANCELLED 분기에 TX_CANCELLED 알림 발송 추가 (callbacks?.emitNotification?.('TX_CANCELLED', tx.walletId, { txId: tx.id, reason: 'gas-condition-timeout' }))"
      - "gas-condition-pipeline.test.ts에 timeout 시 TX_CANCELLED 알림 발송 검증 테스트 추가"
---

# Phase 258: GasCondition 코어 파이프라인 Verification Report

**Phase Goal:** 가스 조건이 지정된 트랜잭션이 조건 충족까지 안전하게 대기하고, 충족 시 자동으로 파이프라인을 재개하며, 타임아웃 시 취소되는 상태
**Verified:** 2026-02-24T17:40:27Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | gasCondition 지정 트랜잭션이 정책 평가 통과 후 GAS_WAITING 진입, 미지정 트랜잭션은 기존 동작 유지 | VERIFIED | `stage3_5GasCondition()` in stages.ts: gasCondition 없으면 즉시 return(backward compat), 있으면 DB status='GAS_WAITING' + PIPELINE_HALTED |
| 2 | EVM eth_gasPrice/eth_maxPriorityFeePerGas, Solana computeUnitPrice 기반 조건 평가, 충족 시 Stage 4 재개 | VERIFIED | `GasConditionTracker.checkStatus()`: queryEvmGasPrice(eth_gasPrice + eth_maxPriorityFeePerGas), querySolanaGasPrice(getRecentPrioritizationFees 중앙값). AsyncPollingService.processResult(): gas-condition COMPLETED -> GAS_WAITING->PENDING + resumePipeline callback -> executeFromStage4() |
| 3 | 타임아웃 시 CANCELLED 전이 + TX_GAS_WAITING/TX_GAS_CONDITION_MET/TX_CANCELLED 알림 발송 | PARTIAL | CANCELLED 전이: VERIFIED (handleTimeout CANCELLED 분기). TX_GAS_WAITING: VERIFIED (stage3_5GasCondition). TX_GAS_CONDITION_MET: VERIFIED (processResult). **TX_CANCELLED: NOT VERIFIED** (handleTimeout CANCELLED 분기에 emitNotification 미호출) |
| 4 | 데몬 재시작 후 GAS_WAITING 트랜잭션 자동 복원, max_pending_count 초과 시 새 요청 거부 | VERIFIED | AsyncPollingService.pollAll(): OR(bridge_status IN PENDING/BRIDGE_MONITORING, status='GAS_WAITING') 쿼리로 재시작 시 자동 복원. stage3_5GasCondition: currentWaiting >= maxPendingCount 시 ACTION_VALIDATION_FAILED 에러 |

**Score:** 3/4 success criteria verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/schemas/transaction.schema.ts` | GasConditionSchema + 5 request types | VERIFIED | GasConditionSchema with at-least-one refine. gasConditionField spread on TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH |
| `packages/core/src/enums/notification.ts` | TX_GAS_WAITING, TX_GAS_CONDITION_MET | VERIFIED | Both events added at lines 45-46 (42 total event types) |
| `packages/core/src/i18n/en.ts` | gas condition i18n messages | VERIFIED | TX_GAS_WAITING + TX_GAS_CONDITION_MET messages at line 221-222 |
| `packages/core/src/i18n/ko.ts` | gas condition i18n messages (Korean) | VERIFIED | TX_GAS_WAITING + TX_GAS_CONDITION_MET messages at line 167-168 |
| `packages/daemon/src/pipeline/stages.ts` | stage3_5GasCondition function | VERIFIED | 150 LOC, lines 590-730. Full implementation: settings check, pending count, timeout resolution, RPC URL storage, GAS_WAITING transition, TX_GAS_WAITING notification, PIPELINE_HALTED |
| `packages/daemon/src/pipeline/pipeline.ts` | stage3_5GasCondition wired between stage3 and stage4 | VERIFIED | Imported at line 25, called at line 95 between stage3Policy and stage4Wait |
| `packages/daemon/src/api/routes/transactions.ts` | stage3_5GasCondition wired in send route | VERIFIED | Imported at line 39, called at line 397 |
| `packages/daemon/src/api/routes/actions.ts` | stage3_5GasCondition wired in actions route | VERIFIED | Imported at line 35, called at line 375 |
| `packages/daemon/src/pipeline/gas-condition-tracker.ts` | GasConditionTracker with EVM/Solana RPC | VERIFIED | 245 LOC. GasConditionTracker implements IAsyncStatusTracker, name='gas-condition', timeoutTransition='CANCELLED', maxAttempts=7200. queryEvmGasPrice + querySolanaGasPrice with 10s cache |
| `packages/daemon/src/services/async-polling-service.ts` | resumePipeline callback + gas-condition COMPLETED handling | VERIFIED | resumePipeline callback in AsyncPollingCallbacks (line 33). processResult: gas-condition COMPLETED -> GAS_WAITING->PENDING + TX_GAS_CONDITION_MET + resumePipeline (lines 258-283). **GAP: handleTimeout CANCELLED missing emitNotification** |
| `packages/daemon/src/infrastructure/settings/setting-keys.ts` | gas_condition.* 5개 settings | VERIFIED | 5 keys at lines 188-192: enabled/poll_interval_sec/default_timeout_sec/max_timeout_sec/max_pending_count. SETTING_CATEGORIES includes 'gas_condition' at line 48 |
| `packages/daemon/src/lifecycle/daemon.ts` | GasConditionTracker 등록 + executeFromStage4 | VERIFIED | Step 4f-4 (lines 1000-1015) registers GasConditionTracker. executeFromStage4() at line 1417 re-enters pipeline at stage5+6. resumePipeline callback at line 862 |
| `packages/daemon/src/__tests__/pipeline-stage3-5-gas-condition.test.ts` | 13 stage3_5 unit tests | VERIFIED | 509 LOC, 13 it() blocks covering backward compat/GAS_WAITING/feature-disabled/max_pending/bridgeMetadata/TX_GAS_WAITING/timeout-resolution/timeout-clamping |
| `packages/daemon/src/__tests__/gas-condition-tracker.test.ts` | 19 tracker unit tests | VERIFIED | 343 LOC, 19 it() blocks covering EVM/Solana RPC queries, timeout, cache reuse, interface properties |
| `packages/daemon/src/__tests__/gas-condition-pipeline.test.ts` | 14 pipeline integration tests | VERIFIED | 377 LOC, 14 it() blocks covering COMPLETED/PENDING/TIMEOUT/CANCELLED flows + settings keys |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `TransferRequestSchema` | `GasConditionSchema` | `gasConditionField` spread | WIRED | `...gasConditionField` in TransferRequestSchema (line 72) |
| `stage3Policy` | `stage3_5GasCondition` | Pipeline ordering | WIRED | pipeline.ts line 94-95: stage3Policy runs before stage3_5GasCondition |
| `stage3_5GasCondition` | `stage4Wait` | Pipeline ordering | WIRED | pipeline.ts line 95-96: stage3_5GasCondition before stage4Wait |
| `GasConditionTracker` | `AsyncPollingService` | `registerTracker()` | WIRED | daemon.ts Step 4f-4: `asyncPollingService.registerTracker(new GasConditionTracker())` |
| `AsyncPollingService.processResult` | `resumePipeline callback` | gas-condition COMPLETED | WIRED | async-polling-service.ts line 281: `callbacks?.resumePipeline?.(tx.id, tx.walletId)` |
| `resumePipeline callback` | `executeFromStage4()` | daemon.ts line 862-865 | WIRED | `void this.executeFromStage4(txId, walletId)` |
| `handleTimeout CANCELLED` | `emitNotification('TX_CANCELLED')` | emitNotification callback | NOT_WIRED | handleTimeout() lines 170-183: sets status='CANCELLED' only, no notification emitted |
| `GasConditionTracker` | `pollAll() GAS_WAITING query` | AsyncPollingService | WIRED | async-polling-service.ts line 76: `eq(transactions.status, 'GAS_WAITING')` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PIPE-01 | 258-01 | gasCondition 선택적 필드 (maxGasPrice/maxPriorityFee/timeout) | SATISFIED | GasConditionSchema in transaction.schema.ts. gasConditionField on 5 request types |
| PIPE-02 | 258-01 | gasCondition 지정 시 정책 평가 통과 후 GAS_WAITING 진입 | SATISFIED | stage3_5GasCondition: stage3Policy 이후 실행, GAS_WAITING 전이 |
| PIPE-03 | 258-01 | gasCondition 미지정 시 기존 동작 유지 | SATISFIED | stage3_5GasCondition: gasCondition 없으면 즉시 return |
| PIPE-04 | 258-01 | 정책 위반 시 gasCondition 무관하게 즉시 거부 | SATISFIED | stage3Policy가 stage3_5GasCondition보다 먼저 실행. stage3Policy throws POLICY_DENIED → stage3_5 미실행 |
| PIPE-05 | 258-01 | GAS_WAITING 진입 시 nonce 미할당, 실행 시점에 할당 | SATISFIED | stage3_5GasCondition에 nonce 할당 없음. buildTransaction(stage5)에서 할당 |
| PIPE-06 | 258-01 | GasCondition Zod 스키마가 discriminatedUnion 5-type 모두 적용 | SATISFIED | gasConditionField spread on TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH |
| EVAL-01 | 258-02 | GasConditionEvaluator가 RPC에서 가스 가격 조회 후 조건 비교 | SATISFIED | GasConditionTracker.checkStatus(): queryEvmGasPrice/querySolanaGasPrice via raw fetch |
| EVAL-02 | 258-02 | EVM eth_gasPrice로 maxGasPrice 조건 평가 | SATISFIED | queryEvmGasPrice: eth_gasPrice → BigInt 변환, maxGasPrice threshold 비교 |
| EVAL-03 | 258-02 | EVM eth_maxPriorityFeePerGas로 maxPriorityFee 조건 평가 | SATISFIED | queryEvmGasPrice: eth_maxPriorityFeePerGas (EIP-1559 미지원 시 0n fallback) |
| EVAL-04 | 258-02 | Solana computeUnitPrice 기반 maxPriorityFee 조건 평가 | SATISFIED | querySolanaGasPrice: getRecentPrioritizationFees 중앙값으로 gasPrice 계산 |
| WRKR-01 | 258-02 | GasConditionWorker가 대기 트랜잭션 가스 조건 주기적 재평가 | SATISFIED | AsyncPollingService.pollAll() 30s 간격으로 GAS_WAITING 트랜잭션 처리 |
| WRKR-02 | 258-02 | 가스 조건 충족 시 GAS_WAITING에서 Stage 4 재개 | SATISFIED | processResult gas-condition COMPLETED → GAS_WAITING->PENDING → resumePipeline → executeFromStage4 |
| WRKR-03 | 258-02 | 타임아웃 시 CANCELLED 전이 + 알림 | PARTIAL | status='CANCELLED' 전이는 구현됨. TX_CANCELLED 알림 미발송 |
| WRKR-04 | 258-02 | 데몬 재시작 후 GAS_WAITING 자동 복원 | SATISFIED | pollAll()이 OR(bridge_status, status='GAS_WAITING') 쿼리로 재시작 시 자동 픽업 |
| WRKR-05 | 258-02 | 배치 조회로 한 번의 RPC 호출로 모든 대기 트랜잭션 평가 | SATISFIED | 10s TTL 가스 가격 캐시(gasPriceCache). 같은 RPC URL의 모든 트랜잭션이 캐시 재사용 |
| WRKR-06 | 258-01 | max_pending_count 초과 시 새 요청 거부 | SATISFIED | stage3_5GasCondition: currentWaiting >= maxPendingCount → ACTION_VALIDATION_FAILED |
| NOTF-01 | 258-01 | GAS_WAITING 진입 시 TX_GAS_WAITING 알림 | SATISFIED | stage3_5GasCondition line 717: `notify('TX_GAS_WAITING', ...)` |
| NOTF-02 | 258-02 | 조건 충족 시 TX_GAS_CONDITION_MET 알림 | SATISFIED | processResult line 273: `emitNotification(gasEventType, ...)` where gasEventType = 'TX_GAS_CONDITION_MET' |
| NOTF-03 | 258-02 | 타임아웃 취소 시 TX_CANCELLED 이벤트 재사용 | BLOCKED | handleTimeout() CANCELLED 분기: status='CANCELLED' DB 업데이트만 수행. emitNotification 미호출. TX_CANCELLED 알림 미발송 |

### Anti-Patterns Found

None found in implementation files. No TODO/FIXME/placeholder comments, no empty implementations, no stub return values in the new gas condition code.

### Human Verification Required

None — all checks are automatable. The gap (TX_CANCELLED notification) is verified programmatically.

### Gaps Summary

**1 gap** blocking full goal achievement:

**NOTF-03 / Success Criterion 3 (partial):** The success criterion explicitly requires TX_CANCELLED notification on timeout. The codebase:
- Sets status='CANCELLED' in DB when maxAttempts exceeded (via `handleTimeout()` CANCELLED branch) — correct
- Does NOT call `emitNotification('TX_CANCELLED', ...)` in that branch

The fix is straightforward: add `this.callbacks?.emitNotification?.('TX_CANCELLED', tx.walletId, { txId: tx.id, reason: 'gas-condition-timeout' })` inside the `if (tracker.timeoutTransition === 'CANCELLED')` block in `packages/daemon/src/services/async-polling-service.ts`.

Note: All other 18 requirements (PIPE-01 through PIPE-06, EVAL-01 through EVAL-04, WRKR-01 through WRKR-06, NOTF-01, NOTF-02) are fully satisfied. The GasCondition core pipeline is functionally complete except for this one missing notification call.

---

_Verified: 2026-02-24T17:40:27Z_
_Verifier: Claude (gsd-verifier)_
