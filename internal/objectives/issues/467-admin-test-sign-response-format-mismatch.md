# #467 — Admin 테스트 서명 요청의 long-polling 응답 파싱도 base64 래핑 포맷으로 기대

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **등록일:** 2026-03-26
- **관련 이슈:** #466 (데몬 PushRelaySigningChannel base64 포맷 미스매치)
- **발견 경위:** #465/#466 수정 후 E2E 검증 중 Admin 테스트 서명 요청 코드에서 동일 패턴 발견

## 현상

`POST /admin/wallet-apps/:id/test-sign-request` 핸들러가 Push Relay의 `GET /v1/sign-response/:requestId` long-polling 응답을 파싱할 때 `{ response: base64url }` 래핑 포맷을 기대하지만, Push Relay 서버는 직접 JSON 객체를 반환한다.

**서버 (push-relay):** 직접 JSON 반환 (`sign-response-routes.ts:84,96`)
```typescript
return c.json(parsed, 200);
```

**데몬 Admin 라우트 (`wallet-apps.ts:419-421`):**
```typescript
const body = (await pollRes.json()) as { response: string };
const json = Buffer.from(body.response, 'base64url').toString('utf-8');
const parsed: unknown = JSON.parse(json);
```

`#466`과 동일한 원인이지만, Admin 라우트의 별도 코드 경로에서 중복으로 존재하는 문제.

## 수정 방안

직접 JSON 파싱으로 변경:

```typescript
// Before
const body = (await pollRes.json()) as { response: string };
const json = Buffer.from(body.response, 'base64url').toString('utf-8');
const parsed: unknown = JSON.parse(json);

// After
const parsed: unknown = await pollRes.json();
```

## 영향 범위

- `packages/daemon/src/api/routes/wallet-apps.ts` — test-sign-request 핸들러 (418-422행)

## 테스트 항목

- [ ] Admin 테스트 서명 요청이 Push Relay 직접 JSON 응답을 올바르게 파싱하는지 확인
- [ ] approve/reject 양쪽 action에 대해 정상 처리 확인
