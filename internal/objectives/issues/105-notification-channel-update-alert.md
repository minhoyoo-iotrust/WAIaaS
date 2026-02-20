# 105 — 노티피케이션 채널을 통한 데몬 업데이트 알림 발송

- **유형:** ENHANCEMENT
- **심각도:** LOW
- **마일스톤:** TBD
- **상태:** OPEN
- **등록일:** 2026-02-19

## 현상

VersionCheckService가 npm 레지스트리에서 새 버전을 감지하면 콘솔 로그(`VersionCheck: update available X → Y`)만 출력하고, 설정된 알림 채널(Telegram, Discord, ntfy, Slack)로는 알림을 보내지 않는다.

현재 `NotificationEventType`에 업데이트 관련 이벤트 타입이 없으며 (`notification.ts`: 25개 이벤트 타입), VersionCheckService와 NotificationService 간 연동이 없다.

CLI 자동 알림은 사용자가 CLI 명령을 실행해야만 표시되므로, 장기간 CLI를 사용하지 않는 운영자는 새 버전 출시를 인지하지 못한다. 알림 채널은 운영자에게 능동적으로 푸시하는 유일한 경로이다.

## 수정 범위

### 1. `UPDATE_AVAILABLE` 이벤트 타입 추가

`packages/core/src/enums/notification.ts`의 `NOTIFICATION_EVENT_TYPES`에 `UPDATE_AVAILABLE` 추가:

```typescript
const NOTIFICATION_EVENT_TYPES = [
  // ... 기존 25개
  'UPDATE_AVAILABLE',
] as const;
```

### 2. 메시지 템플릿 추가

`packages/core/src/i18n/` 영문/한국어 메시지 파일에 `UPDATE_AVAILABLE` 템플릿 추가:

```
title: "WAIaaS Update Available"
body: "A new version {latestVersion} is available (current: {currentVersion}). Run `waiaas update` to update."
```

### 3. VersionCheckService에서 NotificationService 호출

version-check 워커가 새 버전 최초 감지 시 NotificationService.send()를 호출한다:

- **최초 감지 시 1회만 발송**: `key_value_store`에 `version_check_notified_version` 키를 추가하여, 동일 버전에 대해 중복 알림 방지
- 새로운 버전이 또 나오면(예: 2.0.0 알림 후 2.1.0 감지) 다시 발송
- NotificationService 인스턴스를 VersionCheckService에 주입 (DaemonLifecycle에서 연결)

### 4. DB 마이그레이션

`notification_logs` 테이블의 `event_type` CHECK 제약에 `UPDATE_AVAILABLE` 추가.

### 영향 범위

- `packages/core/src/enums/notification.ts` — 이벤트 타입 추가
- `packages/core/src/i18n/en.ts`, `ko.ts` — 메시지 템플릿 추가
- `packages/daemon/src/infrastructure/version/version-check-service.ts` — NotificationService 연동
- `packages/daemon/src/lifecycle/daemon.ts` — NotificationService → VersionCheckService 주입
- `packages/daemon/src/infrastructure/database/migrate.ts` — CHECK 제약 마이그레이션
- `packages/daemon/src/infrastructure/database/schema.ts` — enum 목록 갱신

## 테스트 항목

### 단위 테스트
1. 새 버전 최초 감지 시 `UPDATE_AVAILABLE` 이벤트로 NotificationService.send()가 호출되는지 확인
2. 동일 버전 재감지 시 중복 알림이 발송되지 않는지 확인 (`version_check_notified_version` 키 확인)
3. 더 새로운 버전 감지 시 알림이 다시 발송되는지 확인
4. NotificationService 미주입 시(알림 비활성) 오류 없이 건너뛰는지 확인
5. `UPDATE_AVAILABLE` 메시지 템플릿에 `{latestVersion}`, `{currentVersion}` 변수가 올바르게 치환되는지 확인
6. `notification_logs` 테이블에 `UPDATE_AVAILABLE` 이벤트 로그가 정상 저장되는지 확인
