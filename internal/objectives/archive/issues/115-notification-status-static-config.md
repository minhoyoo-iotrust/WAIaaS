# 115 — Notifications 상태 API가 정적 config 참조하여 활성화 배너 미갱신

- **유형:** BUG
- **심각도:** MEDIUM
- **마일스톤:** TBD
- **상태:** FIXED
- **등록일:** 2026-02-20

## 증상

Admin UI Notifications > Channels 탭에서 "Notifications are disabled. Enable them in the Settings tab" 배너가 Settings 탭에서 `notifications.enabled`를 활성화하고 저장한 후에도 계속 표시됨.

## 근본 원인

`GET /v1/admin/notifications/status` 핸들러(`admin.ts:1156`)가 데몬 시작 시의 **정적 config 스냅샷**을 참조함:

```typescript
// admin.ts:1156
const notifConfig = deps.config?.notifications;
// ...
enabled: notifConfig?.enabled ?? false,
```

`notifConfig`은 `deps.config?.notifications`로, 데몬 시작 시 한 번만 설정되는 DaemonConfig의 정적 객체. Admin Settings에서 `notifications.enabled`를 변경하면 DB(SettingsService)에만 저장되고, 이 정적 객체는 갱신되지 않음.

## 수정 방향

정적 config 대신 SettingsService에서 동적으로 읽도록 변경:

```typescript
// Before:
enabled: notifConfig?.enabled ?? false,

// After:
enabled: deps.settingsService?.get('notifications.enabled') === 'true',
```

## 관련 파일

| 파일 | 위치 |
|------|------|
| `packages/daemon/src/api/routes/admin.ts` | 라인 1156 — `enabled: notifConfig?.enabled ?? false` |
| `packages/daemon/src/api/server.ts` | 라인 445 — `notificationConfig: deps.config?.notifications` 할당 |

## 선행 이슈

- 이슈 088 (v2.4 FIXED): NotificationService가 config.toml enabled=false일 때 미생성 — 동일 계열 문제
- 이슈 101 (v2.5 FIXED): 알림 비활성 배너가 config.toml 참조 — 부분 수정 후 잔여 문제

## 테스트 항목

### 단위 테스트
1. Admin Settings에서 `notifications.enabled = true` 저장 후, `GET /v1/admin/notifications/status`의 `enabled` 필드가 `true`인지 확인
2. 데몬 재시작 없이 설정 변경이 즉시 상태 API에 반영되는지 확인
3. `notifications.enabled`가 DB에 없을 때 기본값 `false`가 반환되는지 확인

### 통합 테스트
4. 기존 `admin-notification-api.test.ts`에 동적 enabled 토글 케이스 추가
