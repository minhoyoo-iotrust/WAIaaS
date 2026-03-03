# #224 Approval Method에서 Telegram 설정 상태를 불완전하게 체크

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** —
- **상태:** FIXED

## 증상

Admin UI Notifications에서 Telegram Bot Token이 설정되어 있는데(`notifications.telegram_bot_token` = configured), Owner 지갑 Approval Method에서 "Wallet App (Telegram)"과 "Telegram Bot" 모두 "not configured"로 표시됨.

## 원인

`wallets.tsx:643`에서 Telegram 설정 여부를 `telegram.bot_token`만 체크:

```typescript
const telegramBotConfigured = result['telegram']?.['bot_token'] === true;
```

Telegram bot token은 두 곳에 존재:

| 설정 키 | 카테고리 | 용도 |
|---------|---------|------|
| `notifications.telegram_bot_token` | `notifications` | 알림 채널용 (메인) |
| `telegram.bot_token` | `telegram` | Bot 서비스 전용 (비어있으면 알림용 토큰 폴백) |

`telegram.bot_token`이 비어있고 `notifications.telegram_bot_token`만 설정된 경우, 실제 Telegram Bot은 폴백으로 알림용 토큰을 사용하여 정상 동작하지만 Admin UI는 미설정으로 판단.

## 수정 방안

```typescript
// 현재
const telegramBotConfigured = result['telegram']?.['bot_token'] === true;

// 수정: 둘 중 하나라도 설정되어 있으면 configured
const telegramBotConfigured =
  result['telegram']?.['bot_token'] === true ||
  result['notifications']?.['telegram_bot_token'] === true;
```

## 수정 대상

- `packages/admin/src/pages/wallets.tsx` (line 643)

## 테스트 항목

- [ ] `notifications.telegram_bot_token`만 설정 시 Approval Method에서 Telegram 옵션 경고 미표시 확인
- [ ] `telegram.bot_token`만 설정 시에도 경고 미표시 확인
- [ ] 둘 다 미설정 시 경고 정상 표시 확인
