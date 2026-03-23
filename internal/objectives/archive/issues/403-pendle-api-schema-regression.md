# 403: Pendle API 응답 스키마 불일치 재발 — buy_pt array vs object (#373/#398 3회차)

- **유형:** BUG
- **심각도:** HIGH
- **발견일:** 2026-03-19
- **발견 경위:** DeFi UAT defi-09 dryRun 실행

## 증상

Pendle buy_pt action 실행 시 Zod 스키마 검증 실패:
```
invalid_union: Expected array, received object
```

## 원인

Pendle V2 API(`/v1/sdk/...`)의 응답 형식이 다시 변경된 것으로 추정. 이전 수정 이력:
- #373 (v32.5): array → object 변경 대응
- #398 (v32.10): 재발 대응

3회째 동일 패턴 발생. Pendle API가 버전에 따라 응답 형식을 변경하거나, 마켓/토큰에 따라 다른 형식을 반환할 가능성.

## 재현 조건

```bash
curl -s -X POST 'http://localhost:3100/v1/actions/pendle_yield/buy_pt?dryRun=true' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <session-token>' \
  -d '{"walletId":"<EVM_WALLET>","network":"ethereum-mainnet","params":{"market":"0xcDD26Eb5EB2Ce0f203a84553853667fB73fab4dd","tokenIn":"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48","amountIn":"5000000"}}'
```

## 제안 수정 방향

Pendle API 응답을 `z.union([z.array(...), z.object({...})])` 양쪽 모두 허용하는 방식으로 변경하여 API 변동에 대한 내성 확보. 또는 Pendle API 버전을 명시적으로 고정.

## 영향

- Pendle Yield Trading 전체 기능 사용 불가 (buy_pt/redeem_pt)

## 테스트 항목

- [ ] Pendle buy_pt dryRun 성공 (200 응답)
- [ ] Pendle API 응답이 array와 object 양쪽 모두 처리되는지 단위 테스트
- [ ] 다양한 마켓/토큰 조합에서 응답 형식 일관성 확인
