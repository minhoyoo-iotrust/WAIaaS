---
phase: 200-notification-channel-push-relay-design
plan: 01
subsystem: design
tags: [notification-channel, ntfy, wallet-sdk, notification-message, settings-service, push-relay]

# Dependency graph
requires:
  - phase: 199-wallet-sdk-daemon-components-design
    plan: 02
    provides: "doc 74 완성 (데몬 컴포넌트 인터페이스 + SettingsService signing_sdk 키 + ISigningChannel)"
  - phase: 198-signing-protocol-v1-design
    provides: "doc 73 Signing Protocol v1 (ntfy 토픽 네이밍 + publish 포맷)"
provides:
  - "doc 75: 알림 채널 + Push Relay Server 설계서 Sections 1-5 (알림 채널 설계)"
  - "NotificationMessageSchema Zod 스키마 (6개 카테고리 + metadata 규격)"
  - "서명/알림 토픽 분리 구조 (waiaas-sign-*/waiaas-response-*/waiaas-notify-*) + ntfy priority 차등 (5/4/3)"
  - "SDK subscribeToNotifications() + parseNotification() 시그니처 확정 (@waiaas/wallet-sdk 8개 공개 API)"
  - "WalletNotificationChannel 클래스 + INotificationChannel 통합 + NotificationEventType 25종 매핑"
  - "SettingsService 알림 키 3개 (notifications_enabled, notify_topic_prefix, notify_categories)"
affects: [201]

# Tech tracking
tech-stack:
  added: []
  patterns: ["NotificationMessage Zod 스키마 (type:'notification' 구분)", "토픽 접두어 기반 서명/알림 분리", "NotificationEventType → NotificationCategory 25→6 매핑"]

key-files:
  created:
    - "internal/design/75-notification-channel-push-relay.md"
  modified: []

key-decisions:
  - "서명/알림 토픽 분리: waiaas-sign-*/waiaas-notify-* 접두어로 구분, 동일 ntfy 서버 공유"
  - "ntfy priority 차등: security_alert=5(urgent), policy_violation=4(high), 나머지=3(default)"
  - "NotificationMessage type 필드 'notification' 고정으로 SignRequest와 메시지 수준 구분"
  - "SDK export 8개 (기존 6개 + subscribeToNotifications + parseNotification)"
  - "WalletNotificationChannel 5단계 필터: walletId > sdk_ntfy > enabled > categories > publish"
  - "NotificationEventType 25종 → NotificationCategory 6종 매핑 (CUMULATIVE_LIMIT_WARNING → policy_violation)"
  - "SettingsService 알림 3키로 doc 74의 6키와 합쳐 총 9개 signing_sdk 키"

patterns-established:
  - "NotificationMessage: version/type/notificationId/category/title/body/metadata/walletId/timestamp 9필드 구조"
  - "토픽 접두어 기반 분리: signing(sign/response) vs notification(notify)"
  - "WalletNotificationChannel: INotificationChannel 구현 + send() 5단계 필터링"

requirements-completed: [NOTIF-01, NOTIF-02, NOTIF-03]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 200 Plan 01: 알림 채널 토픽 분리 + NotificationMessage + WalletNotificationChannel 설계 Summary

**서명/알림 ntfy 토픽 분리 구조(3종 토픽, priority 5/4/3 차등) + NotificationMessageSchema Zod 스키마(6카테고리, metadata 규격) + SDK subscribeToNotifications()/parseNotification() 시그니처 + WalletNotificationChannel 5단계 필터링 + NotificationEventType 25종 매핑으로 doc 75 Sections 1-5 완성**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-19T15:37:57Z
- **Completed:** 2026-02-19T15:42:52Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- doc 75(알림 채널 + Push Relay Server) 설계 문서 Sections 1-5 완성 (~850줄, 알림 채널 설계 부분)
- Section 1(개요): 문서 목적 + doc 73/74 관계 6개 매핑 + 10개 섹션 목차 미리보기
- Section 2(토픽 분리): 3종 토픽 네이밍(sign/response/notify) + priority 차등(5/4/3) + 카테고리별 매핑 표 + ntfy publish 포맷 + self-hosted ntfy 재사용
- Section 3(NotificationMessage): Zod 스키마 정의(9필드) + 6개 카테고리 + 카테고리별 metadata 규격 표(20+ 필드) + 인코딩 방식 + SignRequest 구분 기준
- Section 4(SDK 알림 API): subscribeToNotifications() 시그니처 + 내부 구현(SSE + EventSource) + parseNotification() + NotificationParseError + @waiaas/wallet-sdk 8개 export 목록
- Section 5(WalletNotificationChannel): INotificationChannel 구현 + send() 5단계 필터링 + NotificationEventType 25종 → 6카테고리 매핑 + ntfy publish + NotificationService 확장 + SettingsService 3키 + Admin UI 와이어프레임 + 파일 구조

## Task Commits

Each task was committed atomically:

1. **Task 1: 문서 개요 + 토픽 분리 구조 + NotificationMessage 스키마 작성** - `1411400` (docs)
2. **Task 2: SDK 알림 API + WalletNotificationChannel 통합 + SettingsService 키 작성** - `44da77d` (docs)

## Files Created/Modified
- `internal/design/75-notification-channel-push-relay.md` - 알림 채널 + Push Relay Server 설계서 (Sections 1-5 실제 내용, Sections 6-10 placeholder)

## Decisions Made
- 서명/알림 토픽 분리: `waiaas-sign-*`/`waiaas-notify-*` 접두어로 동일 ntfy 서버 내에서 구분. 별도 서버 URL 불필요
- ntfy priority 차등: security_alert(Kill Switch/비정상활동)=5, policy_violation=4, 나머지(트랜잭션/세션/시스템)=3
- NotificationMessage `type: 'notification'` 필드로 SignRequest와 메시지 수준 구분 (토픽 수준 + type 필드 이중 구분)
- SDK export 8개: 기존 6개(parseSignRequest/buildSignResponse/formatDisplayMessage/sendViaNtfy/sendViaTelegram/subscribeToRequests) + 신규 2개(subscribeToNotifications/parseNotification)
- WalletNotificationChannel 5단계 필터: (1)walletId 존재 (2)owner_approval_method=sdk_ntfy (3)notifications_enabled (4)카테고리 필터 (5)변환+publish
- NotificationEventType 25종 → NotificationCategory 6종 매핑: TX_CONFIRMED/TX_FAILED/TX_CANCELLED→completed, KILL_SWITCH/WALLET_SUSPENDED→security_alert, CUMULATIVE_LIMIT_WARNING→policy_violation
- SettingsService 알림 키 3개로 doc 74의 6키와 합쳐 총 9개 signing_sdk SettingsService 키 확정

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- doc 75 Sections 1-5 완성으로 m26-02(알림 채널) 구현 시 바로 시작 가능
- Sections 6-10은 Plan 200-02(Push Relay Server 설계)에서 작성 예정
- NOTIF-01/02/03 충족으로 알림 채널 설계 요건 완료

## Self-Check: PASSED

- FOUND: internal/design/75-notification-channel-push-relay.md
- FOUND: .planning/phases/200-notification-channel-push-relay-design/200-01-SUMMARY.md
- FOUND: 1411400 (Task 1 commit)
- FOUND: 44da77d (Task 2 commit)

---
*Phase: 200-notification-channel-push-relay-design*
*Completed: 2026-02-20*
