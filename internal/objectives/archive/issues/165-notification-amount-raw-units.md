# Issue #165: 알림 메시지 금액이 최소 단위(wei/lamports)로 표시

- **유형:** ENHANCEMENT
- **심각도:** HIGH
- **발견 버전:** v28.2
- **상태:** OPEN

## 현상

텔레그램/Ntfy 알림에서 트랜잭션 금액이 raw 블록체인 단위로 표시된다:
- `금액: 1000000000000000000` (wei) → 사용자 기대: `0.001 ETH`
- 토큰 심볼도 표시되지 않음

## 원인

`stages.ts`의 모든 `notify()` 호출에서 `amount` 변수에 `getRequestAmount(ctx.request)`의 raw 값을 그대로 전달한다:

```typescript
void ctx.notificationService?.notify('TX_APPROVAL_REQUIRED', ctx.walletId, {
  amount: getRequestAmount(ctx.request),  // ← raw wei/lamports
  ...
});
```

## 기대 동작

알림 메시지에 사람이 읽을 수 있는 금액 + 토큰 심볼 표시:
- TRANSFER: `0.001 ETH`, `1.5 SOL`
- TOKEN_TRANSFER: `100 USDC`, `0.5 WETH`
- CONTRACT_CALL/APPROVE: 금액이 있으면 포맷, 없으면 생략

## 수정 방안

`stages.ts`에 헬퍼 함수 추가:

```typescript
const NATIVE_DECIMALS: Record<string, number> = { solana: 9, ethereum: 18 };
const NATIVE_SYMBOLS: Record<string, string> = { solana: 'SOL', ethereum: 'ETH' };

function formatNotificationAmount(
  req: SendTransactionRequest | TransactionRequest,
  chain: string,
): string {
  const raw = getRequestAmount(req);
  if (raw === '0') return '0';

  if ('type' in req && req.type === 'TOKEN_TRANSFER') {
    const r = req as TokenTransferRequest;
    const decimals = r.token.decimals;
    const symbol = r.token.symbol ?? r.token.address.slice(0, 8);
    return `${formatAmount(BigInt(raw), decimals)} ${symbol}`;
  }

  // Native transfer
  const decimals = NATIVE_DECIMALS[chain] ?? 18;
  const symbol = NATIVE_SYMBOLS[chain] ?? chain.toUpperCase();
  return `${formatAmount(BigInt(raw), decimals)} ${symbol}`;
}
```

모든 `notify()` 호출의 `amount` 값을 `formatNotificationAmount(ctx.request, ctx.wallet.chain)`으로 교체.

## 기존 인프라

- `formatAmount(bigint, decimals)` — `packages/core/src/utils/format-amount.ts` (이미 존재)
- `NATIVE_DECIMALS` — `resolve-effective-amount-usd.ts`, `database-policy-engine.ts`에 중복 정의 (통합 권장)
- 토큰 심볼/decimals — TOKEN_TRANSFER 요청의 `req.token.symbol`, `req.token.decimals`

## 영향 범위

- `stages.ts`의 notify() 호출 약 12곳
- i18n 템플릿 변경 불필요 (`{amount}` 변수에 포맷된 값이 들어감)

## 테스트 항목

- [ ] TRANSFER 알림에 `0.001 ETH` 형식으로 표시
- [ ] TOKEN_TRANSFER 알림에 `100 USDC` 형식으로 표시
- [ ] amount=0인 경우 `0` 표시
- [ ] CONTRACT_CALL에 value가 있을 때 네이티브 토큰으로 포맷
- [ ] 기존 display_amount (USD 환산)은 영향 없음
