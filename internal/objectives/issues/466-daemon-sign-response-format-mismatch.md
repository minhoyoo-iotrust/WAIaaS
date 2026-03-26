# #466 — 데몬 PushRelaySigningChannel이 서명 응답을 base64 래핑 포맷으로 기대함

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **등록일:** 2026-03-26
- **관련 이슈:** #456 (Push Relay 서명 요청 payload 포맷 불일치), #461 (Admin 테스트 서명 base64 포맷)
- **발견 경위:** Push Relay 서버 응답 포맷과 데몬 파싱 로직 비교 검토

## 현상

데몬의 `PushRelaySigningChannel`이 `GET /v1/sign-response/:requestId` long-polling 응답을 파싱할 때 `{ response: base64url_string }` 래핑 포맷을 기대하지만, Push Relay 서버는 **직접 JSON 객체**를 반환한다.

**서버 (push-relay):** 직접 JSON 반환 (`sign-response-routes.ts:84,96`)
```typescript
const parsed = JSON.parse(immediate) as Record<string, unknown>;
return c.json(parsed, 200);
// → { "version": "1", "requestId": "...", "action": "approve", "signerAddress": "...", "signedAt": "..." }
```

**데몬 (daemon):** base64url 래핑 기대 (`push-relay-signing-channel.ts:247-250`)
```typescript
const body = (await res.json()) as { response: string };
const json = Buffer.from(body.response, 'base64url').toString('utf-8');
const parsed: unknown = JSON.parse(json);
const signResponse = SignResponseSchema.parse(parsed) as SignResponse;
```

## 원인

`#456`에서 Push Relay의 서명 **요청** payload를 base64 래핑에서 플랫 필드로 변경했으나, 서명 **응답** GET 엔드포인트의 반환 포맷과 데몬의 파싱 로직 간 불일치가 남아 있다.

두 가지 가능성:
1. Push Relay 서버가 원래 `{ response: base64url }` 래핑으로 반환해야 하는데 직접 JSON으로 변경됨
2. 데몬이 직접 JSON을 파싱해야 하는데 레거시 base64url 디코딩 로직이 남아 있음

## 수정 방안

**방안 A (데몬 수정 — 권장):** 데몬의 파싱 로직을 직접 JSON 포맷에 맞게 수정

```typescript
// Before
const body = (await res.json()) as { response: string };
const json = Buffer.from(body.response, 'base64url').toString('utf-8');
const parsed: unknown = JSON.parse(json);

// After
const parsed: unknown = await res.json();
const signResponse = SignResponseSchema.parse(parsed) as SignResponse;
```

**방안 B (서버 수정):** Push Relay가 `{ response: base64url }` 래핑 포맷으로 반환하도록 변경. 그러나 #456의 "플랫 필드 우선" 방향과 상충하므로 비권장.

## 영향 범위

- `packages/daemon/src/services/signing-sdk/channels/push-relay-signing-channel.ts` — 파싱 로직
- `packages/daemon/src/__tests__/` — 관련 테스트 업데이트

## 테스트 항목

- [ ] 데몬이 Push Relay의 직접 JSON 응답을 올바르게 파싱하는지 단위 테스트
- [ ] approve/reject 양쪽 action에 대해 정상 파싱 확인
- [ ] 기존 E2E/UAT 시나리오(advanced-05, advanced-07) 회귀 없음 확인
