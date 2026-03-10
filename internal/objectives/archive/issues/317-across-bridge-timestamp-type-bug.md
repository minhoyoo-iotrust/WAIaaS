# #317 — Across Bridge timestamp 타입 불일치 버그

- **Type:** BUG
- **Severity:** HIGH
- **Status:** FIXED
- **Component:** `packages/actions/src/providers/across/`

## 증상

`across_bridge/execute` 액션 실행 시 Across API 응답의 `timestamp` 필드 타입 불일치:

```
ACTION_RESOLVE_FAILED: [
  { "code": "invalid_type", "expected": "number", "received": "string", "path": ["timestamp"] }
]
```

## 재현 절차

```bash
curl -s -X POST http://localhost:3100/v1/actions/across_bridge/execute \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{
    "walletId": "<EVM_WALLET_ID>",
    "params": {
      "fromChain": "base",
      "toChain": "arbitrum",
      "inputToken": "0x4200000000000000000000000000000000000006",
      "outputToken": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
      "amount": "1000000000000000",
      "recipient": "0x..."
    },
    "network": "base-mainnet"
  }'
```

## 원인

Across API가 `timestamp` 필드를 문자열(string)로 반환하는데, WAIaaS의 Zod 스키마가 `z.number()`로 정의되어 있어 파싱 실패.

## 수정 방향

1. Across API 응답의 `timestamp` 필드를 `z.coerce.number()` 또는 `z.union([z.number(), z.string().transform(Number)])` 로 변경
2. 해당 Zod 스키마 위치: `packages/actions/src/providers/across/` 내 응답 스키마

## 테스트 항목

- [ ] timestamp가 string일 때 정상 파싱
- [ ] timestamp가 number일 때 정상 파싱
- [ ] Across bridge execute 트랜잭션 생성 성공
