# 101 — Admin 알림 설정 UX 문제: 전체 활성 토글 위치 + 비활성 배너 안내 오류

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** v2.5
- **상태:** FIXED
- **등록일:** 2026-02-19

## 현상

### 1. 전체 알림 활성 토글이 Telegram 영역 안에 배치

Notifications > Settings 탭에서 `notifications.enabled` (전체 알림 on/off) 토글이 **Telegram FieldGroup 내부**에 위치한다. 이 설정은 Telegram뿐 아니라 Discord, ntfy, Slack 등 **모든 채널에 영향**을 미치는 전역 설정이므로, 채널 영역보다 상위에 배치되어야 한다.

```
현재 구조:
  Notification Configuration
    └─ FieldGroup "Telegram"
        ├─ Enabled (← 전체 알림 on/off — 여기가 문제)
        ├─ Telegram Bot Token
        ├─ Telegram Chat ID
        └─ Locale
    └─ FieldGroup "Other Channels"
        ├─ Discord Webhook URL
        ├─ ntfy Server / Topic
        └─ Slack Webhook URL

기대 구조:
  Notification Configuration
    ├─ Enabled (← 전체 알림 on/off — 최상위)
    ├─ Locale
    └─ FieldGroup "Telegram"
        ├─ Telegram Bot Token
        └─ Telegram Chat ID
    └─ FieldGroup "Other Channels"
        ├─ Discord Webhook URL
        ├─ ntfy Server / Topic
        └─ Slack Webhook URL
```

### 2. 비활성 배너가 config.toml 참조

Channels & Logs 탭에서 알림이 비활성 상태일 때 표시되는 배너 문구:

> "Notifications are disabled. Set `notifications.enabled = true` in config.toml"

`notifications.enabled`는 Admin Settings에서 설정 가능하므로, config.toml 대신 **Settings 탭으로 이동 안내**해야 한다.

## 원인

### 토글 위치
`notifications.tsx:193-203`에서 `notifications.enabled` FormField가 Telegram FieldGroup 내부에 배치됨.

### 배너 문구
`notifications.tsx:537-539`에서 config.toml 참조 하드코딩:
```tsx
<div class="notif-disabled-banner">
  Notifications are disabled. Set <code>notifications.enabled = true</code> in config.toml
</div>
```

## 수정 범위

### 1. `notifications.enabled` + `locale` 토글을 Telegram FieldGroup 밖(상위)으로 이동

- Notification Configuration 섹션 최상위에 전역 설정 영역 배치
- `notifications.enabled` (전체 on/off)와 `notifications.locale` (메시지 언어)을 채널 영역보다 위에 위치

### 2. 비활성 배너 문구 변경 + Settings 탭 이동 안내

- "Notifications are disabled. Enable them in the Settings tab." 으로 변경
- Settings 탭으로 이동하는 링크/버튼 추가

### 영향 범위

- `packages/admin/src/pages/notifications.tsx` — Settings 탭 레이아웃 + Channels 탭 배너 문구

## 테스트 항목

### 단위 테스트
1. `notifications.enabled` FormField가 Telegram FieldGroup 밖에 렌더링되는지 확인
2. 비활성 배너에 "config.toml" 문구가 없고 "Settings tab" 안내가 포함되는지 확인

### 수동 검증
3. Settings 탭에서 Enabled 토글이 Telegram/Other Channels보다 상위에 표시되는지 확인
4. Channels 탭 비활성 배너에서 Settings 탭 이동이 가능한지 확인
