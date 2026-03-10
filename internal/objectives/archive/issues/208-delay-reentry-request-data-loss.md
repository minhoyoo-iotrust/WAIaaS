# #208 — DELAY/GAS_WAITING 재진입 시 원본 요청 데이터 손실로 트랜잭션 변질

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v29.3
- **상태:** FIXED
- **발견일:** 2026-02-27

## 현상

DELAY 티어 또는 GAS_WAITING 상태에서 대기 후 실행되는 트랜잭션이 원본 요청과 전혀 다른 트랜잭션으로 변질되어 온체인에 제출된다.

**실제 사례 (Jito Staking):**
- 요청: Jito DepositSol (SPL Stake Pool 프로그램, 10개 어카운트, 9바이트 인스트럭션 데이터)
- 실제 온체인 실행: **System Program SOL Transfer 0 lamports** → 스테이킹 미실행
- 트랜잭션 ID: `019c9f19-fa3c-73aa-ab20-302a319b4e61`
- 온체인 Tx: `5h7ABDwk3WbdvZtbUZBgZDRSzfpDTNbbabaygTubG4FdruY3Ra6Ru7uwmek5Ey9Xgnzb3EeFWV6TNCFy5Dy9BNP7`
- 데몬 상태: CONFIRMED (온체인 0-lamport 전송이 성공했으므로)

## 원인

`daemon.ts`의 `executeFromStage5()` (1765행) 및 `executeFromStage4()` (1667행)에서 파이프라인 재진입 시 `PipelineContext.request`를 최소 필드만으로 구성한다:

```typescript
request: {
  to: tx.toAddress ?? '',     // "Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb"
  amount: tx.amount ?? '0',   // "0" (CONTRACT_CALL은 amount가 NULL)
  memo: undefined,
}
```

이 객체에는 `type`, `programId`, `instructionData`, `accounts`, `calldata`, `abi`, `token`, `spender`, `instructions` 등 트랜잭션 타입별 필수 필드가 **전부 누락**된다.

`stages.ts:821`의 `buildByType()`가 `type` 필드 부재 시 `'TRANSFER'`로 폴백하므로, 모든 비-TRANSFER 트랜잭션이 **0-lamport 단순 전송**으로 변질된다:

```typescript
const type = ('type' in request && request.type) || 'TRANSFER';
// → type 없으면 TRANSFER로 폴백 → adapter.buildTransaction() 호출
```

## 영향 범위

DELAY 또는 GAS_WAITING 티어를 거치는 **모든 비-TRANSFER 타입 트랜잭션**이 영향받는다:

| 트랜잭션 타입 | 손실 필드 | 변질 결과 |
|---|---|---|
| CONTRACT_CALL | type, programId, instructionData, accounts, value, calldata, abi | 0-lamport SOL 전송 |
| TOKEN_TRANSFER | type, token | 0-lamport SOL 전송 (토큰 전송 미실행) |
| APPROVE | type, spender, token | 0-lamport SOL 전송 (승인 미실행) |
| BATCH | type, instructions | 0-lamport SOL 전송 (배치 미실행) |
| SIGN | type, message | 0-lamport SOL 전송 |
| TRANSFER | (우연히 기본값과 일치) | amount 손실 가능 (NULL → "0") |

**자금 손실 위험:** EVM 체인에서 value가 있는 CONTRACT_CALL의 경우, 컨트랙트 호출 대신 단순 ETH 전송이 될 수 있어 자금이 컨트랙트 주소로 전송되고 회수 불가능할 수 있다.

## 수정 방안

### 방안 A: DB에 원본 요청 직렬화 저장 (권장)

Stage 1에서 원본 `request` 전체를 JSON으로 직렬화하여 `transactions.metadata` 또는 신규 `original_request` 컬럼에 저장. 재진입 시 역직렬화하여 완전한 request 복원.

