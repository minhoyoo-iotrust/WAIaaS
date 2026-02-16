---
phase: 149-telegram-fallback
plan: 01
subsystem: infra
tags: [walletconnect, telegram, fallback, eventbus, notification, approval]

# Dependency graph
requires:
  - phase: 148-wc-signing
    provides: WcSigningBridge fire-and-forget 서명 요청
provides:
  - WcSigningBridge Telegram fallback (세션 없음/타임아웃/에러 시 자동 전환)
  - approval_channel='telegram' DB 추적 (approve/reject)
  - ApprovalChannelSwitchedEvent EventBus 이벤트
  - APPROVAL_CHANNEL_SWITCHED 알림 타입 + en/ko i18n 템플릿
  - WcSigningBridge DI에 notificationService + eventBus 주입
affects: [149-02 (테스트), admin-ui (approval_channel 표시)]

# Tech tracking
tech-stack:
  added: []
  patterns: [approval-channel-fallback, eventbus-channel-switch]

key-files:
  created: []
  modified:
    - packages/core/src/events/event-types.ts
    - packages/core/src/events/index.ts
    - packages/core/src/enums/notification.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/services/wc-signing-bridge.ts
    - packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/daemon/src/__tests__/notification-channels.test.ts

key-decisions:
  - "fallbackToTelegram은 isApprovalStillPending 체크로 이미 처리된 approval 보호"
  - "사용자 명시적 거부(4001/5000)는 fallback 없이 기존 reject 유지"
  - "notificationService/eventBus는 optional DI (WC 없이도 데몬 동작)"

patterns-established:
  - "approval-channel-fallback: WC 실패 시 approval_channel DB 업데이트 + EventBus + 알림"
  - "Telegram approve/reject에 approval_channel='telegram' 명시적 기록"

# Metrics
duration: 6min
completed: 2026-02-16
---

# Phase 149 Plan 01: Telegram Fallback Summary

**WcSigningBridge에 Telegram fallback 로직 추가 -- WC 세션 없음/타임아웃/에러 시 approval_channel을 telegram으로 전환하고 EventBus + 알림 발행**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-16T11:50:57Z
- **Completed:** 2026-02-16T11:57:32Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- WcSigningBridge에 fallbackToTelegram/isApprovalStillPending 메서드 추가, 3개 guard clause + 2개 에러 분기에서 fallback 트리거
- EventBus 'approval:channel-switched' 이벤트 + APPROVAL_CHANNEL_SWITCHED 알림 타입 + en/ko i18n 템플릿 완성
- TelegramBotService handleApprove/handleReject에 approval_channel='telegram' SQL 추가
- daemon.ts DI 배선에 notificationService + eventBus 주입

## Task Commits

Each task was committed atomically:

1. **Task 1: EventBus 이벤트 + 알림 타입 + i18n 템플릿** - `e0e51c2` (feat)
2. **Task 2: WcSigningBridge fallback + Telegram approval_channel + DI 배선** - `aaadc33` (feat)

## Files Created/Modified
- `packages/core/src/events/event-types.ts` - ApprovalChannelSwitchedEvent 인터페이스 + WaiaasEventMap 확장
- `packages/core/src/events/index.ts` - ApprovalChannelSwitchedEvent export 추가
- `packages/core/src/enums/notification.ts` - APPROVAL_CHANNEL_SWITCHED 알림 이벤트 타입 추가
- `packages/core/src/i18n/en.ts` - APPROVAL_CHANNEL_SWITCHED 영문 템플릿
- `packages/core/src/i18n/ko.ts` - APPROVAL_CHANNEL_SWITCHED 한글 템플릿
- `packages/daemon/src/services/wc-signing-bridge.ts` - fallbackToTelegram + isApprovalStillPending + DI 필드
- `packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts` - approve/reject SQL에 approval_channel 추가
- `packages/daemon/src/lifecycle/daemon.ts` - WcSigningBridge DI에 notificationService + eventBus
- `packages/daemon/src/__tests__/notification-channels.test.ts` - 이벤트 카운트 24->25 수정

## Decisions Made
- fallbackToTelegram은 isApprovalStillPending 체크로 이미 처리된 approval 보호 (race condition 방지)
- 사용자 명시적 거부(4001/5000)는 fallback 없이 기존 reject 유지 (의도적 거부는 채널 전환 불필요)
- notificationService/eventBus는 optional DI (WC 없이도 데몬 정상 동작)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] notification-channels.test.ts 이벤트 카운트 수정**
- **Found during:** Task 2 (검증 단계)
- **Issue:** NOTIFICATION_EVENT_TYPES 배열에 APPROVAL_CHANNEL_SWITCHED 추가로 카운트가 24에서 25로 변경, 기존 테스트 실패
- **Fix:** 테스트 기대값을 24에서 25로 수정
- **Files modified:** packages/daemon/src/__tests__/notification-channels.test.ts
- **Verification:** 1,598 테스트 전체 통과
- **Committed in:** aaadc33 (Task 2 commit)

**2. [Rule 2 - Missing] ApprovalChannelSwitchedEvent export 추가**
- **Found during:** Task 1 (검증 단계)
- **Issue:** events/index.ts에서 새 인터페이스를 export하지 않아 외부 패키지에서 타입 참조 불가
- **Fix:** events/index.ts에 ApprovalChannelSwitchedEvent export 추가
- **Files modified:** packages/core/src/events/index.ts
- **Verification:** pnpm build 성공
- **Committed in:** e0e51c2 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** 두 수정 모두 정확성을 위해 필수. 범위 확장 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- fallback 로직 구현 완료, 149-02에서 단위/통합 테스트 작성 준비 완료
- WcSigningBridge + TelegramBotService 모두 빌드/테스트 통과

## Self-Check: PASSED

- All 9 modified files verified to exist on disk
- Both task commits (e0e51c2, aaadc33) verified in git log
- Full build: 8 packages successful
- Full daemon tests: 1,598 passed, 0 failed

---
*Phase: 149-telegram-fallback*
*Completed: 2026-02-16*
