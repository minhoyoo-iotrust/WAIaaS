---
phase: 222-design-critical-fix
plan: 01
subsystem: design
tags: [IChainSubscriber, eventBus, WaiaasEventMap, incoming-transaction, interface-design]

# Dependency graph
requires:
  - phase: 215-ichainsubscriber-db-schema
    provides: "IChainSubscriber 인터페이스 초기 설계 (D-01)"
  - phase: 218-websocket-polling-fallback
    provides: "reconnectLoop, 상태 머신 설계 (D-07~D-09)"
provides:
  - "IChainSubscriber 6메서드 인터페이스 (connect/waitForDisconnect 추가)"
  - "flush() -> IncomingTransaction[] 반환 타입 변경"
  - "개별 TX 이벤트 발행 패턴 (transaction:incoming per TX)"
  - "'incoming:flush:complete' 내부 오케스트레이션 이벤트"
affects: [222-02, 223-design-medium-low-fix]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IChainSubscriber connect()/waitForDisconnect() 패턴: WebSocket 구현체는 실제 연결, 폴링 구현체는 no-op/never-resolve"
    - "flush 이벤트 분리 패턴: 개별 TX 이벤트(transaction:incoming) + 집계 이벤트(incoming:flush:complete)"

key-files:
  created: []
  modified:
    - "internal/design/76-incoming-transaction-monitoring.md"

key-decisions:
  - "IChainSubscriber에 connect()/waitForDisconnect()를 필수 메서드로 추가 (optional 아닌 required)"
  - "EVM 폴링 전용 구현체는 connect() no-op + waitForDisconnect() never-resolving Promise"
  - "flush() 반환 타입을 number에서 IncomingTransaction[]로 변경하여 개별 TX 이벤트 발행 지원"
  - "집계 이벤트를 'incoming:flush:complete'로 분리하여 'transaction:incoming' 이벤트명 보존"

patterns-established:
  - "폴링 전용 구현체의 connect()/waitForDisconnect() no-op 패턴"
  - "flush 후 개별 TX 이벤트 + 집계 내부 이벤트 분리 패턴"

requirements-completed: [GAP-1, GAP-4]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 222 Plan 01: IChainSubscriber/타입 계층 수정 Summary

**IChainSubscriber에 connect()/waitForDisconnect() 추가하여 reconnectLoop 인터페이스 일관성 확보, flush 이벤트를 개별 TX 발행 + 집계 분리로 IncomingTxEvent 타입 통일**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T10:43:57Z
- **Completed:** 2026-02-21T10:46:30Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- IChainSubscriber 인터페이스를 4메서드에서 6메서드로 확장 (connect, waitForDisconnect 추가)
- SolanaIncomingSubscriber에 WebSocket connect/waitForDisconnect 구현 추가
- EvmIncomingSubscriber에 no-op connect/never-resolving waitForDisconnect 추가
- flush() 반환 타입을 IncomingTransaction[]로 변경하여 개별 TX 이벤트 발행 가능
- WaiaasEventMap에 'incoming:flush:complete' 내부 오케스트레이션 이벤트 추가

## Task Commits

Each task was committed atomically:

1. **Task 1: IChainSubscriber 인터페이스에 connect()/waitForDisconnect() 추가 + 구현체 반영** - `439396f` (docs)
2. **Task 2: eventBus.emit 타입 통일 + WaiaasEventMap 내부 이벤트 추가** - `09addb2` (docs)

## Files Created/Modified
- `internal/design/76-incoming-transaction-monitoring.md` - Section 1.4 인터페이스 확장, Section 3.7 Solana 구현체, Section 4.7 EVM 구현체, Section 2.6 flush 패턴/이벤트 발행, Section 6.1 WaiaasEventMap

## Decisions Made
- IChainSubscriber에 connect()/waitForDisconnect()를 optional이 아닌 required 메서드로 추가 -- TypeScript에서 optional 인터페이스는 런타임 체크 필요하여 복잡도 증가
- EVM 폴링 전용 구현체의 waitForDisconnect()는 never-resolving Promise 반환 -- reconnectLoop가 EVM에 대해 connect() 즉시 성공 후 무한 대기하는 구조
- flush() 반환 타입을 IncomingTransaction[]로 변경 -- 개별 TX에 대한 이벤트 발행을 위해 삽입된 TX 목록 필요
- 집계 이벤트를 'incoming:flush:complete'로 분리 -- 기존 'transaction:incoming' 이벤트명은 알림 트리거용으로 유지 필요 (Section 6.4 연동)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GAP-1 (IChainSubscriber connect/waitForDisconnect 미정의) 해결 완료
- GAP-4 (eventBus.emit 타입 충돌) 해결 완료
- Plan 222-02 (GAP-2, GAP-3, FLOW-2 런타임 연결 수정) 진행 가능

## Self-Check: PASSED

- FOUND: internal/design/76-incoming-transaction-monitoring.md
- FOUND: .planning/phases/222-design-critical-fix/222-01-SUMMARY.md
- FOUND: 439396f (Task 1 commit)
- FOUND: 09addb2 (Task 2 commit)

---
*Phase: 222-design-critical-fix*
*Completed: 2026-02-21*