```typescript
// Stage 1: 저장
metadata: JSON.stringify({ ...existingMeta, originalRequest: request })

// executeFromStage5(): 복원
const meta = JSON.parse(tx.metadata ?? '{}');
const request = meta.originalRequest ?? { to: tx.toAddress ?? '', amount: tx.amount ?? '0' };
```

### 방안 B: DB 컬럼에서 타입별 필드 재구성

`transactions` 테이블의 기존 컬럼(`type`, `contract_address`, `method_signature`, `token_mint`, `spender_address` 등)에서 request를 재구성. 단, `instructionData`, `accounts`, `abi` 등은 현재 DB에 저장되지 않으므로 불완전.

### 방안 C: A + B 하이브리드

신규 트랜잭션은 방안 A 적용, 기존 미완료 트랜잭션은 방안 B로 최선 노력 복원.

## 관련 파일

- `packages/daemon/src/lifecycle/daemon.ts` — `executeFromStage4()` (1667행), `executeFromStage5()` (1765행)
- `packages/daemon/src/pipeline/stages.ts` — `buildByType()` (816행), `stage5Execute()` (950행)
- `packages/daemon/src/pipeline/stages.ts` — `stage1Validate()` — 원본 request 저장 로직 추가 필요

## 관련 이슈

- #207: 동일 재진입 경로의 `notificationService` 누락 (동시 수정 가능)

## 테스트 항목

### 재진입 요청 복원 검증 (타입별)

1. **CONTRACT_CALL 재진입 테스트**: DELAY 티어 CONTRACT_CALL이 `executeFromStage5()`를 통해 실행될 때, `programId`, `instructionData`, `accounts` 가 원본과 동일하게 복원되어 `adapter.buildContractCall()`이 호출되는지 검증
2. **TOKEN_TRANSFER 재진입 테스트**: DELAY 티어 TOKEN_TRANSFER가 재진입 시 `token` 필드가 복원되어 `adapter.buildTokenTransfer()`가 호출되는지 검증
3. **APPROVE 재진입 테스트**: DELAY 티어 APPROVE가 재진입 시 `spender`, `token`, `amount` 가 복원되어 `adapter.buildApprove()`가 호출되는지 검증
4. **BATCH 재진입 테스트**: DELAY 티어 BATCH가 재진입 시 `instructions` 배열이 완전히 복원되어 `adapter.buildBatch()`가 호출되는지 검증
5. **SIGN 재진입 테스트**: DELAY 티어 SIGN이 재진입 시 `message` 필드가 복원되는지 검증
6. **GAS_WAITING 재진입 테스트**: GAS_WAITING 상태에서 조건 충족 후 `executeFromStage4()`를 통해 재진입 시에도 동일하게 원본 request가 복원되는지 검증

### 원본 요청 저장 검증

7. **Stage 1 직렬화 테스트**: 모든 7가지 트랜잭션 타입(TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH, SIGN, X402_PAYMENT)이 Stage 1에서 원본 request가 DB에 정상 저장되는지 검증
8. **직렬화 무결성 테스트**: bigint 값, base64 인코딩 데이터, 중첩 객체(accounts[], instructions[]) 등이 직렬화/역직렬화 과정에서 손실 없이 보존되는지 검증

### 방어적 검증

9. **타입 폴백 방지 테스트**: `buildByType()`에 `type` 필드가 없는 request가 전달될 때 TRANSFER로 폴백하지 않고 에러를 발생시키는지 검증
10. **amount NULL 안전성 테스트**: DB에서 `amount`가 NULL인 TRANSFER가 재진입될 때 "0" 대신 에러를 발생시키거나 원본 금액을 복원하는지 검증
11. **DELAY → CONTRACT_CALL E2E 테스트**: 정책에 의해 DELAY 티어가 적용된 CONTRACT_CALL이 대기 후 실행될 때, 온체인 시뮬레이션이 원본 컨트랙트 호출과 동일한 결과를 보이는지 E2E 검증
12. **GAS_WAITING → CONTRACT_CALL E2E 테스트**: 가스 조건 대기 후 CONTRACT_CALL이 실행될 때 동일 E2E 검증
