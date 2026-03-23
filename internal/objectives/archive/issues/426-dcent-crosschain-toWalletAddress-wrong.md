# #426 — DCent 크로스체인 스왑 시 toWalletAddress에 출발 체인 주소가 들어감

- **유형**: BUG
- **심각도**: HIGH
- **영향 시나리오**: defi-15 (DCent Crosschain EVM→Solana)
- **컴포넌트**: `packages/actions/src/providers/dcent-swap/index.ts`, `packages/actions/src/providers/dcent-swap/dex-swap.ts`

## 현상

크로스체인 스왑(예: ETH→Solana USDC) 시 DCent API `get_dex_swap_transaction_data`에 전달되는 `toWalletAddress`가 도착 체인 주소(Solana)가 아닌 **출발 체인 주소(EVM)**로 들어간다.

```json
{
  "fromId": "ETHEREUM",
  "toId": "SPL-TOKEN/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "fromWalletAddress": "0x1EB1C46F511E9EF31550F88fAaB403934b0FA37f",
  "toWalletAddress": "0x1EB1C46F511E9EF31550F88fAaB403934b0FA37f"  ← ❌ EVM 주소
}
```

올바른 요청:
```json
{
  "toWalletAddress": "D4Y4HQHw4s4keSzqT7r6hUwsoDL6NDoYTVZE3mnqAtFA"  ← ✅ Solana 주소
}
```

DCent API가 `fail_internal_error`를 반환한 원인이 이것일 가능성이 높다.

## 원인

1. **DexSwapInputSchema에 `toWalletAddress` 필드 없음** — 사용자가 도착 체인 주소를 전달할 방법이 없음
2. **`index.ts` 188행**: `swapParams`에 `walletAddress: context.walletAddress`만 전달 — `context.walletAddress`는 항상 출발 체인 지갑 주소
3. **`dex-swap.ts` 226행**: `toWalletAddress: params.walletAddress`로 하드코딩 — 출발/도착 구분 없이 같은 주소 사용

## 수정 방향

### 1. DexSwapInputSchema에 `toWalletAddress` 추가

```typescript
const DexSwapInputSchema = z.object({
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  amount: z.string().min(1).optional(),
  // ... 기존 필드 ...
  toWalletAddress: z.string().optional()
    .describe('Destination wallet address for cross-chain swaps. Required when source and destination chains differ.'),
});
```

### 2. `index.ts` resolve에서 `toWalletAddress` 전달

```typescript
const swapParams = {
  // ... 기존 ...
  walletAddress: context.walletAddress,
  toWalletAddress: input.toWalletAddress,  // 크로스체인 시 도착 주소
};
```

### 3. `dex-swap.ts`에서 `toWalletAddress` 분기

```typescript
toWalletAddress: params.toWalletAddress ?? params.walletAddress,
```

크로스체인이 아닌 동일 체인 스왑에서는 `toWalletAddress` 생략 시 `walletAddress`를 사용 (기존 동작 유지).

## 테스트 항목

- [ ] 크로스체인 스왑(EVM→Solana): `toWalletAddress`에 Solana 주소 전달 시 DCent API 정상 응답
- [ ] 동일 체인 스왑(EVM→EVM): `toWalletAddress` 생략 시 `fromWalletAddress`와 동일하게 사용 (기존 호환)
- [ ] `toWalletAddress` 미전달 + 크로스체인 시 적절한 에러 메시지 반환
- [ ] defi-15 UAT 시나리오 PASS
- [ ] DCent API 리포트(`how-to-test/uat-report/260323-dcent-swap-api-issues.md`) 업데이트
