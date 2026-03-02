# #227 — 지갑 앱 알림 발송이 notification_logs에 미기록

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v29.10
- **상태:** FIXED

## 현상

알림을 Telegram과 지갑 앱(Push Relay/ntfy) 양쪽으로 발송하고 있으나, Admin UI Delivery Log에는 Telegram 채널만 표시되고 지갑 앱 채널 기록이 없다.

## 원인

`NotificationService.notify()`에서 두 가지 알림 경로가 완전히 분리되어 있다:

1. **전통 채널** (Telegram, Discord, Slack, Ntfy): `sendToChannel()` → `logDelivery()` → `notification_logs` 테이블에 기록
2. **지갑 앱 사이드 채널** (`WalletNotificationChannel`): `notify()` → ntfy publish → **DB 기록 없음**

```typescript
// notification-service.ts:127-131
if (this.walletNotificationChannel) {
  const { title: sideTitle, body: sideBody } = getNotificationMessage(...);
  // Fire-and-forget — logDelivery() 호출 없음
  this.walletNotificationChannel.notify(eventType, walletId, sideTitle, sideBody, details).catch(() => {});
}
```

`WalletNotificationChannel` 클래스 자체에 DB 의존성이 없어서 발송 성공/실패를 어디에도 기록하지 않는다.

## 영향

- Admin UI Delivery Log에서 지갑 앱 알림 발송 이력을 확인할 수 없음
- 지갑 앱 알림 발송 실패 시 진단 불가 (네트워크 에러, 토픽 오류 등)
- 채널 필터에 `Wallet App` 옵션이 이미 존재하지만(notifications.tsx:102) 결과가 항상 빈 목록

## 수정 방안

`NotificationService.notify()`에서 `WalletNotificationChannel.notify()` 호출 후 결과에 따라 `logDelivery('wallet_app', ...)` 호출을 추가한다.

- DAEMON-06 fire-and-forget 격리 설계 유지 (로깅 실패가 메인 플로우를 차단하지 않음)
- 성공 시 `sent`, 실패 시 `failed` + 에러 메시지 기록
- `WalletNotificationChannel` 클래스 자체는 수정 불필요 — 로깅은 `NotificationService` 레벨에서 처리

## 관련 파일

- `packages/daemon/src/notifications/notification-service.ts` (127-131행, 306-331행)
- `packages/daemon/src/services/signing-sdk/channels/wallet-notification-channel.ts`
- `packages/daemon/src/infrastructure/database/schema.ts` (318-337행)
- `packages/admin/src/pages/notifications.tsx` (102행 — 이미 `wallet_app` 필터 옵션 존재)

## 테스트 항목

- [ ] 지갑 앱 알림 발송 성공 시 `notification_logs`에 `channel='wallet_app'`, `status='sent'` 기록 확인
- [ ] 지갑 앱 알림 발송 실패 시 `notification_logs`에 `channel='wallet_app'`, `status='failed'` + 에러 메시지 기록 확인
- [ ] 전통 채널(Telegram)과 지갑 앱 알림이 동일 이벤트에 대해 각각 별도 행으로 기록됨
- [ ] Admin UI Delivery Log에서 채널 필터 `Wallet App` 선택 시 해당 기록만 표시
- [ ] 로깅 실패가 메인 알림 플로우를 차단하지 않음 (fire-and-forget 유지)
