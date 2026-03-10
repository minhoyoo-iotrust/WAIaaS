# 239 — 지갑 앱 테스트 알림이 plain text로 전송되어 Push Relay 파싱 실패

- **유형:** BUG
- **심각도:** HIGH
- **상태:** FIXED
- **관련 이슈:** —

## 현상

Admin UI → Human Wallet Apps 페이지에서 등록된 D'CENT 지갑의 **Test** 버튼을 누르면, ntfy에 **plain text** 메시지가 전송된다.

```typescript
// wallet-apps.ts:244-248 (현재 코드)
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: `WAIaaS test notification for ${app.displayName}`,
});
```

그러나 Push Relay의 `message-parser.ts`는 ntfy SSE 메시지의 `message` 필드를 **base64url 디코딩 → JSON 파싱**하여 `NotificationMessage` 스키마로 검증한다. plain text인 `"WAIaaS test notification for D'CENT"`는:

1. 유효한 base64url 문자열이 아님
2. 디코딩해도 `NotificationMessage` 스키마를 만족하지 않음

결과적으로 Push Relay에서 파싱 에러가 발생하고, 테스트 알림이 모바일 앱까지 전달되지 않는다.

## 원인

테스트 알림 라우트(`wallet-apps.ts`)가 `WalletNotificationChannel.publishNotification()`의 정상 포맷을 사용하지 않고, 별도로 plain text fetch를 직접 호출한다.

### 정상 경로 (WalletNotificationChannel.publishNotification)

```typescript
// wallet-notification-channel.ts:129-155
const json = JSON.stringify(message);  // NotificationMessage
const encoded = Buffer.from(json, 'utf-8').toString('base64url');

await fetch(url, {
  method: 'POST',
  body: encoded,               // base64url 인코딩된 JSON
  headers: {
    'Priority': String(priority),
    'Title': message.title,
    'Tags': `waiaas,${message.category}`,
  },
});
```

### 테스트 경로 (현재 — 불일치)

```typescript
// wallet-apps.ts:244-248
await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: `WAIaaS test notification for ${app.displayName}`,  // plain text
});
```

## 수정 방안

테스트 알림도 `NotificationMessage` 스키마를 준수하는 정상 포맷으로 전송해야 한다.

1. `NotificationMessage` 객체를 구성한다 (eventType: `TEST`, category: `system` 등)
2. `JSON.stringify() → base64url` 인코딩한다
3. ntfy 헤더(`Priority`, `Title`, `Tags`)를 포함한다

수정 후 전송 포맷:

```typescript
const message: NotificationMessage = {
  version: '1',
  eventType: 'TEST',
  walletId: '',
  walletName: app.name,
  category: 'system',
  title: 'Test Notification',
  body: `WAIaaS test notification for ${app.displayName}`,
  timestamp: Math.floor(Date.now() / 1000),
};

const encoded = Buffer.from(JSON.stringify(message), 'utf-8').toString('base64url');

await fetch(url, {
  method: 'POST',
  body: encoded,
  headers: {
    'Priority': '3',
    'Title': message.title,
    'Tags': 'waiaas,system',
  },
});
```

> `TEST` eventType이 `NotificationEventType` 열거에 없다면 추가가 필요하다. 또는 기존 `SYSTEM_EVENT` 등을 활용할 수도 있다.

## 영향 범위

- `packages/daemon/src/api/routes/wallet-apps.ts` — test-notification 라우트 핸들러
- `packages/core/src/schemas/signing-protocol.ts` — NotificationEventType에 `TEST` 추가 (필요 시)
- `packages/daemon/src/__tests__/wallet-app-test-notification.test.ts` — 테스트 갱신

## 테스트 항목

1. **포맷 검증**: 테스트 알림이 base64url(JSON) 포맷으로 전송되는지 확인
2. **스키마 검증**: 전송된 메시지가 `NotificationMessage` 스키마를 통과하는지 확인
3. **ntfy 헤더**: `Priority`, `Title`, `Tags` 헤더가 포함되는지 확인
4. **Push Relay 파싱**: Push Relay의 message-parser가 테스트 알림을 정상 파싱하는지 확인
5. **기존 게이트 유지**: Signing SDK 비활성, 알림 비활성, 앱 alerts 비활성 시 여전히 차단되는지 확인
