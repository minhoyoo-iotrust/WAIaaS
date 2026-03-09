# 287 — E2E interface 테스트 API 형식 불일치 (PUT settings + SDK walletId)

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v31.8
- **발견일:** 2026-03-09
- **발견 경로:** 로컬 E2E 오프체인 스모크 테스트
- **상태:** FIXED
- **수정일:** 2026-03-09

## 증상

`interface-admin-mcp-sdk.e2e.test.ts`에서 2개 테스트 실패:

### 1. PUT /v1/admin/settings → 400

```
AssertionError: expected 400 to be 200 // Object.is equality
```

### 2. SDK getWalletInfo → X-Master-Password header is required

```
WAIaaSError: X-Master-Password header is required
```

## 원인

### PUT settings 400

테스트가 보내는 body:
```json
{ "display_currency": "KRW" }
```

실제 API(`SettingsUpdateRequestSchema`)가 기대하는 body:
```json
{ "settings": [{ "key": "display_currency", "value": "KRW" }] }
```

`settings` 배열 형식이 아니라 flat object를 보내서 Zod 검증 실패 → 400.

### SDK getWalletInfo auth 에러

`sdkClient.getWalletInfo()`는 `GET /v1/wallet/address`를 호출하며 sessionAuth 필요. 테스트에서 세션 토큰을 정상 전달하지만, 1:N 세션 모델에서 `resolveWalletId`가 세션에 연결된 지갑을 자동 해석하지 못하여 masterAuth 폴백 에러 메시지 반환.

`setupDaemonSession` 헬퍼가 지갑 생성 후 세션에 지갑을 attach하는지, SDK 클라이언트 생성 시 walletId를 명시하는지 확인 필요.

## 수정 방안

1. PUT settings 테스트: body를 `{ settings: [{ key: 'display_currency', value: 'KRW' }] }` 형식으로 수정
2. SDK 테스트: `WAIaaSClient` 생성 시 `walletId`를 명시하거나, `setupDaemonSession`이 반환하는 walletId 사용

## 영향 범위

- `packages/e2e-tests/src/__tests__/interface-admin-mcp-sdk.e2e.test.ts` — 테스트 코드 수정

## 테스트 항목

1. PUT settings가 `{ settings: [...] }` 형식으로 200 반환 확인
2. SDK getWalletInfo가 walletId 명시 시 정상 응답 확인
3. 기존 통과 테스트 회귀 없음 확인
