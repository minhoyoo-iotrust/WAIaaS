# #387 — DCent Swap formatAmount() 회귀 — get_quotes/getDexSwapTransactionData에 human amount 전달로 전 프로바이더 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v32.9
- **상태:** FIXED
- **수정일:** 2026-03-18

## 설명

이슈 #371 수정 시 DCent API가 human-readable amount를 기대한다고 가정하여 `formatAmount()` 변환을 추가했으나, 실제 DCent API(`agent-swap.dcentwallet.com`)는 **smallest unit(wei/lamports)** 형식의 amount를 기대한다. 이로 인해 모든 DCent Swap 요청이 `fail_no_available_provider`로 실패한다.

## 근본 원인

1. `dex-swap.ts:73`에서 `getDcentQuotes()` 호출 시:
   ```typescript
   amount: formatAmount(BigInt(params.amount), params.fromDecimals),
   // "2000000000000000" → "0.002" (human-readable)
   ```
2. DCent API에 `amount: "0.002"`, `fromDecimals: 18` 전달
3. DCent API 내부에서 이를 `0.002 * 10^-18` = 극소량으로 해석
4. 모든 프로바이더에서 `fail_invalid_params` 또는 `fail_internal_error` 반환

## 검증 (2026-03-18 직접 테스트)

### smallest unit → SUCCESS
```bash
curl -s -X POST 'https://agent-swap.dcentwallet.com/api/swap/v3/get_quotes' \
  -H 'Content-Type: application/json' \
  -d '{"fromId":"ETHEREUM","toId":"ERC20/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","amount":"2000000000000000","fromDecimals":18,"toDecimals":6}'
```
결과: `status: "success"`, 5개 프로바이더(1inch, Sushi, Uniswap, Rubic, ButterSwap) 견적 반환, bestOrder: 5.307 USDC

### human-readable → FAIL
```bash
curl -s -X POST 'https://agent-swap.dcentwallet.com/api/swap/v3/get_quotes' \
  -H 'Content-Type: application/json' \
  -d '{"fromId":"ETHEREUM","toId":"ERC20/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","amount":"0.002","fromDecimals":18,"toDecimals":6,"fromWalletAddress":"0x1EB1C46F511E9EF31550F88fAaB403934b0FA37f"}'
```
결과: `status: "fail_no_available_provider"`, butter_swap: `fail_invalid_params`, rubic/uniswap/lifi: `fail_internal_error`

## 관련 코드

- `packages/actions/src/providers/dcent-swap/dex-swap.ts:73` — `getDcentQuotes()` amount 전달
- `packages/actions/src/providers/dcent-swap/dex-swap.ts:222` — `getDexSwapTransactionData()` fromAmount 전달
- `packages/actions/src/providers/dcent-swap/auto-router.ts` — 2-hop 라우팅도 동일 패턴 사용

## 수정 방안

`formatAmount()` 호출을 제거하고 smallest unit 그대로 전달:

```typescript
// dex-swap.ts:73 (get_quotes)
amount: params.amount,  // smallest unit 그대로

// dex-swap.ts:222 (getDexSwapTransactionData)
fromAmount: params.amount,  // smallest unit 그대로
```

auto-router.ts에서도 동일 패턴이 있으면 함께 수정.

## 영향 범위

- defi-12 (DCent Swap) UAT 전체 실패 (메인 시나리오 + 12a/12b/12c)
- MCP `action_dcent_swap_dex_swap` / `action_dcent_swap_get_quotes` 도구 전부 실패
- DCent 2-hop auto-router 실패
- 이전 UAT (2026-03-16)에서 "DryRun execution reverted (소액 라우팅 문제)"로 SKIP된 원인

## 테스트 항목

### 단위 테스트

- [ ] `getDcentQuotes()` mock에서 amount가 smallest unit 그대로 전달되는지 검증
- [ ] `executeDexSwap()` mock에서 fromAmount가 smallest unit 그대로 전달되는지 검증
- [ ] ETH(18), USDC(6), WBTC(8) 등 다양한 decimals 토큰에 대해 amount 무변환 검증
- [ ] 2-hop 라우팅에서도 intermediate 스왑 amount가 smallest unit인지 검증

### 통합 테스트

- [ ] `dex_swap?dryRun=true` 호출 후 DCent API 응답 status가 success인지 검증
- [ ] `get_quotes` 액션에서 bestOrder에 1개 이상 프로바이더가 포함되는지 검증
