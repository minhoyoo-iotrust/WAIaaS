# #337 TX_CONFIRMED 알림에서 {amount} 플레이스홀더 미치환

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** OPEN
- **발견일:** 2026-03-12

## 증상

텔레그램(및 기타 알림 채널)에서 `TX_CONFIRMED` 알림 메시지에 `{amount}`가 리터럴 텍스트로 표시됨.

```
거래 019cd2be-2874-77c9-a0eb-115c69edeef9가 확인되었습니다. 금액: {amount}
```

## 원인 분석

i18n 템플릿(`ko.ts:180`, `en.ts:234`)의 TX_CONFIRMED에 `{amount}` 플레이스홀더가 사용되지만, 일부 notify 호출 경로에서 `amount` 변수를 전달하지 않음.

### 영향받는 경로 (2곳)

**1. Background Confirmation Worker (`daemon.ts:1712`)**

`submitted-tx-confirm` 워커가 SUBMITTED 상태에서 확인된 트랜잭션을 알릴 때 `amount`, `to`, `display_amount` 미전달.

```typescript
// daemon.ts:1712
void this.notificationService?.notify('TX_CONFIRMED', tx.walletId, {
  txId: tx.id,
  txHash: tx.txHash,
  network: tx.network,
}, { txId: tx.id });
```

또한 `select` 쿼리(`daemon.ts:1662-1668`)에서 `amount`, `toAddress`, `type` 컬럼을 가져오지 않음.

**2. API Direct Result 경로 (`stages.ts:1810`)**

ApiDirectResult(Hyperliquid 등 off-chain DEX) 확인 시 `amount`, `to`, `display_amount` 미전달.

```typescript
// stages.ts:1810
void ctx.notificationService?.notify('TX_CONFIRMED', ctx.walletId, {
  txId: ctx.txId,
  provider: result.provider,
  action: result.action,
  externalId: result.externalId,
  network: ctx.resolvedNetwork,
}, { txId: ctx.txId });
```

### 정상 경로 (3곳)

| 경로 | 파일:줄 | 상태 |
|------|---------|------|
| Smart Account Stage 5 | `stages.ts:1526` | OK (`amount: reqAmount`) |
| EOA Stage 6 | `stages.ts:2158` | OK (`amount: reqAmount`) |
| x402 Payment | `x402.ts:533` | OK (`amount: selected.amount`) |

### 안전장치 부재

`message-templates.ts:60-65`에서 `{display_amount}`와 `{type}`은 미치환 시 제거하지만, `{amount}`는 제거하지 않아 리터럴로 노출됨.

## 수정 방안

### 1. `daemon.ts` — Background Confirmation Worker

- SELECT에 `amount`, `toAddress`, `type` 컬럼 추가
- notify 호출에 `amount: tx.amount ?? ''`, `to: tx.toAddress ?? ''` 전달

### 2. `stages.ts:1810` — API Direct 경로

- `formatNotificationAmount(ctx.request, ctx.wallet.chain)` 사용하여 `amount` 전달
- `getRequestTo(ctx.request)` 사용하여 `to` 전달
- `resolveDisplayAmount()` 사용하여 `display_amount` 전달

### 3. `message-templates.ts` — 안전장치 추가

- 미치환 `{amount}` 플레이스홀더도 제거하는 폴백 추가 (다른 optional 변수와 동일 처리)

## 테스트 항목

1. **단위 테스트**: `message-templates.test.ts` — TX_CONFIRMED 템플릿에 amount 미전달 시 `{amount}` 리터럴 미노출 확인
2. **단위 테스트**: `notification-service.test.ts` — background confirm worker 경로에서 amount 포함 여부 검증
3. **단위 테스트**: `pipeline-notification.test.ts` — API Direct 경로 TX_CONFIRMED 알림에 amount 포함 여부 검증
4. **통합 테스트**: 실제 텔레그램 알림에서 금액이 정상 표시되는지 수동 확인
