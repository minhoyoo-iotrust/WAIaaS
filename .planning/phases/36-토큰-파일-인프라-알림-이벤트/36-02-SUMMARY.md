---
phase: 36-토큰-파일-인프라-알림-이벤트
plan: 02
subsystem: notifications
tags: [session-expiring-soon, notification-event, zod-schema, dedup, notification-log, session-renewal]

# Dependency graph
requires:
  - phase: 08-security-layers-design
    provides: 35-notification-architecture.md (16개 NotificationEventType, notification_log 테이블)
  - phase: 20-session-renewal-protocol
    provides: 53-session-renewal-protocol.md (5종 안전 장치, 갱신 서비스 코드 패턴)
provides:
  - SESSION_EXPIRING_SOON 이벤트 타입 (17번째 NotificationEventType)
  - SessionExpiringSoonDataSchema Zod 스키마
  - shouldNotifyExpiringSession 순수 함수 설계
  - 갱신 성공/실패 양 경로 알림 트리거 설계
  - notification_log 기반 중복 알림 방지 메커니즘
affects:
  - 37-mcp-sessionmanager-설계 (SessionManager가 갱신 실패 시 SESSION_EXPIRING_SOON 참조)
  - 38-sdk-mcp-interface (MCP 세션 관리 섹션에서 알림 트리거 참조)
  - 39-cli-telegram-세션-연동 (Telegram /newsession이 SESSION_EXPIRING_SOON 알림에서 트리거)
  - 40-테스트-설계-문서-통합 (T-14 시나리오: SESSION_EXPIRING_SOON 알림 테스트)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "notification_log 기반 중복 알림 방지 (DB 조회로 idempotent 알림)"
    - "shouldNotifyExpiringSession 순수 함수 패턴 (판단과 부수효과 분리)"
    - "갱신 실패 경로 보완 알림 (데몬 재시작에도 최소 1회 알림 보장)"

key-files:
  created: []
  modified:
    - ".planning/deliverables/35-notification-architecture.md"
    - ".planning/deliverables/53-session-renewal-protocol.md"
    - "objectives/v0.9-session-management-automation.md"

key-decisions:
  - "데몬 측 자동 판단: MCP SessionManager가 별도 알림을 발송하지 않고, 데몬이 갱신 API 처리 시 자동으로 만료 임박 판단"
  - "notification_log 중복 방지: sessions 테이블 컬럼 추가나 인메모리 Set 대신 기존 알림 로그 인프라 활용"
  - "OR 논리 트리거: 잔여 갱신 3회 이하 OR 절대 수명 24시간 전 -- 두 조건 중 하나만 충족해도 알림"
  - "갱신 실패 경로 보완 알림: Guard 1/2 실패 시에도 미발송이면 보완 발송하여 Owner에게 최소 1회 알림 보장"
  - "shouldNotifyExpiringSession 순수 함수: 부수효과 없는 판단 함수로 테스트 용이, 호출부에서 중복 확인 + 발송 담당"

patterns-established:
  - "알림 이벤트 확장 패턴: NotificationEventType enum + 심각도 테이블 + 호출 포인트 테이블 + Zod 스키마 + 채널별 메시지 템플릿 + 중복 방지 메커니즘을 일괄 추가"
  - "갱신 서비스 내 알림 판단 삽입: 갱신 성공/실패 양 경로에 fire-and-forget 알림 트리거 삽입"

# Metrics
duration: 5min
completed: 2026-02-09
---

# Phase 36 Plan 02: SESSION_EXPIRING_SOON 알림 이벤트 설계 Summary

