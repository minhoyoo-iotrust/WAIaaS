# #465 — Wallet SDK sendViaRelay에 X-API-Key 헤더 누락

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **등록일:** 2026-03-26
- **관련 이슈:** #436 (Push Relay API Key 인증 정책 재설계)
- **발견 경위:** Push Relay 서버 코드와 Wallet SDK 코드 비교 검토

## 현상

Wallet SDK의 `sendViaRelay()` 함수가 `POST /v1/sign-response` 호출 시 `X-API-Key` 헤더를 포함하지 않는다. Push Relay 서버는 해당 엔드포인트에서 API 키 인증을 요구하므로, 지갑 앱에서 서명 응답을 전송하면 항상 **HTTP 401 Unauthorized**가 반환된다.

**서버 (push-relay):** `POST /v1/sign-response`에서 `X-API-Key` 헤더 검증 (`sign-response-routes.ts:38-41`)
```typescript
const reqKey = c.req.header('X-API-Key');
if (!reqKey || reqKey !== apiKey) {
  return c.json({ error: 'Unauthorized' }, 401);
}
```

**SDK (wallet-sdk):** `sendViaRelay()`에서 `X-API-Key` 미전송 (`channels/relay.ts:26-28`)
```typescript
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },  // X-API-Key 누락
  ...
});
```

같은 파일의 `registerDevice`, `unregisterDevice`, `getSubscriptionToken` 함수는 모두 `apiKey` 파라미터를 받아 `X-API-Key` 헤더를 전송하고 있어 `sendViaRelay`만 누락된 상태이다.

## 원인

`#436` 이슈에서 `POST /v1/sign-response`에 API 키 인증을 추가할 때 서버 쪽만 수정하고 Wallet SDK의 `sendViaRelay` 함수에 대응하는 변경을 누락한 것으로 추정.

## 수정 방안

`sendViaRelay` 함수에 `apiKey: string` 파라미터를 추가하고 `X-API-Key` 헤더를 전송한다.

```typescript
export async function sendViaRelay(
  response: SignResponse,
  pushRelayUrl: string,
  apiKey: string,        // 추가
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    ...
  });
}
```

## 영향 범위

- `packages/wallet-sdk/src/channels/relay.ts` — `sendViaRelay` 시그니처 변경
- `packages/wallet-sdk/src/__tests__/channels.test.ts` — 테스트 업데이트
- D'CENT 앱 등 지갑 앱 연동 코드 — `sendViaRelay` 호출부에 `apiKey` 인자 추가 필요

## 테스트 항목

- [ ] `sendViaRelay` 호출 시 `X-API-Key` 헤더가 포함되는지 단위 테스트
- [ ] API 키 불일치 시 401 반환 확인
- [ ] 기존 `registerDevice`, `unregisterDevice` 테스트 회귀 없음 확인
