# 304: Agent UAT 시나리오 문서 API 불일치 3건

- **Type:** BUG
- **Priority:** MEDIUM
- **Status:** OPEN
- **Created:** 2026-03-10

## 설명

Agent UAT 시나리오 문서(`agent-uat/testnet/*.md`)에 기재된 API 호출이 실제 데몬 API와 불일치하여, 시나리오 실행 시 모두 실패한다.

## 불일치 내역

### 1. Dry-Run 엔드포인트 경로 불일치
- **시나리오 문서**: `POST /v1/transactions/dry-run`
- **실제 API**: `POST /v1/transactions/simulate`
- **영향 범위**: testnet-02, testnet-03, testnet-04, testnet-05, testnet-07, testnet-08 및 mainnet/defi/advanced 전 시나리오

### 2. 전송 금액 필드명 불일치
- **시나리오 문서**: `"value": "0.001"` (소수점 사람 친화적 형식)
- **실제 API**: `"amount": "1000000000000000"` (최소 단위 문자열, wei/lamports)
- **영향 범위**: 전체 전송 시나리오 (TRANSFER, TOKEN_TRANSFER)

### 3. 토큰 필드 타입 불일치
- **시나리오 문서**: `"token": "<TOKEN_ADDRESS>"` (문자열)
- **실제 API**: `"token": { "address": "...", "decimals": 6, "symbol": "TEST" }` (객체)
- **영향 범위**: TOKEN_TRANSFER 시나리오 (testnet-04, testnet-05, mainnet-03, mainnet-04 등)

## 수정 방향

1. 전 시나리오 파일에서 `dry-run` → `simulate` 경로 일괄 변경
2. `value` → `amount` 필드명 변경 + 최소 단위 값으로 변환
3. `token` 필드를 문자열 → 객체 형식으로 변경
4. 전송 엔드포인트 경로 확인: `POST /v1/transactions` vs `POST /v1/transactions/send`

## 테스트 항목

- 수정된 시나리오 문서의 curl 명령이 실제 API에서 정상 동작하는지 확인
- `verify:agent-uat:format` 스크립트가 수정된 문서를 정상 파싱하는지 확인
- testnet-02 ~ testnet-08 시나리오 재실행으로 PASS 확인
