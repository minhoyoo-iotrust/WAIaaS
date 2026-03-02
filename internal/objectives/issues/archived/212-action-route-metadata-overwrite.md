# 212: 액션 라우트가 stage1Validate의 originalRequest 메타데이터를 덮어씀

- **유형:** BUG
- **심각도:** CRITICAL
- **마일스톤:** v29.4
- **상태:** FIXED

## 현상

Jito 스테이킹 등 Action Provider를 통한 트랜잭션이 DELAY 큐를 거치면, 재진입 시 원본 `CONTRACT_CALL` 요청이 유실되어 0 SOL System Program Transfer로 변질됨.

온체인 결과:
- TX Error: None (성공)
- Fee: 5,000 lamports (가스비만 차감)
- 실제 Stake Pool 프로그램 호출 없음 — System Program만 invoke
- JitoSOL 수령 없음

## 근본 원인

`#208` 수정에서 `stage1Validate`(stages.ts)에 `{ originalRequest: req }` 저장을 추가했으나,
`actions.ts:372-377`의 GAP-2 fix가 메타데이터를 `{ provider, action }`으로 **완전 대체(overwrite)** 하는 코드를 수정하지 않음.

### 데이터 흐름

```
stage1Validate() → metadata = { originalRequest: { type:'CONTRACT_CALL', programId, instructionData, accounts, ... } }
                              ↓
actions.ts L374  → metadata = { provider: 'jito_staking', action: 'stake' }   ← originalRequest 유실!
                              ↓
DELAY 큐 만료 → daemon.ts executeFromStage4()
             → meta.originalRequest === undefined
             → fallback: { to: tx.toAddress, amount: '0', memo: undefined }
             → TRANSFER (0 SOL) 빌드 → System Program만 호출
```

### 문제 코드

```typescript
// packages/daemon/src/api/routes/actions.ts:370-377
// GAP-2 fix: Persist action provider metadata for staking position queries
await deps.db
  .update(transactions)
  .set({
    metadata: JSON.stringify({ provider, action }),  // ← 기존 metadata 완전 대체
  })
  .where(eq(transactions.id, ctx.txId));
```

## 영향 범위

- **DELAY 큐를 거치는 모든 Action Provider 트랜잭션** (Jito, Lido, Aave, LI.FI, 0x, Jupiter 등)
- `defaultTier: 'DELAY'`인 액션: jito_staking/stake, jito_staking/unstake, lido_staking/stake, lido_staking/unstake, aave_lending/supply, aave_lending/borrow 등
- AUTO 티어로 평가되는 경우(CONTRACT_WHITELIST + provider-trust bypass)는 DELAY 큐를 거치지 않으므로 영향 없음

## 수정 방안

기존 메타데이터를 읽어서 머지(merge):

```typescript
// 기존 metadata를 읽어 originalRequest 보존
const existingTx = await deps.db
  .select({ metadata: transactions.metadata })
  .from(transactions)
  .where(eq(transactions.id, ctx.txId))
  .get();
const existingMeta = existingTx?.metadata ? JSON.parse(existingTx.metadata) : {};

await deps.db
  .update(transactions)
  .set({
    metadata: JSON.stringify({ ...existingMeta, provider, action }),
  })
  .where(eq(transactions.id, ctx.txId));
```

## 테스트 항목

1. **단위 테스트**: `actions.ts` 라우트에서 stage1Validate 후 metadata UPDATE 시 `originalRequest`가 보존되는지 검증
2. **통합 테스트**: DELAY 티어 액션(jito_staking/stake)이 DELAY 큐를 거쳐 재진입 후 올바른 CONTRACT_CALL 트랜잭션을 빌드하는지 검증
3. **회귀 테스트**: `pipeline-reentry.test.ts`에 action route 경유 DELAY 재진입 케이스 추가
4. **기존 테스트**: `staking.ts` 라우트의 `metadata LIKE '%providerKey%'` 쿼리가 머지된 메타데이터에서도 정상 작동하는지 검증
