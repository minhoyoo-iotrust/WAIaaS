---
phase: 33-정책-다운그레이드-알림-설계
plan: 02
subsystem: notifications
tags: [notification, telegram, discord, ntfy, approval, downgrade, owner, template]

# Dependency graph
requires:
  - phase: 31-데이터-모델-타입-기반-설계
    provides: PolicyDecision.downgraded/originalTier optional 필드
  - phase: 33-01
    provides: evaluate() Step 9.5 다운그레이드 로직, TX_DOWNGRADED 감사 로그
provides:
  - TX_DOWNGRADED_DELAY NotificationEventType (16번째 이벤트)
  - 3채널 다운그레이드 알림 템플릿 (Telegram/Discord/ntfy.sh)
  - 3채널 APPROVAL 승인/거부 버튼 명세
  - 승인/거부 URL 보안 고려사항
affects: [35-DX-설계-문서-통합, 구현 Phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TX_DOWNGRADED_DELAY 이벤트로 다운그레이드 알림과 일반 DELAY 알림 분리"
    - "Telegram url 기반 InlineKeyboard (callback_data 아님) -- ownerAuth 필수이므로"
    - "Discord Webhook Button 미지원 -> Embed markdown 링크 대체"
    - "ntfy.sh Actions view 타입만 (http 타입 불가 -- ownerAuth 없이 API 호출 불가)"

key-files:
  created: []
  modified:
    - ".planning/deliverables/35-notification-architecture.md"

key-decisions:
  - "TX_DOWNGRADED_DELAY를 별도 이벤트로 분리 (TX_DELAY_QUEUED + metadata 방식 대신)"
  - "Telegram 승인/거부 버튼은 url 기반 (callback_data 아님) -- ownerAuth 서명이 필요하므로 브라우저 이동 필수"
  - "Discord Webhook은 Button 미지원 -- Embed markdown 링크로 대체, Bot 전환 시 업그레이드 가능"
  - "ntfy.sh Actions는 view 타입만 사용 -- http 타입은 ownerAuth 서명 불가"
  - "TX_APPROVAL_REQUEST 호출 조건에 !decision.downgraded + OwnerState LOCKED만 명시"

patterns-established:
  - "다운그레이드 알림 템플릿에 CLI 명령어(waiaas agent set-owner) 포함하여 보안 강화 자발적 유도"
  - "승인/거부 URL에 nonce 바인딩 + ownerAuth 서명 필수 -- 버튼 클릭만으로 승인 불가"

# Metrics
duration: 4min
completed: 2026-02-09
---

# Phase 33 Plan 02: 알림 이벤트 + 다운그레이드 템플릿 + APPROVAL 버튼 명세 Summary

**TX_DOWNGRADED_DELAY 이벤트를 16번째 NotificationEventType으로 추가하고, 3채널(Telegram/Discord/ntfy.sh) 다운그레이드 알림 템플릿에 Owner 등록 CLI 안내를 포함시키며, APPROVAL 승인/거부 버튼을 채널별 제약에 맞게 명세 완료**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-08T23:30:30Z
- **Completed:** 2026-02-08T23:34:21Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- TX_DOWNGRADED_DELAY 이벤트를 enum, 심각도 매핑, 호출 포인트 3곳에 일관되게 추가 (15 -> 16개)
- 3채널 다운그레이드 알림 템플릿에 `waiaas agent set-owner` CLI 안내 메시지 포함
- TX_DELAY_QUEUED vs TX_DOWNGRADED_DELAY 차이점 테이블로 명확한 구분
- APPROVAL 승인/거부 버튼을 채널별 제약에 맞게 명세 (Telegram url 버튼, Discord Embed 링크, ntfy.sh Actions view)
- 승인/거부 URL 보안 고려사항 테이블 추가 (nonce 1회용, localhost 한정, ownerAuth 필수)

## Task Commits

Each task was committed atomically:

1. **Task 1: TX_DOWNGRADED_DELAY 이벤트 추가 + 채널별 다운그레이드 알림 템플릿 설계** - `61c065b` (feat)
2. **Task 2: APPROVAL 대기 알림 [승인]/[거부] 버튼 채널별 명세** - `208259a` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `.planning/deliverables/35-notification-architecture.md` - TX_DOWNGRADED_DELAY 이벤트 + 다운그레이드 템플릿 3채널 + APPROVAL 승인/거부 버튼 3채널 + 보안 고려사항

## Decisions Made
- **TX_DOWNGRADED_DELAY 별도 이벤트 분리:** TX_DELAY_QUEUED + metadata.downgraded 방식 대신 별도 이벤트 타입으로 분리. 채널 어댑터가 이벤트 타입으로 포맷을 결정하므로 깔끔한 분기. 기존 TX_DELAY_QUEUED 템플릿 변경 불필요 (하위 호환)
- **Telegram url 기반 InlineKeyboard:** callback_data 대신 url 사용. 승인 시 ownerAuth(SIWS/SIWE 서명)가 필요하므로 Telegram callback만으로는 승인 불가
- **Discord Webhook Button 미지원 명시:** Embed markdown 링크로 승인/거부 URL 안내. Bot Token 전환 시 Button Component 업그레이드 가능 경로 제시
- **ntfy.sh view 타입 전용:** http 타입(직접 API 호출)은 ownerAuth 서명 없이 호출 불가하므로 사용 안 함
- **TX_APPROVAL_REQUEST 호출 조건 갱신:** decision.tier === 'APPROVAL' && !decision.downgraded (= OwnerState LOCKED만)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- NOTIF-01 충족: 다운그레이드 알림에 Owner 등록 안내 포함
- NOTIF-02 충족: APPROVAL 대기 알림에 승인/거부 버튼 표시
- Phase 33 Plan 01과 함께 Phase 33 전체 완료 조건 충족 대기
- Phase 34(자금 회수 + 보안 분기 설계) 진행 가능

## Self-Check: PASSED

---
*Phase: 33-정책-다운그레이드-알림-설계*
*Completed: 2026-02-09*
