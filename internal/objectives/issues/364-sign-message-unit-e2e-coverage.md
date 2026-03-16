# 364 — sign-message 단위/E2E 테스트 커버리지 보강

- **유형:** MISSING
- **심각도:** MEDIUM
- **상태:** FIXED
- **발견일:** 2026-03-16

## 현상

sign-message 기능의 단위/통합 테스트가 20개(스키마 12 + API 8)로 기본 경로만 커버. 인증/인가 에러, 지갑 상태 검증, 이벤트 발행, 키 관리 실패 등 미커버 영역 존재.

## 수정 방안

15~20개 단위/E2E 테스트 추가:

### 단위 테스트 (packages/daemon)
- 401 UNAUTHORIZED (Authorization 헤더 누락)
- 401 INVALID_SESSION (무효 JWT)
- 403 FORBIDDEN (세션에 미포함된 지갑)
- WALLET_NOT_FOUND 에러
- WALLET_TERMINATED 에러
- 멀티 월렛 세션에서 walletId 해석
- EventBus.emit('wallet:activity') 호출 확인
- 키 복호화 실패 시 에러 처리
- 빈 메시지 문자열 처리
- 복잡 중첩 EIP-712 타입 (struct 내 struct)
- GET /v1/transactions에서 SIGN 타입 조회 확인

### E2E 테스트 (packages/e2e-tests)
- MCP sign-message 도구 호출 → 서명 반환 확인
- SDK signMessage() 메서드 호출 → 서명 반환 확인

## 대상 파일

- `packages/daemon/src/__tests__/sign-message-api.test.ts` — 기존 파일 확장
- `packages/core/src/__tests__/sign-message-schema.test.ts` — 스키마 테스트 추가
- `packages/e2e-tests/src/scenarios/` — E2E 시나리오 추가

## 테스트 항목

- 인증/인가 에러 경로 (401, 403) 테스트
- 지갑 상태별 처리 (NOT_FOUND, TERMINATED) 테스트
- 이벤트 발행 및 DB 레코드 일관성 테스트
- MCP/SDK 인터페이스 통합 테스트
