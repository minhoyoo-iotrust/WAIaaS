# 326 — Pendle API v2 엔드포인트 변경으로 Yield Trading 전면 실패

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v31.9
- **상태:** FIXED

## 현상

Pendle API `/v2/sdk/{chainId}/convert` 엔드포인트가 404를 반환하여 Pendle Yield Trading 기능이 전면 실패한다. defi-09 시나리오 FAIL.

## 원인

Pendle 측에서 API v2를 변경하거나 deprecation 처리한 것으로 추정. PendleApiClient가 구버전 엔드포인트를 참조 중.

## 해결 방안

1. Pendle API 최신 문서 확인 — 엔드포인트 변경 여부 파악
2. PendleApiClient 엔드포인트 업데이트
3. 외부 API 변경에 대한 방어 로직 (404 시 명확한 에러 메시지)

## 영향 범위

- `packages/actions/src/providers/pendle/` — PendleApiClient, PendleYieldProvider

## 테스트 항목

1. PendleApiClient가 신규 엔드포인트로 요청하는지 단위 테스트
2. 외부 API 404 시 사용자에게 명확한 에러 메시지 반환 확인
3. Pendle Yield Trading E2E 시나리오 재검증
