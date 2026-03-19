# #412 — Action Provider 외부 API 요청/응답 디버그 로깅 누락

- **유형**: ENHANCEMENT
- **심각도**: HIGH
- **영향 시나리오**: defi-08, defi-09, defi-10, defi-12b, defi-12c, defi-14, defi-15
- **컴포넌트**: `packages/actions/src/common/action-api-client.ts`, 각 SDK Wrapper

## 현상

Action Provider UAT 실패 시 외부 API/SDK에 보낸 요청과 응답을 확인할 수 없어 실패 원인 분석이 불가능하다.

- defi-15 (DCent 크로스체인): empty txdata → "API 미지원"으로 **오판하여 WONTFIX 처리**
- defi-09 (Pendle): Zod 스키마 5회 반복 실패 → 실제 API 응답을 한 번도 확인 못함
- defi-08 (Kamino): SDK instruction 빌드 실패 → SDK가 뭘 반환했는지 불명
- defi-10 (Drift): RPC 429 → SDK 내부 어떤 호출이 rate limit에 걸렸는지 불명

## 원인

모든 Action Provider에 요청/응답 로깅이 전혀 없다. 에러 발생 시 ChainError 메시지만 남고 원본 요청 body와 응답 body가 유실된다.

## 수정 방향

### 계층 1: ActionApiClient (HTTP 기반 프로바이더 공통)

대상: DCent, Pendle, 0x, LI.FI, Across, Jupiter

1. `ActionApiClient` 생성자에 `ILogger` 옵셔널 주입
2. `get()`, `post()` 메서드에 debug 레벨 로깅 추가:
   - 요청: HTTP method, endpoint path, request body/params (JSON)
   - 응답: HTTP status, response body (JSON, Zod 검증 전 원본)
   - 에러 시: 요청 body + 에러 상세 함께 기록
3. logger 미주입 시 기존 동작 유지 (하위 호환)

```
[DEBUG] ActionApiClient POST api/swap/v3/get_dex_swap_transaction_data
  Request: { fromId: "ETHEREUM", toId: "SPL-TOKEN/EPjF...", ... }
  Response: { status: "success", txdata: null, ... }
```

### 계층 2: SDK Wrapper (SDK 기반 프로바이더)

대상: Kamino, Drift, Jito, Lido, Aave

1. 각 SDK Wrapper에 `ILogger` 주입
2. SDK 메서드 호출 전후 params/result를 debug 레벨로 기록:
   - 요청: SDK 메서드명, 입력 파라미터
   - 응답: SDK 반환값 (instruction 개수, accounts 개수 등 요약)
   - 에러 시: SDK 에러 메시지 + 입력 파라미터 함께 기록

```
[DEBUG] KaminoSdkWrapper.buildSupplyInstruction
  Params: { asset: "EPjF...", humanAmount: "1.0", decimals: 6 }
  Result: { instructions: 3, accounts: [12, 8, 5] }
```

```
[DEBUG] DriftSdkWrapper.getClient
  RPC: api.mainnet-beta.solana.com
  Error: 429 Too Many Requests (subscribe() failed)
```

## 기대 효과

- Pendle 스키마 문제: 실제 API 응답 원본을 즉시 확인 → 스키마를 정확히 수정 가능
- DCent 크로스체인: 요청 파라미터와 응답을 대조 → "API 미지원" 오판 방지
- Kamino/Drift: SDK 내부 동작 추적 → instruction 빌드 실패/RPC 에러 원인 즉시 파악

## 테스트 항목

### ActionApiClient (공통)
- [ ] `get()` 호출 시 request URL/params + response body가 debug 로그에 출력
- [ ] `post()` 호출 시 request body + response body가 debug 로그에 출력
- [ ] API 에러(4xx, 5xx, timeout) 발생 시 request body + 에러 상세가 로그에 포함
- [ ] Zod 검증 실패 시 원본 response body가 로그에 포함 (스키마 디버깅용)
- [ ] logger 미주입 시 기존 동작과 동일 (하위 호환)

### SDK Wrapper (프로바이더별)
- [ ] Kamino: buildSupplyInstruction 전후 params/result 로깅
- [ ] Drift: getClient() subscribe 성공/실패 로깅
- [ ] Pendle: convert API 호출 전후 raw response 로깅
- [ ] 민감 정보(walletAddress)는 debug 레벨이므로 로컬 데몬 환경에서만 노출 (보안 영향 없음)
