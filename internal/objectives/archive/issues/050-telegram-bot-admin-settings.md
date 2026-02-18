# v1.6-050: Telegram Bot 활성화를 Admin Settings에서 관리

- **유형:** ENHANCEMENT
- **심각도:** MEDIUM
- **마일스톤:** v1.6
- **상태:** OPEN
- **등록일:** 2026-02-17
- **관련 이슈:** 044 (알림 자격증명 중복)

## 현상

Telegram Bot(Long Polling 명령어 핸들러)을 활성화하려면 `config.toml`에 `[telegram]` 섹션을 별도로 작성하고 데몬을 재시작해야 한다.

```toml
[telegram]
enabled = true
bot_token = "..." # notifications.telegram_bot_token과 동일한 값
locale = "ko"
```

그런데 알림 채널용 `notifications.telegram_bot_token`은 이미 Admin Settings에서 관리되고 있어, **같은 봇 토큰을 두 곳에 설정**해야 하는 중복이 발생한다.

## 현재 구조

```
config.toml [telegram]         → TelegramBotService (Long Polling, 양방향 명령어)
  ├ enabled: boolean
  ├ bot_token: string
  └ locale: 'en' | 'ko'

Admin Settings [notifications]  → NotificationService Telegram 채널 (단방향 push)
  ├ telegram_bot_token: string
  └ telegram_chat_id: string
```

- Bot 서비스와 알림 채널이 같은 봇 토큰을 사용하지만 별도 설정 경로
- Bot 활성화를 위해 config.toml 수정 + 데몬 재시작 필요
- Admin Settings에서 봇 토큰을 설정해도 Bot 서비스는 시작되지 않음

## 수정 방안

### `[telegram]` 섹션 제거, Admin Settings 통합

1. **config.toml `[telegram]` 섹션 제거** — `bot_token`은 `notifications.telegram_bot_token` 재사용
2. **Admin Settings에 `telegram.bot_enabled` 추가** — Bot 명령어 핸들러 on/off
3. **`notifications.telegram_bot_token` 설정 시 Bot 자동 시작** — `bot_enabled=true`이고 토큰이 존재하면 Bot 초기화
4. **Hot-reload 지원** — Settings 변경 시 Bot 서비스 시작/중지 (데몬 재시작 불필요)
5. **locale은 `notifications.locale` 재사용** — 별도 `telegram.locale` 불필요

### 변경 후 구조

```
Admin Settings
  ├ notifications.telegram_bot_token  → 알림 채널 + Bot 공용
  ├ notifications.telegram_chat_id    → 알림 수신 대상
  ├ telegram.bot_enabled (신규)       → Bot 명령어 핸들러 활성화
  └ notifications.locale              → Bot + 알림 공용 로케일
```

### 데몬 초기화 변경

현재 (`daemon.ts:472`):
```typescript
if (this._config!.telegram.enabled && this._config!.telegram.bot_token) {
```

변경 후:
```typescript
const botEnabled = this._settingsService?.get('telegram.bot_enabled');
const botToken = this._settingsService?.get('notifications.telegram_bot_token');
if (botEnabled && botToken) {
```

### Hot-reload 이벤트 처리

```typescript
// Settings 변경 시 Bot 서비스 시작/중지
settingsService.on('change', (key) => {
  if (key === 'telegram.bot_enabled' || key === 'notifications.telegram_bot_token') {
    this.reconcileTelegramBot();
  }
});
```

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/infrastructure/config/loader.ts` | `[telegram]` 스키마 제거 |
| `packages/daemon/src/lifecycle/daemon.ts` | Bot 초기화를 Settings 기반으로 변경 + hot-reload |
| `packages/daemon/src/infrastructure/settings/settings-service.ts` | `telegram.bot_enabled` 키 추가 |
| `packages/admin/src/pages/settings.tsx` | Telegram Bot 활성화 토글 추가 |
| `config.toml.example` | `[telegram]` 섹션 제거 |
| `skills/admin.skill.md` | 설정 가이드 갱신 |

## 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-050-01 | Admin Settings에서 `telegram.bot_enabled=true` + 봇 토큰 존재 | Bot 서비스 시작, `/status` 명령어 응답 |
| T-050-02 | Admin Settings에서 `telegram.bot_enabled=false` 전환 | Bot 서비스 중지, 명령어 무응답 |
| T-050-03 | 봇 토큰 미설정 + `bot_enabled=true` | Bot 미시작, 경고 로그 |
| T-050-04 | `config.toml`에 `[telegram]` 섹션 없이 데몬 시작 | 정상 시작 (기존 호환) |
| T-050-05 | Bot 활성화 상태에서 알림도 동시 수신 | 알림 채널 + Bot 명령어 모두 정상 |
| T-050-06 | Settings에서 봇 토큰 변경 → hot-reload | 기존 Bot 중지 → 새 토큰으로 재시작 |

## 재현 방법

1. Admin Settings에서 `notifications.telegram_bot_token` 설정
2. Telegram에서 봇에게 `/status` 전송 → 무응답
3. `config.toml`에 `[telegram]` 섹션 추가 + 데몬 재시작 → 응답 확인
