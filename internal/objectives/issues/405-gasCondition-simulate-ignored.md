# 405 — simulate API에서 gasCondition 파라미터 무시됨

- **유형:** BUG
- **심각도:** MEDIUM
- **발견일:** 2026-03-19
- **발견 경로:** Agent UAT advanced-03 (가스 조건부 실행)
- **상태:** OPEN

## 증상

`POST /v1/transactions/simulate`에 `gasCondition.maxGasPrice`를 설정해도 응답에 반영되지 않는다.

- 현재 가스 가격 대비 50% 수준의 낮은 `maxGasPrice`를 설정해도 `success: true`가 반환됨
- 높은 `maxGasPrice`를 설정한 경우와 응답이 동일함
- 가스 조건 미충족 시 `GAS_CONDITION_NOT_MET` 또는 대기 상태가 반환되어야 하나 정상 simulate 결과만 반환

## 재현 절차

```bash
curl -s -X POST http://localhost:3100/v1/transactions/simulate \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<WALLET_ID>",
    "type": "TRANSFER",
    "to": "<ADDRESS>",
    "amount": "1000000000000000",
    "network": "ethereum-mainnet",
    "gasCondition": { "maxGasPrice": "80000000" }
  }'
```

## 근본 원인

**gasCondition은 send 파이프라인에서만 처리되고, dry-run(simulate) 파이프라인에서는 완전히 누락됨.**

| 파일 | 위치 | 상태 |
|------|------|------|
| `packages/core/src/schemas/transaction.schema.ts:62-63` | `GasConditionSchema` 정의 + 7개 요청 타입에 포함 | OK — 스키마에 정의됨 |
| `packages/daemon/src/api/routes/transactions.ts:680-795` | simulate 라우트 핸들러 | OK — 요청 수신 |
| `packages/daemon/src/pipeline/dry-run.ts:95-429` | `executeDryRun()` 함수 | **문제** — gasCondition 처리 코드 없음 |
| `packages/daemon/src/pipeline/stage3-policy.ts:312-452` | `stageGasCondition()` 함수 | OK — send 파이프라인에서만 호출됨 |

### 상세 분석

1. **Zod 스키마** (`transaction.schema.ts:62-63`): `gasConditionField`가 7개 트랜잭션 타입 모두에 `.optional()`로 포함되어 있어 요청 시 파싱은 성공함
2. **send 파이프라인** (`stage3-policy.ts:312-452`): `stageGasCondition()`이 gasCondition을 읽고, Admin Settings의 `gas_condition.enabled` 확인 후, 조건 미충족 시 `PIPELINE_HALTED`를 throw하여 실행을 지연시킴
3. **dry-run 파이프라인** (`dry-run.ts:95-429`): `executeDryRun()`은 요청을 파싱하고 정책 평가 및 시뮬레이션을 수행하지만, **gasCondition 필드를 읽거나 평가하는 코드가 전혀 없음**

결과적으로 gasCondition은 요청에서 수신되지만 dry-run에서 무시되어 항상 `success: true`가 반환됨.

## 수정 방향

`executeDryRun()`에 gasCondition 평가 로직 추가:
1. `request.gasCondition`이 존재하면 현재 가스 가격을 RPC에서 조회
2. `maxGasPrice` < 현재 가스 가격이면 응답에 `warnings` 또는 `gasCondition.met: false` 플래그 추가
3. `stageGasCondition()`의 로직을 재사용하거나 공통 유틸로 추출

## 테스트 항목

- [ ] simulate 요청에 `gasCondition.maxGasPrice` < 현재 가스 → 미충족 경고/플래그 반환
- [ ] simulate 요청에 `gasCondition.maxGasPrice` >= 현재 가스 → 정상 응답 (met: true)
- [ ] `gasCondition` 없는 simulate은 기존 동작과 동일 (회귀 없음)
- [ ] Admin Settings `gas_condition.enabled=false`일 때 gasCondition 무시 확인
