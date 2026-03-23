# #369 — Jupiter Swap routePlan feeAmount/feeMint 필드 누락으로 스왑 실패

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** —
- **상태:** FIXED

## 설명

Jupiter API v6 응답의 `routePlan[].swapInfo` 객체에서 `feeAmount`/`feeMint` 필드가 항상 반환되지 않아 Zod 스키마 파싱에 실패한다. 이로 인해 Jupiter Swap 전체 기능이 동작하지 않는다.

## 재현 방법

```bash
curl -s -X POST "http://localhost:3100/v1/actions/jupiter_swap/swap?dryRun=true" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<SOL_WALLET_ID>",
    "network": "solana-mainnet",
    "params": {
      "inputMint": "So11111111111111111111111111111111111111112",
      "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "5000000",
      "slippageBps": 50
    }
  }'
```

## 에러 메시지

```
ACTION_RESOLVE_FAILED: Action resolve failed:
  - path: routePlan[0].swapInfo.feeAmount — Required (expected string, received undefined)
  - path: routePlan[0].swapInfo.feeMint — Required (expected string, received undefined)
```

## 원인

`packages/actions/src/providers/jupiter-swap/schemas.ts:46-47`에서 `feeAmount`와 `feeMint`가 `z.string()`(필수)으로 정의되어 있으나, Jupiter API가 일부 라우트에서 이 필드를 생략하고 있다.

## 수정 방안

```typescript
// packages/actions/src/providers/jupiter-swap/schemas.ts:46-47
feeAmount: z.string().optional(),
feeMint: z.string().optional(),
```

## 영향 범위

- defi-01 (Jupiter Swap UAT) 실행 불가
- MCP `action_jupiter_swap_swap` 도구 사용 불가
- 에이전트 SOL↔토큰 스왑 전체 차단

## 테스트 항목

- [ ] Jupiter SOL→USDC dryRun 성공 확인
- [ ] Jupiter SOL→USDC 실제 스왑 실행 및 CONFIRMED 확인
- [ ] feeAmount/feeMint 존재하는 라우트에서도 정상 파싱 확인
- [ ] 기존 Jupiter 단위 테스트 통과 확인
