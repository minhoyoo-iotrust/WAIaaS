# 088 — NotificationService가 config.toml enabled=false일 때 미생성되어 Admin UI에서 알림 활성화 불가

| 필드 | 값 |
|------|-----|
| **유형** | BUG |
| **심각도** | MEDIUM |
| **마일스톤** | v2.3 |
| **상태** | OPEN |
| **발견일** | 2026-02-18 |

## 증상

config.toml에서 `[notifications]` 섹션을 설정하지 않은 상태(기본값 `enabled = false`)로 데몬을 시작하면, Admin UI Notifications 페이지에서 알림을 활성화하고 자격증명을 입력해도 알림이 동작하지 않음.

사용자가 config.toml을 직접 편집하여 `enabled = true`로 바꾸고 데몬을 재시작해야만 알림 기능을 사용할 수 있음.

## 근본 원인

`daemon.ts` Step 4d에서 `config.toml`의 `notifications.enabled`만 확인하여 NotificationService 인스턴스 생성 여부를 결정:

```typescript
// packages/daemon/src/lifecycle/daemon.ts (Step 4d)
if (this._config!.notifications.enabled) {
  // NotificationService 생성 + 채널 초기화
  this.notificationService = new NotificationService({ ... });
}
```

`enabled = false`(기본값)이면 `notificationService`가 `null`로 남아 있어:
- hot-reload의 `reloadNotifications()`가 `if (!svc) return;`으로 즉시 반환
- Admin Settings에서 `notifications.enabled = true`로 변경해도 서비스 인스턴스 자체가 없으므로 채널 추가 불가
- 이벤트 버스가 알림을 보내려 해도 서비스가 null이므로 무시됨

반면 hot-reload 로직은 이미 동적 on/off를 지원하도록 설계되어 있음:

```typescript
// packages/daemon/src/infrastructure/settings/hot-reload.ts
const enabled = ss.get('notifications.enabled') === 'true';
if (!enabled) {
  svc.replaceChannels([]);  // ← svc가 존재해야 동작
  return;
}
// ... 채널 재구성
```

## 수정 방안

`daemon.ts`에서 `config.toml`의 `enabled` 여부와 관계없이 항상 `NotificationService`를 초기화하되, 채널은 조건부로 추가:

```typescript
// 변경 후: 항상 NotificationService 생성
const { NotificationService, TelegramChannel, DiscordChannel, NtfyChannel, SlackChannel } =
  await import('../notifications/index.js');

this.notificationService = new NotificationService({
  db: this._db ?? undefined,
  config: {
    locale: (this._config!.notifications.locale ?? 'en') as 'en' | 'ko',
    rateLimitRpm: this._config!.notifications.rate_limit_rpm ?? 20,
  },
});

// 채널은 enabled일 때만 추가 (기존 로직 유지)
if (this._config!.notifications.enabled) {
  // ... 채널 초기화 로직 (기존과 동일)
}
```

이렇게 하면:
- `NotificationService` 인스턴스가 항상 존재 → hot-reload가 동작
- config.toml `enabled = false`이면 채널 0개로 시작 → 알림 안 보내짐 (기존 동작 유지)
- Admin UI에서 `enabled = true` + 자격증명 입력 → hot-reload가 채널 추가 → 데몬 재시작 없이 알림 활성화

## 영향 범위

| 파일 | 변경 내용 |
|------|-----------|
| `packages/daemon/src/lifecycle/daemon.ts` | Step 4d — NotificationService를 조건부 생성에서 항상 생성으로 변경 |

## 검증 방법

1. config.toml에 `[notifications]` 섹션 없이 데몬 시작
2. Admin UI Notifications 페이지에서 enabled 토글 ON + Telegram/Discord 자격증명 입력 + 저장
3. 알림 테스트 전송 → 성공 확인
4. enabled 토글 OFF + 저장 → 알림 테스트 전송 → 전송 안 됨 확인
5. 기존 테스트 전수 통과 확인
