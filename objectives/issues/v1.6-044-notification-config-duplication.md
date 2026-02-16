# v1.6-044: 알림 자격증명이 config.toml과 Admin Settings에 중복 존재

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** v1.6
- **상태:** OPEN
- **등록일:** 2026-02-17

## 현상

알림 채널 자격증명(bot token, webhook URL 등)이 두 곳에서 설정 가능:

1. **config.toml** `[notifications]` 섹션 — 평문 저장
2. **Admin Settings** Notifications 섹션 — DB 저장 (credential은 마스킹)

`config.toml`은 초기 기본값, Admin Settings는 런타임 오버라이드로 설계되었으나, 알림 자격증명의 경우 이 이중 구조가 문제를 야기:

- **보안**: bot token, webhook URL이 config.toml에 평문으로 노출
- **혼란**: 어디서 설정한 값이 적용되는지 불명확 (Admin에서 변경해도 config.toml에는 남아있음)
- **불필요**: Admin UI에서 완전히 관리 가능하므로 config.toml에 둘 이유 없음

## 중복 설정 목록

| config.toml 키 | Admin Settings 키 | 타입 |
|----------------|-------------------|------|
| `notifications.telegram_bot_token` | `notifications.telegram_bot_token` | 자격증명 |
| `notifications.telegram_chat_id` | `notifications.telegram_chat_id` | 식별자 |
| `notifications.discord_webhook_url` | `notifications.discord_webhook_url` | 자격증명 |
| `notifications.ntfy_server` | `notifications.ntfy_server` | URL |
| `notifications.ntfy_topic` | `notifications.ntfy_topic` | 식별자 |
| `notifications.slack_webhook_url` | (Admin에 미노출) | 자격증명 |
| `notifications.enabled` | `notifications.enabled` | 플래그 |
| `notifications.locale` | `notifications.locale` | 설정 |
| `notifications.rate_limit_rpm` | `notifications.rate_limit_rpm` | 설정 |

**config.toml 전용으로 유지해야 할 설정** (운영 인프라 수준):
- `notifications.min_channels` — 최소 채널 수 정책
- `notifications.health_check_interval` — 헬스체크 주기
- `notifications.log_retention_days` — 로그 보관 일수
- `notifications.dedup_ttl` — 중복 제거 TTL

## 수정 방안

### 자격증명/채널 설정은 Admin Settings 전용으로 전환

`config.toml`에서 아래 키를 제거하고 Admin Settings에서만 관리:

```
telegram_bot_token, telegram_chat_id
discord_webhook_url
ntfy_server, ntfy_topic
slack_webhook_url
enabled, locale, rate_limit_rpm
```

### config.toml에 유지할 설정

운영 인프라 수준 설정만 config.toml에 유지:

```toml
[notifications]
min_channels = 2
health_check_interval = 300
log_retention_days = 30
dedup_ttl = 300
```

### Admin Settings에 누락된 항목 추가

- `slack_webhook_url` — 현재 Admin UI에 미노출 (config.toml에만 존재)

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/infrastructure/config/loader.ts` | notifications 스키마에서 자격증명 키 제거 |
| `packages/admin/src/pages/settings.tsx` | slack_webhook_url 필드 추가 |
| `docs/` | config.toml 예시 업데이트 |
| `skills/admin.skill.md` | 설정 가이드 갱신 |

## 테스트

### config.toml 스키마 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-044-01 | 자격증명 키 제거 후 config.toml에 `telegram_bot_token` 등 작성 | Zod 파싱 시 unknown key 무시 (strict 아닌 경우) 또는 경고 로그 |
| T-044-02 | 자격증명 없는 config.toml로 데몬 시작 | 정상 시작, 알림 disabled 상태 |
| T-044-03 | config.toml에 `min_channels`, `health_check_interval` 등 인프라 설정만 존재 | 정상 파싱, 기본값 적용 |

### Admin Settings 우선순위 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-044-04 | Admin Settings에서 `telegram_bot_token` 설정 | NotificationService가 해당 토큰으로 Telegram 채널 초기화 |
| T-044-05 | Admin Settings에서 `slack_webhook_url` 설정 | Slack 채널 활성화, 테스트 알림 전송 성공 |
| T-044-06 | Admin Settings에서 자격증명 변경 후 데몬 재시작 없이 알림 전송 | 변경된 자격증명으로 즉시 반영 (hot-reload) |

### Admin UI 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-044-07 | Settings 페이지 Notifications 섹션에 `slack_webhook_url` 필드 존재 | type="password" 필드 렌더링 |
| T-044-08 | Slack webhook URL 입력 후 Save → Test Notification | Slack 채널 테스트 결과 표시 |

### 보안 테스트

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| T-044-09 | `GET /v1/admin/settings` 응답에서 자격증명 키 확인 | `telegram_bot_token`, `discord_webhook_url` 등은 boolean(설정 여부)으로 마스킹 |
| T-044-10 | 데이터 디렉토리의 config.toml에 자격증명 평문 없음 확인 | 자격증명은 DB에만 저장, config.toml에 미포함 |

## 참고

CLAUDE.md 설정 원칙:
> 보안 자격증명(master_password_hash)이나 인프라 설정(port, host, rpc_url)처럼 재시작이 필요한 항목은 config.toml 전용으로 유지한다.

알림 자격증명은 이 원칙에 따라 **재시작 불필요 = Admin Settings 전용**이 맞음. 현재 구현은 이 원칙과 불일치.
