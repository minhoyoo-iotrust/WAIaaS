# #129 — 데몬 재시작 시 Admin UI에서 설정한 알림 채널이 로드되지 않음

- **유형:** BUG
- **심각도:** HIGH
- **마일스톤:** v27.0
- **상태:** FIXED
- **등록일:** 2026-02-21

## 현상

Admin UI에서 Telegram 알림 채널을 설정(bot_token, chat_id, enabled=true)한 후 데몬을 재시작하면, 알림 채널 상태가 "Not configured"로 표시된다. 설정을 다시 저장하면(hot-reload 트리거) 채널이 정상 활성화된다.

```json
// GET /v1/admin/notifications/status
{
  "enabled": true,
  "channels": [
    { "name": "telegram", "enabled": false }  // ← 자격증명 있는데 false
  ]
}
```

## 원인

`daemon.ts` Step 4d에서 NotificationService 채널 초기화 시 **`this._config` (config.toml 정적 값)만 참조**하고, SettingsService(DB)를 읽지 않는다.

```typescript
// daemon.ts Step 4d (현재)
if (this._config!.notifications.enabled) {     // ← config.toml만 확인
  const notifConfig = this._config!.notifications;
  if (notifConfig.telegram_bot_token && ...) { // ← config.toml 값만 참조
```

config.toml에 `[notifications]` 섹션이 없으면 Zod 기본값 `enabled=false`가 적용되어, Admin UI에서 DB에 저장한 자격증명이 무시된다.

### 다른 서비스와의 비교

| 서비스 | Step | SettingsService 참조 | 동작 |
|--------|------|---------------------|------|
| TelegramBotService | 4c-5 | **O** (`ss.get('telegram.enabled')`) | 정상 |
| NotificationService | 4d | **X** (`this._config!.notifications`) | **버그** |

Step 4c-5 (TelegramBotService)는 이미 SettingsService를 올바르게 참조하므로, Step 4d도 동일한 패턴을 적용해야 한다.

## 수정 범위

### `packages/daemon/src/lifecycle/daemon.ts` — Step 4d

현재:
```typescript
if (this._config!.notifications.enabled) {
  const notifConfig = this._config!.notifications;
  if (notifConfig.telegram_bot_token && notifConfig.telegram_chat_id) { ... }
```

수정:
```typescript
const ss = this._settingsService;
const notifEnabled = ss
  ? ss.get('notifications.enabled') === 'true'
  : this._config!.notifications.enabled;

if (notifEnabled) {
  const tgToken = (ss ? ss.get('notifications.telegram_bot_token') : '')
    || this._config!.notifications.telegram_bot_token;
  const tgChatId = (ss ? ss.get('notifications.telegram_chat_id') : '')
    || this._config!.notifications.telegram_chat_id;
  if (tgToken && tgChatId) { ... }
```

`locale`, `rate_limit_rpm`도 동일하게 SettingsService 우선 참조로 변경.

## 테스트 항목

### 단위 테스트

- SettingsService에 `notifications.enabled=true` + `telegram_bot_token` + `telegram_chat_id`가 저장된 상태에서 Step 4d 실행 시 Telegram 채널이 로드되는지 확인
- config.toml에 `[notifications]` 섹션이 없고 DB에만 설정이 있을 때 채널이 로드되는지 확인
- config.toml과 DB 모두에 설정이 있을 때 DB(SettingsService) 값이 우선하는지 확인
- `notifications.enabled=false`(DB)일 때 채널이 로드되지 않는지 확인

### 통합 테스트

- 데몬 시작 → `GET /v1/admin/notifications/status`에서 DB에 저장된 Telegram 채널이 `enabled: true`로 반환되는지 확인
- 데몬 시작 → `POST /v1/admin/notifications/test`로 Telegram 테스트 알림이 성공하는지 확인
- Discord, ntfy, Slack 채널도 동일하게 DB 설정으로 시작 시 로드되는지 확인

### 회귀 테스트

- config.toml에 `[notifications]` 섹션이 있는 경우 기존 동작(config.toml 값으로 채널 로드)이 유지되는지 확인
- hot-reload 후에도 채널이 정상 동작하는지 확인

## 영향 범위

- `packages/daemon/src/lifecycle/daemon.ts` — Step 4d 채널 초기화 로직
