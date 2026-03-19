# #412 — DCent Swap API 요청/응답 디버그 로깅 누락

- **유형**: ENHANCEMENT
- **심각도**: MEDIUM
- **영향 시나리오**: defi-12b, defi-15, defi-12c, defi-14
- **컴포넌트**: `packages/actions/src/providers/dcent-swap/dcent-api-client.ts`

## 현상

DCent Swap UAT 실패 시 `agent-swap.dcentwallet.com`에 보낸 HTTP 요청과 응답을 확인할 수 없어 실패 원인 분석이 불가능하다.

- defi-15 (크로스체인 EVM→Solana): empty txdata 반환 → "API 미지원"으로 오판하여 WONTFIX 처리
- defi-12c (Solana SOL→USDC): 스키마 실패 시 원본 응답 확인 불가
- defi-14 (2-hop): get_quotes 실패 시 어떤 파라미터로 요청했는지 불명

## 원인

`DcentSwapApiClient`의 `getQuotes()`, `getDexSwapTransactionData()` 메서드에 요청/응답 로깅이 전혀 없다. 에러 발생 시 ChainError 메시지만 남고 원본 HTTP 요청 body와 응답 body가 유실된다.

## 수정 방향

1. `DcentSwapApiClient` 생성자에 `ILogger` 주입
2. `getQuotes()`, `getDexSwapTransactionData()` 호출 시 `debug` 레벨로 기록:
   - 요청: HTTP method, endpoint path, request body (JSON)
   - 응답: HTTP status, response body (JSON)
   - 에러 시: 요청 body + 에러 상세 함께 기록
3. 기존 `ActionApiClient`는 변경하지 않음 (DCent 전용 로깅)

## 기대 효과

```
[DEBUG] DCent API POST api/swap/v3/get_dex_swap_transaction_data
  Request: { fromId: "ETHEREUM", toId: "SPL-TOKEN/EPjF...", fromAmount: "1000000000000000", ... }
  Response: { status: "success", txdata: null, ... }
```

UAT 실패 시 원인을 즉시 파악할 수 있어 "API 미지원" 같은 오판을 방지한다.

## 테스트 항목

- [ ] `getQuotes()` 호출 시 request/response가 debug 로그에 출력되는지 확인
- [ ] `getDexSwapTransactionData()` 호출 시 request/response가 debug 로그에 출력되는지 확인
- [ ] API 에러(empty txdata, 429, timeout) 발생 시 request body가 에러 로그에 포함되는지 확인
- [ ] 민감 정보(walletAddress)가 로그에 포함되지만 보안상 문제없는지 확인 (debug 레벨, 로컬 데몬)
