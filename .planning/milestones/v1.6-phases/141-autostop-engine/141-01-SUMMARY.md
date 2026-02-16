---
phase: 141-autostop-engine
plan: 01
subsystem: security
tags: [autostop, event-bus, kill-switch, wallet-suspension, session-revoke, anomaly-detection]

# Dependency graph
requires:
  - phase: 140-event-bus-kill-switch
    provides: "EventBus typed EventEmitter + KillSwitchService 3-state machine + 6-step cascade"
provides:
  - "AutoStopService 4-rule anomaly detection engine (CONSECUTIVE_FAILURES, UNUSUAL_ACTIVITY, IDLE_TIMEOUT, MANUAL_TRIGGER)"
  - "ConsecutiveFailuresRule / UnusualActivityRule / IdleTimeoutRule 개별 규칙 클래스"
  - "EventBus subscription (transaction:failed, transaction:completed, wallet:activity)"
  - "Runtime config update (updateConfig) + monitoring (getStatus)"
affects: [142-balance-monitoring, 143-telegram-bot, 144-admin-ui-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["in-memory sliding window frequency detection", "periodic idle session check (setInterval)", "fire-and-forget notification pattern"]

key-files:
  created:
    - "packages/daemon/src/services/autostop-rules.ts"
    - "packages/daemon/src/services/autostop-service.ts"
    - "packages/daemon/src/__tests__/autostop-service.test.ts"
  modified: []

key-decisions:
  - "better-sqlite3 직접 SQL 사용 (KillSwitchService와 동일 패턴, Drizzle ORM 불필요)"
  - "월렛 정지 시 WHERE status='ACTIVE' 조건으로 중복 정지 방지"
  - "알림 fire-and-forget (void this.notificationService?.notify(...))"
  - "MANUAL_TRIGGER는 Kill Switch 전체 발동, 나머지 3규칙은 개별 월렛 정지"
  - "규칙 트리거 후 카운터 리셋으로 재축적 필요 (동일 월렛 중복 트리거 방지)"

patterns-established:
  - "AutoStop rule pattern: 순수 인메모리 규칙 클래스 + threshold/window constructor 주입 + updateThreshold() 런타임 변경"
  - "EventBus subscription pattern: start()에서 on() 등록, stop()에서 timer만 정리 (리스너는 유지)"

# Metrics
duration: 5min
completed: 2026-02-16
---

# Phase 141 Plan 01: AutoStopService 4 규칙 구현 + EventBus 이벤트 구독 Summary

**AutoStopService 4 규칙 엔진: 연속 실패 5회 월렛 정지 + 이상 빈도 감지 + 유휴 세션 자동 해지 + 수동 Kill Switch 트리거**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-16T05:49:17Z
- **Completed:** 2026-02-16T05:53:57Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- ConsecutiveFailuresRule: 월렛별 연속 실패 카운팅, 5회(설정 가능) 도달 시 자동 SUSPENDED 전환
- UnusualActivityRule: 슬라이딩 윈도우(기본 300초) 내 빈도 감지, 20회(설정 가능) 초과 시 월렛 정지
- IdleTimeoutRule: 세션별 마지막 활동 추적, 유휴 시간 초과 시 자동 세션 해지 (revoked_at 설정)
- MANUAL_TRIGGER: KillSwitchService.activateWithCascade() 호출로 전체 Kill Switch 발동
- 18개 단위 테스트 전체 통과 (기존 1389개 테스트 회귀 없음, 사전 존재 실패 1개 제외)

## Task Commits

Each task was committed atomically:

1. **Task 1: autostop-rules.ts + autostop-service.ts 구현** - `19d3e96` (feat)
2. **Task 2: AutoStopService 18개 단위 테스트** - `84a723a` (test)

## Files Created/Modified
- `packages/daemon/src/services/autostop-rules.ts` - ConsecutiveFailuresRule, UnusualActivityRule, IdleTimeoutRule 3개 순수 인메모리 규칙 클래스
- `packages/daemon/src/services/autostop-service.ts` - AutoStopService: EventBus 구독 + 4 규칙 + suspendWallet + revokeSession + updateConfig + getStatus
- `packages/daemon/src/__tests__/autostop-service.test.ts` - 18개 단위 테스트 (4 규칙 + EventBus 통합 + 중복 정지 방지 + audit_log + 런타임 설정 변경)

## Decisions Made
- better-sqlite3 직접 SQL 사용 -- KillSwitchService와 동일 패턴, ORM 불필요한 단순 UPDATE/INSERT
- 월렛 정지 시 `WHERE status = 'ACTIVE'` 조건 포함하여 이미 SUSPENDED인 월렛 중복 처리 방지
- 알림은 fire-and-forget (`void this.notificationService?.notify(...)`) -- 알림 실패가 규칙 엔진에 영향 주지 않음
- EventBus stop() 시 리스너 제거 안 함 (EventBus는 공유 자원, timer만 정리)
- 규칙 트리거 후 카운터 즉시 리셋 -- 동일 월렛이 재활성화되면 처음부터 다시 N회 실패해야 재트리거

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- AutoStopService가 EventBus 구독 + 4 규칙을 완전 구현하여 Phase 141-02 (REST API + config.toml 통합)에서 서비스 등록 및 라우트 연결 준비 완료
- Phase 142 BalanceMonitorService가 동일 EventBus 패턴으로 구독 가능
- Phase 144 Admin UI에서 AutoStop config 조회/수정 시 updateConfig() + getStatus() API 연결 가능

## Self-Check: PASSED

- [x] autostop-rules.ts FOUND
- [x] autostop-service.ts FOUND
- [x] autostop-service.test.ts FOUND
- [x] 141-01-SUMMARY.md FOUND
- [x] Commit 19d3e96 FOUND
- [x] Commit 84a723a FOUND

---
*Phase: 141-autostop-engine*
*Completed: 2026-02-16*
