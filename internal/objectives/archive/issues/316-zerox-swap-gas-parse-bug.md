# #316 — 0x Swap ACTION_RESOLVE_FAILED: gas/gasPrice 파싱 버그

- **Type:** BUG
- **Severity:** HIGH
- **Status:** FIXED
- **Component:** `packages/actions/src/providers/zerox-swap/`

## 증상

`zerox_swap/swap` 액션 실행 시 0x API 응답에서 `gas`/`gasPrice` 필드 파싱 실패:

```
ACTION_RESOLVE_FAILED: [
  { "code": "invalid_type", "expected": "string", "received": "undefined", "path": ["gas"] },
  { "code": "invalid_type", "expected": "string", "received": "undefined", "path": ["gasPrice"] }
]
```

## 재현 절차

```bash
curl -s -X POST http://localhost:3100/v1/actions/zerox_swap/swap \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<EVM_WALLET_ID>",
    "params": {
      "sellToken": "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
      "buyToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "sellAmount": "300000000000000",
      "slippageBps": 50
    },
    "network": "ethereum-mainnet"
  }'
```

## 원인

0x API v2 응답 형식이 변경되어 `gas`/`gasPrice` 필드가 응답에 포함되지 않거나, 필드명이 변경됨. resolve 함수가 0x 응답을 ContractCallRequest로 변환할 때 Zod 스키마 유효성 검증 실패.

## 수정 방향

1. 0x API 현재 응답 형식 확인 (gas 필드 위치/이름 변경 여부)
2. `zerox-swap/index.ts`의 resolve 함수에서 0x 응답 → ContractCallRequest 매핑 수정
3. gas/gasPrice가 없을 때 `estimateGas`로 fallback 처리

## 테스트 항목

- [ ] 0x swap resolve 성공 (gas/gasPrice 올바르게 매핑)
- [ ] ETH → USDC 스왑 트랜잭션 생성 성공
- [ ] 0x API 응답 형식 변경 시에도 graceful fallback