**SESSION_EXPIRING_SOON 이벤트를 17번째 NotificationEventType으로 추가하고, 데몬 SessionService 갱신 로직에 shouldNotifyExpiringSession 순수 함수 기반 만료 임박 판단 + notification_log 중복 방지 메커니즘을 설계**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-09T06:46:28Z
- **Completed:** 2026-02-09T06:51:58Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments
- NotificationEventType 열거형을 16개에서 17개로 확장하여 SESSION_EXPIRING_SOON 추가
- 심각도 WARNING, notify() 전송 방식, SessionExpiringSoonDataSchema Zod 스키마, 채널별 메시지 템플릿(Telegram/Discord/ntfy.sh) 정의
- shouldNotifyExpiringSession 순수 함수 설계 (OR 논리: remainingRenewals <= 3 OR timeToExpiry <= 86400초)
- 갱신 성공(200 OK) 후 + 갱신 실패(403 RENEWAL_LIMIT_REACHED, SESSION_LIFETIME_EXCEEDED) 양쪽 경로에 알림 트리거 삽입
- notification_log 테이블 기반 중복 알림 방지 메커니즘 정의 (isExpiringSoonAlreadySent 함수)
- v0.9 objectives에 NOTI-01, NOTI-02 설계 완료 상태 반영

## Task Commits

Each task was committed atomically:

1. **Task 1: 35-notification-architecture.md에 SESSION_EXPIRING_SOON 이벤트 추가** - `996b44c` (docs)
2. **Task 2: 53-session-renewal-protocol.md에 만료 임박 판단 로직 추가** - `38fe1eb` (docs)

**Plan metadata:** (pending)

## Files Created/Modified
- `.planning/deliverables/35-notification-architecture.md` - SESSION_EXPIRING_SOON 이벤트 타입 추가 (enum, 심각도, 호출 포인트, Zod 스키마, 메시지 템플릿, 중복 방지)
- `.planning/deliverables/53-session-renewal-protocol.md` - 섹션 5.6 추가 (shouldNotifyExpiringSession, 성공/실패 경로 알림, 시퀀스 다이어그램)
- `objectives/v0.9-session-management-automation.md` - NOTI-01, NOTI-02 설계 완료 상태 반영, Phase 36-02 설계 결과 섹션 추가

## Decisions Made

1. **데몬 측 자동 판단 선택:** MCP SessionManager가 별도 알림을 보내지 않고, 데몬이 갱신 API 처리 시 자동으로 만료 임박 여부를 판단한다. 이유: 알림 로직의 단일 소유자(데몬)를 유지하여 중복 발송 위험 제거.

2. **notification_log 기반 중복 방지:** sessions 테이블에 `expiring_notified_at` 컬럼 추가 대신 기존 notification_log 테이블 조회 방식을 선택. 이유: DB 스키마 변경 최소화, 관심사 분리(세션 테이블은 인증/수명 전용, 알림 상태는 알림 인프라에 위임), 데몬 재시작에도 상태 유지.

3. **OR 논리 트리거 조건:** 잔여 갱신 3회 이하 OR 절대 수명 24시간 전. AND가 아닌 OR로 설계하여 어느 한쪽이라도 임박하면 알림을 발송한다.

4. **갱신 실패 경로 보완 알림:** Guard 1(RENEWAL_LIMIT_REACHED) 또는 Guard 2(SESSION_LIFETIME_EXCEEDED) 실패 시에도 이전에 알림이 발송되지 않았으면 보완 발송. 근거: 데몬 재시작이나 타이밍 이슈로 성공 경로에서 놓칠 수 있으므로, 실패 경로에서 최소 1회 알림을 보장한다.

5. **shouldNotifyExpiringSession 순수 함수:** 부수효과 없이 판단만 수행하는 순수 함수로 설계. 중복 확인(notification_log 조회)과 알림 발송(notify)은 호출부(SessionService)에서 처리. 이유: 테스트 용이성, 관심사 분리.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 36 (토큰 파일 인프라 + 알림 이벤트) 2개 플랜 모두 완료
- Phase 37 (MCP SessionManager 설계)에서 SESSION_EXPIRING_SOON 알림 트리거를 SessionManager 갱신 실패 처리(1.5절)에서 참조
- Phase 39 (CLI + Telegram 세션 연동)에서 Telegram /newsession 명령어가 SESSION_EXPIRING_SOON 알림으로 트리거되는 플로우 설계 필요
- Phase 40 (테스트 설계 + 문서 통합)에서 T-14 시나리오(SESSION_EXPIRING_SOON 알림 Integration 테스트) 설계 검증

## Self-Check: PASSED

---
*Phase: 36-토큰-파일-인프라-알림-이벤트*
*Completed: 2026-02-09*
