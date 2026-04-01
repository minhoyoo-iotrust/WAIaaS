# 451 — 서명 요청 Push payload에 title/body 누락으로 자체 호스팅 Push Relay에서 Pushwoosh 에러

- **유형:** BUG
- **심각도:** MEDIUM
- **등록일:** 2026-03-24
- **수정일:** 2026-03-24

## 현상

Admin UI "Test Sign Request" 버튼으로 자체 호스팅 Push Relay에 서명 요청을 보내면, Pushwoosh API가 "Please enter the text to be sent" 에러를 반환한다. 프로덕션 Push Relay(`waiaas-push.dcentwallet.com`)에서는 동일 payload가 정상 처리된다.

## 원인

서명 요청 Push payload에 `title`/`body` 필드가 없다. Push Relay의 `/v1/push` 핸들러에서:

```typescript
// sign-response-routes.ts:114-115
title: (payload.title as string) || category,   // → "sign_request" (fallback)
body: (payload.body as string) || '',            // → "" (빈 문자열)
```

Pushwoosh API는 빈 `body`를 거부한다. 프로덕션 Push Relay는 자체적으로 이를 처리하지만, 자체 호스팅 Push Relay에서는 에러가 발생한다.

### 영향받는 코드 2곳

**1. 테스트 서명 요청 API** (`wallet-apps.ts:376-381`):
```typescript
payload: { request: encoded },  // title, body 없음
```

**2. 실제 서명 요청** (`push-relay-signing-channel.ts:113-116`):
```typescript
payload: {
  request: encoded,
  universalLinkUrl,
  // title, body 없음
},
```

양쪽 모두 `title`/`body`가 없으나, 실제 서명 요청은 프로덕션 Push Relay로 전송되어 정상 동작한다. 자체 호스팅 Push Relay 사용 시 양쪽 모두 실패한다.

## 수정 방안

양쪽 모두 payload에 `title`/`body`를 추가한다:

### 1. 테스트 서명 요청 API

```typescript
payload: {
  title: 'WAIaaS Test Sign Request',
  body: `Test sign request for ${app.displayName}`,
  request: encoded,
},
```

### 2. 실제 서명 요청 (PushRelaySigningChannel)

```typescript
payload: {
  title: 'WAIaaS Sign Request',
  body: request.displayMessage,  // "TRANSFER 0.05 ETH from 0x7445... to 0x0000..."
  request: encoded,
  universalLinkUrl,
},
```

`title`/`body`는 푸시 알림 배너에 표시되는 텍스트이고, `request`는 앱이 열린 후 파싱하는 실제 서명 데이터(SIWE 메시지, 체인, 메타데이터)이다.

### 3. Push Relay fallback 강화 (방어적)

Push Relay의 `/v1/push`에서 `body`가 빈 문자열일 때 category 기반 기본 메시지를 사용:

```typescript
body: (payload.body as string) || (category === 'sign_request' ? 'Transaction approval required' : 'WAIaaS notification'),
```

## 테스트 항목

### 단위 테스트
- 테스트 서명 요청 payload에 title, body가 포함되는지
- 실제 서명 요청 payload에 title, body가 포함되는지
- Push Relay에서 body 빈 문자열일 때 fallback 메시지가 사용되는지

### 통합 테스트
- Admin UI Test Sign Request → 자체 호스팅 Push Relay → Pushwoosh 에러 없이 디바이스 도달
- APPROVAL 티어 TX → 자체 호스팅 Push Relay → 정상 전달
