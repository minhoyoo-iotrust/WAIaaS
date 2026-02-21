---
phase: 222-design-critical-fix
plan: 02
subsystem: design
tags: [incoming-transaction, polling-worker, is_suspicious, BackgroundWorkers, FLOW-2, state-machine]

# Dependency graph
requires:
  - phase: 222-design-critical-fix
    provides: "Plan 01에서 IChainSubscriber connect()/waitForDisconnect() 추가, flush 이벤트 분리 (GAP-1, GAP-4 해결)"
  - phase: 218-websocket-polling-fallback
    provides: "reconnectLoop, 3-state 상태 머신 설계 (D-07~D-09)"
provides:
  - "is_suspicious 컬럼이 DDL, INSERT, 마이그레이션, Summary SQL에 일관 적용"
  - "incoming-tx-poll-solana, incoming-tx-poll-evm 2개 폴링 워커 등록 (Step 6 총 6개)"
  - "SolanaIncomingSubscriber.pollAll() 메서드"
  - "POLLING 상태 진입/이탈 시 폴링 워커 조건부 활성화 메커니즘"
  - "FLOW-2 E2E 흐름 (WS 실패 -> 폴링 활성화 -> TX 감지 -> DB 기록 -> WS 복구)"
affects: [223-design-medium-low-fix]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "is_suspicious DB 전용 컬럼 패턴: IncomingTransaction 타입에는 미포함, DB 레이어에서만 관리"
    - "조건부 폴링 워커 패턴: 항상 등록 + handler 내 connectionState 체크로 활성화/비활성화"
    - "FLOW-2 E2E 흐름: 5단계 (WS 실패 -> 폴링 전환 -> 워커 활성 -> TX 감지/DB -> WS 복귀)"

key-files:
  created: []
  modified:
    - "docs/design/76-incoming-transaction-monitoring.md"

key-decisions:
  - "is_suspicious를 incoming_transactions 컬럼으로 추가 (별도 테이블 대신) -- JOIN 없는 단순 쿼리, 마이그레이션 최소화"
  - "is_suspicious를 IncomingTransaction 타입에 추가하지 않음 -- DB 전용 필드로 IIncomingSafetyRule 평가 후 UPDATE"
  - "pollAll()을 IChainSubscriber 인터페이스에 추가하지 않음 -- 구현체 전용 메서드로 유지"
  - "폴링 워커는 항상 등록 + connectionState 조건부 실행 -- unregister/reregister 복잡도 제거"

patterns-established:
  - "DB 전용 필드 패턴: is_suspicious는 도메인 타입에 미포함, DB + Safety Rule 레이어에서만 관리"
  - "조건부 워커 실행 패턴: multiplexer.connectionState !== 'POLLING' 시 early return"

requirements-completed: [GAP-2, GAP-3, FLOW-2]

# Metrics
duration: 3min
completed: 2026-02-21
---

# Phase 222 Plan 02: 런타임 연결 + 데이터 계층 수정 Summary

**is_suspicious 컬럼으로 미정의 테이블 참조 제거, 2개 폴링 워커 등록으로 POLLING 상태 실제 감지 활성화, FLOW-2 E2E 흐름 5단계 완성**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-21T10:49:26Z
- **Completed:** 2026-02-21T10:53:02Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- incoming_transactions DDL, INSERT, v21 마이그레이션, Summary SQL에서 is_suspicious 컬럼 일관 적용 (GAP-3 해결)
- incoming_tx_suspicious 미정의 테이블 참조 완전 제거
- incoming-tx-poll-solana, incoming-tx-poll-evm 2개 폴링 워커를 Step 6에 등록 (4 -> 6개) (GAP-2 해결)
- SolanaIncomingSubscriber에 pollAll() 메서드 추가 (§3.5 standalone 함수를 클래스 메서드로 통합)
- 상태 머신(§5.1)에 폴링 워커 연동 메커니즘 명시
- FLOW-2 E2E 흐름 5단계 완성 (WS 실패 -> 폴링 전환 -> TX 감지 -> DB 기록 -> WS 복귀)

## Task Commits

Each task was committed atomically:

1. **Task 1: is_suspicious 컬럼 추가 (DDL + 마이그레이션 + INSERT + Summary SQL)** - `cc26304` (docs)
2. **Task 2: 폴링 BackgroundWorker 등록 + SolanaIncomingSubscriber pollAll() + FLOW-2 E2E 완성** - `23137e1` (docs)

## Files Created/Modified
- `docs/design/76-incoming-transaction-monitoring.md` - Section 2.1 DDL is_suspicious, Section 2.6 INSERT is_suspicious, Section 2.7 migration is_suspicious, Section 3.5 cross-reference, Section 3.7 pollAll(), Section 5.1 polling worker linkage, Section 5.2 FLOW-2 E2E, Section 7.6 Summary SQL, Section 8.9 polling workers

## Decisions Made
- is_suspicious를 별도 테이블(incoming_tx_suspicious) 대신 incoming_transactions 컬럼으로 추가 -- Research의 GAP-3 해결 전략 따름, JOIN 없는 단순 쿼리
- is_suspicious를 IncomingTransaction 도메인 타입에 추가하지 않음 -- DB 전용 필드, IIncomingSafetyRule 평가 후 UPDATE로 설정 (Research Open Question 2번)
- pollAll()을 IChainSubscriber 인터페이스에 추가하지 않음 -- 구현체 전용 메서드로 유지, BackgroundWorker가 직접 참조 (Research Open Question 1번)
- 폴링 워커는 항상 등록 상태에서 connectionState 조건부 실행 -- unregister/reregister 없이 단순한 제어

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- GAP-2 (폴링 BackgroundWorker 미등록) 해결 완료
- GAP-3 (Summary SQL 미정의 테이블 참조) 해결 완료
- FLOW-2 (WebSocket -> 폴링 폴백 E2E 흐름) 완성
- Phase 222 전체 완료 (Plan 01 + Plan 02): GAP-1~4 + FLOW-2 총 5건 해결
- Phase 223 (medium/low 불일치 수정) 진행 가능

## Self-Check: PASSED

- FOUND: docs/design/76-incoming-transaction-monitoring.md
- FOUND: .planning/phases/222-design-critical-fix/222-02-SUMMARY.md
- FOUND: cc26304 (Task 1 commit)
- FOUND: 23137e1 (Task 2 commit)

---
*Phase: 222-design-critical-fix*
*Completed: 2026-02-21*
