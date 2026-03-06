# #260 — 스테이킹 포지션이 Admin UI에 표시되지 않음 (CONTRACT_CALL amount NULL)

- **유형:** BUG
- **심각도:** HIGH
- **상태:** OPEN
- **발견일:** 2026-03-06
- **마일스톤:** —

## 증상

Admin UI 지갑 상세 > Staking 탭에서 "No staking positions" 표시. Lido ETH 스테이킹 트랜잭션이 CONFIRMED 상태임에도 포지션이 나타나지 않음.

## 근본 원인

`CONTRACT_CALL` 타입 트랜잭션의 `amount` 컬럼이 DB에 NULL로 저장됨.

### 원인 경로

1. **Stage 1 (`stages.ts:403`)**: `amount` 필드를 `'amount' in req`로 추출하지만, `CONTRACT_CALL` 요청은 `amount` 대신 `value` 필드에 ETH 값을 저장함
2. **DB INSERT (`stages.ts:417`)**: `amount: amount ?? null` → NULL 저장
3. **Staking 조회 (`staking.ts:110`, `admin.ts:2036`)**: `if (!row.amount) continue;` → NULL이므로 건너뜀
4. **결과**: `totalStaked = 0n` → 포지션 미표시

### DB 증거

```sql
-- 해당 트랜잭션
SELECT id, amount, metadata FROM transactions WHERE id = '019cc36e-...';
-- amount = NULL
-- metadata.originalRequest.value = "5000000000000000"
```

모든 `CONTRACT_CALL` 타입 트랜잭션이 동일하게 `amount = NULL`로 저장됨.

## 영향 범위

| 파일 | 위치 | 영향 |
|------|------|------|
| `packages/daemon/src/pipeline/stages.ts` | L403 | CONTRACT_CALL의 `value` 필드를 `amount`로 매핑하지 않음 (근본 원인) |
| `packages/daemon/src/api/routes/staking.ts` | L110 | `amount` NULL → 스테이킹 잔액 합산 불가 (session API) |
| `packages/daemon/src/api/routes/admin.ts` | L2036 | `amount` NULL → 스테이킹 잔액 합산 불가 (admin API) |

### 부수 영향

- Admin UI 트랜잭션 목록에서 CONTRACT_CALL 금액이 빈 값으로 표시
- 정책 엔진 `SPENDING_LIMIT` 평가 시 CONTRACT_CALL의 ETH value가 지출 누적에 미반영될 가능성 (별도 확인 필요)

## 수정 방안

### 방안 A: Stage 1 amount 추출 보완 (권장)

`stages.ts:403`에서 CONTRACT_CALL의 `value` 필드도 `amount`로 매핑:

```typescript
// Before
const amount = 'amount' in req ? (req as { amount?: string }).amount : undefined;

// After
let amount = 'amount' in req ? (req as { amount?: string }).amount : undefined;
if (!amount && 'value' in req) {
  amount = (req as { value?: string }).value;
}
```

### 방안 B: Staking 쿼리에서 metadata 파싱 폴백

`aggregateStakingBalance`에서 `amount`가 NULL일 때 `metadata.originalRequest.value`에서 추출:

```typescript
if (!row.amount && row.metadata) {
  const meta = JSON.parse(row.metadata);
  const value = meta.originalRequest?.value;
  if (value) { /* use value */ }
}
```

### 권장: A + B 동시 적용

- A: 향후 생성 트랜잭션의 amount 정상 저장
- B: 기존 NULL 데이터에 대한 하위 호환

## 기존 데이터 보정

기존 CONTRACT_CALL 트랜잭션의 amount를 metadata에서 복원하는 마이그레이션 필요:

```sql
UPDATE transactions
SET amount = json_extract(metadata, '$.originalRequest.value')
WHERE type = 'CONTRACT_CALL'
  AND amount IS NULL
  AND json_extract(metadata, '$.originalRequest.value') IS NOT NULL;
```

## 테스트 항목

1. **Unit**: `stages.ts` — CONTRACT_CALL 요청 시 `value` 필드가 DB `amount`에 저장되는지 검증
2. **Unit**: `staking.ts` / `admin.ts` — `amount` NULL + metadata에 value 존재 시 폴백 동작 검증
3. **Integration**: Lido stake 액션 실행 후 GET /v1/wallet/staking 포지션 반환 검증
4. **Integration**: GET /v1/admin/wallets/:id/staking 포지션 반환 검증
5. **Regression**: TRANSFER/TOKEN_TRANSFER 타입의 amount 저장이 영향받지 않음을 검증
