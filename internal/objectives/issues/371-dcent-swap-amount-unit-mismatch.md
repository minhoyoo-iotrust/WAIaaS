# #371 — DCent Swap amount 단위 불일치로 스왑 트랜잭션 revert

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 설명

DCent Swap `dex_swap` 액션 실행 시, DCent Backend API에 전달하는 `amount`/`fromAmount` 값의 단위가 불일치하여 극소량 트랜잭션이 생성되고 execution reverted로 실패한다.

## 근본 원인

1. 사용자가 `amount: "1000000000000000"` (0.001 ETH, wei 단위)를 전달
2. `resolveProviderHumanAmount()`는 `humanAmount` 필드가 없으므로 `amount`를 그대로 유지 (smallest unit)
3. `dex-swap.ts:72`에서 DCent `get_quotes` API에 `amount: "1000000000000000"`, `fromDecimals: 18`을 함께 전달
4. `dex-swap.ts:219`에서 `getDexSwapTransactionData`에 `fromAmount: "1000000000000000"`, `fromDecimals: 18`을 전달
5. **DCent API는 `amount`를 human-readable로 해석**하고 `fromDecimals`를 사용하여 내부 변환을 수행
6. 결과적으로 DCent가 `1000000000000000`을 "1000000000000000 ETH"로 해석 후, `txdata.value`에 극소량(2253908 wei ≈ 0.000000002 ETH)을 반환
7. 이 극소량으로는 DEX 라우터가 최소 스왑 금액 미달로 revert

**핵심**: WAIaaS 내부는 smallest unit(wei/lamports) 기준이지만, DCent API는 `amount` + `decimals`를 받아 내부 변환을 하므로, **DCent API에는 human-readable amount를 보내거나**, `decimals` 전달 없이 smallest unit을 보내야 한다.

## 재현

```bash
curl -s -X POST "http://localhost:3100/v1/actions/dcent_swap/dex_swap?dryRun=true" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{
    "walletId": "<EVM_WALLET>",
    "network": "ethereum-mainnet",
    "params": {
      "fromAsset": "eip155:1/slip44:60",
      "toAsset": "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "fromDecimals": 18, "toDecimals": 6,
      "amount": "1000000000000000", "slippage": 1
    }
  }'
```

결과: `txdata.value = 2253908` (0.000000002 ETH) → execution reverted

## 관련 코드

- `packages/actions/src/providers/dcent-swap/dex-swap.ts:72` — `getDcentQuotes()` amount 전달
- `packages/actions/src/providers/dcent-swap/dex-swap.ts:219` — `getDexSwapTransactionData()` fromAmount 전달
- `packages/actions/src/providers/dcent-swap/dcent-api-client.ts:105-115` — DCent API POST
- `packages/actions/src/common/resolve-human-amount.ts:25-49` — humanAmount 변환 헬퍼

## 수정 방안

DCent API에 보내기 전 smallest unit → human amount 역변환 필요:

```typescript
// dex-swap.ts
import { formatAmount } from '@waiaas/core';

// get_quotes 호출 시
amount: formatAmount(BigInt(params.amount), params.fromDecimals),

// getDexSwapTransactionData 호출 시
fromAmount: formatAmount(BigInt(params.amount), params.fromDecimals),
```

또는 DCent API 문서를 재확인하여 `amount` 필드가 실제로 어떤 단위를 기대하는지 검증 필요.

## 영향 범위

- defi-12 (DCent Swap UAT) 실행 불가
- MCP `action_dcent_swap_dex_swap` 도구 스왑 실행 실패
- DCent 2-hop auto-router도 동일 영향

## 테스트 항목

### 단위 테스트 (수정과 함께 작성)

- [ ] `executeDexSwap()`에 wei 단위 amount 입력 시 DCent API client에 human amount로 변환되어 전달되는지 검증 (mock client)
- [ ] `getDcentQuotes()`에 전달되는 amount가 DCent API 기대 단위와 일치하는지 검증 (mock client)
- [ ] 다양한 decimals(6, 8, 9, 18) 토큰에 대해 변환 정확성 검증
- [ ] `resolveProviderHumanAmount()`와 역변환 간 round-trip 무손실 검증
- [ ] `txdata.value` 파싱 결과가 입력 amount와 비례하는지 검증

### E2E 테스트

- [ ] `dex_swap?dryRun=true` 호출 후 `txdata.value`가 입력 amount와 동일 규모인지 검증 (극소량이면 실패)
- [ ] 실제 DCent dex_swap 실행 시 CONFIRMED 도달 확인
