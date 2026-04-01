# 449 — Push Relay subscriptionToken 불일치로 푸시 알림이 디바이스에 도달하지 않음

- **유형:** BUG
- **심각도:** HIGH
- **등록일:** 2026-03-24
- **수정일:** 2026-03-24

## 현상

데몬이 Push Relay `/v1/push`로 보내는 `subscriptionToken`이 앱 name(`dcent`, `dcent-test`)이지만, Push Relay 서버에 등록된 디바이스의 `subscription_token`은 고유 토큰(`7af653c8`, `ad138c55`)이다. 매칭이 안 되어 **푸시 알림과 서명 요청이 실제 디바이스에 도달하지 않는다.**

### Push Relay 디바이스 등록 현황

| push_token | wallet_name | subscription_token |
|------------|------------|-------------------|
| simul-dcent-... | dcent | `ad138c55` |
| a3546bf798b2... | dcent | `7af653c8` |

### 데몬이 보내는 subscriptionToken

| 경로 | 보내는 값 | 매칭 |
|------|----------|------|
| 알림 (WalletNotificationChannel) | `app.name` (`dcent`, `dcent-test`) | X |
| 서명 요청 (PushRelaySigningChannel) | `walletName` = `wallet_type` (`dcent`) | X |

## 원인

### 1. 알림 채널 (wallet-notification-channel.ts:92)

```typescript
// app.name을 subscriptionToken으로 사용
this.publishNotification(app.pushRelayUrl!, app.name, { ... });
```

`wallet_apps.subscription_token` 필드를 무시하고 `app.name`을 그대로 전달.

### 2. 서명 요청 (sign-request-builder.ts:217)

```typescript
const requestTopic = walletName;  // wallet_type = 'dcent'
```

`wallet_apps.subscription_token`이 아닌 `walletName`을 `requestTopic`(= `subscriptionToken`)으로 사용.

## 수정 방안

### 1. 알림 채널: subscription_token 사용

```typescript
// wallet-notification-channel.ts: resolveAlertApps에서 subscription_token도 조회
'SELECT name, wallet_type, push_relay_url, subscription_token FROM wallet_apps WHERE alerts_enabled = 1'

// publishNotification 호출 시 subscription_token 사용
this.publishNotification(app.pushRelayUrl!, app.subscriptionToken || app.name, { ... });
```

### 2. 서명 요청: subscription_token 사용

`SignRequestBuilder`에서 `wallet_apps` 조회 시 `subscription_token`도 함께 조회하여 `requestTopic`으로 사용:

```typescript
// sign-request-builder.ts
const appRow = this.sqlite.prepare(
  'SELECT push_relay_url, subscription_token FROM wallet_apps WHERE name = ?',
).get(walletName);

// requestTopic에 subscription_token 사용
const requestTopic = appRow?.subscription_token || walletName;
```

### 3. fallback

`subscription_token`이 null인 경우 기존처럼 `app.name`을 사용하여 하위 호환성 유지.

## 영향

- **서명 요청이 D'CENT 앱에 도달하지 않음** → Owner 승인 워크플로우 완전 차단
- **푸시 알림이 D'CENT 앱에 도달하지 않음** → 모바일 알림 미수신
- `subscription_token = '7af653c8'`로 보내면 정상 동작 확인됨

## 테스트 항목

### 단위 테스트
- WalletNotificationChannel이 subscription_token을 사용하여 POST /v1/push를 호출하는지
- SignRequestBuilder의 requestTopic이 subscription_token으로 설정되는지
- subscription_token이 null일 때 app.name fallback이 동작하는지

### 통합 테스트
- APPROVAL 티어 TX 생성 → Push Relay에 subscription_token으로 sign_request 전송 → D'CENT 앱에 푸시 도달
- 알림 이벤트 발생 → Push Relay에 subscription_token으로 notification 전송 → D'CENT 앱에 푸시 도달
