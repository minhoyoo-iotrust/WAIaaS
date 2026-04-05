---
phase: 31-데이터-모델-타입-기반-설계
plan: 02
subsystem: database, api
tags: [IChainAdapter, sweepAll, OwnerState, BEGIN-IMMEDIATE, resolveOwnerState, markOwnerVerified]

# Dependency graph
requires:
  - phase: 06-core-architecture-design
    provides: IChainAdapter 19 메서드 인터페이스 (CORE-04)
  - phase: 08-security-layers-design
    provides: BEGIN IMMEDIATE 패턴, DatabasePolicyEngine (LOCK-MECH)
provides:
  - IChainAdapter.sweepAll (20번째 메서드) 시그니처 + JSDoc + SolanaAdapter/EvmStub 구현 지침
  - resolveOwnerState() 순수 함수 유틸리티 (AgentOwnerInfo -> OwnerState)
  - markOwnerVerified() Grace->Locked BEGIN IMMEDIATE 원자화 설계
  - 인터페이스 변경 이력 테이블 (19 -> 20 메서드)
affects:
  - Phase 32 (OwnerLifecycleService): markOwnerVerified() 호출 위치 명세
  - Phase 33 (다운그레이드 로직): resolveOwnerState()로 OwnerState 산출
  - Phase 34 (WithdrawService): sweepAll 메서드 호출
  - Phase 34 (KillSwitchService): resolveOwnerState() 복구 대기 분기

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sweepAll 정책 우회 패턴: 수신 주소 고정 + masterAuth 인증"
    - "resolveOwnerState() 파생 상태 패턴: DB 저장 없이 런타임 산출"
    - "BEGIN IMMEDIATE + WHERE <current_state> = <expected_value> idempotency 패턴"

key-files:
  created: []
  modified:
    - ".planning/deliverables/27-chain-adapter-interface.md"
    - ".planning/deliverables/33-time-lock-approval-mechanism.md"

key-decisions:
  - "sweepAll은 정책 엔진을 우회한다 -- 수신 주소가 owner_address로 고정되므로 공격자 이득 없음"
  - "OwnerState는 DB에 저장하지 않는다 -- owner_address + owner_verified 조합에서 런타임 산출"
  - "Grace->Locked 전이는 BEGIN IMMEDIATE + WHERE owner_verified = 0으로 직렬화"
  - "owner_verified 전이 타임스탬프는 audit_log 이벤트로 추적 (컬럼 추가 없음)"

patterns-established:
  - "sweepAll 실행 순서: getAssets -> 토큰 배치 전송 -> SOL/네이티브 마지막"
  - "순수 함수 상태 산출: resolveOwnerState()로 DB 컬럼 조합에서 enum 파생"
  - "idempotent 상태 전이: UPDATE WHERE + changes > 0 반환 패턴"

# Metrics
duration: 5min
completed: 2026-02-08
---

# Phase 31 Plan 02: sweepAll 시그니처 + resolveOwnerState + Grace->Locked 원자화 설계 Summary

**IChainAdapter에 sweepAll 20번째 메서드 시그니처를 추가하고, resolveOwnerState() 순수 함수 유틸리티와 Grace->Locked BEGIN IMMEDIATE 원자화 설계를 확정**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-08T14:45:23Z
- **Completed:** 2026-02-08T14:50:36Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- IChainAdapter 인터페이스에 sweepAll(from, to): Promise<SweepResult> 20번째 메서드 추가 (WITHDRAW-06)
- SolanaAdapter 구현 지침(getAssets -> SPL 토큰 배치 전송+closeAccount -> SOL 마지막) 명세
- EvmStub NOT_IMPLEMENTED 스텁 설계
- resolveOwnerState() 순수 함수: AgentOwnerInfo 입력 -> OwnerState(NONE/GRACE/LOCKED) 출력 산출 로직 확정 (OWNER-07)
- markOwnerVerified() BEGIN IMMEDIATE + WHERE owner_verified = 0 원자화 설계 (OWNER-08)
- Race condition 방어, idempotency, 감사 로그(OWNER_VERIFIED) 설계 완료
- BEGIN IMMEDIATE 패턴 일관성 테이블에 v0.8 항목 추가

## Task Commits

Each task was committed atomically:

1. **Task 1: IChainAdapter.sweepAll 시그니처를 27-chain-adapter-interface.md에 반영** - `718ffc3` (feat)
2. **Task 2: resolveOwnerState() + Grace->Locked 원자화 설계를 33-time-lock-approval-mechanism.md에 반영** - `d4ab11f` (feat)

## Files Created/Modified

- `.planning/deliverables/27-chain-adapter-interface.md` - IChainAdapter.sweepAll 20번째 메서드 추가, SolanaAdapter/EvmStub 구현 지침, 인터페이스 변경 이력
- `.planning/deliverables/33-time-lock-approval-mechanism.md` - resolveOwnerState() 유틸리티, markOwnerVerified() BEGIN IMMEDIATE, race condition 방어, 감사 로그

## Decisions Made

1. **sweepAll 정책 엔진 우회:** 수신 주소가 agents.owner_address로 고정되어 공격자가 자금을 탈취할 수 없으므로, 정책 엔진(SPENDING_LIMIT 등)을 우회하여 WithdrawService에서 직접 호출한다. 정책이 자금 회수를 차단하면 Owner가 자신의 자금을 회수할 수 없는 역설이 발생한다.

2. **OwnerState DB 비저장:** OwnerState를 별도 컬럼으로 저장하면 owner_address/owner_verified와의 동기화 오류가 발생할 수 있다. 순수 함수로 런타임 산출하여 단일 진실 원천(SSoT)을 유지한다.

3. **owner_verified 타임스탬프 비저장:** "언제 verified되었는가"는 audit_log의 OWNER_VERIFIED 이벤트 created_at으로 추적한다. owner_verified 컬럼은 boolean으로 유지하여 스키마 단순성을 보존한다.

4. **SOL 마지막 전송 (WITHDRAW-07):** 토큰 전송 tx fee를 SOL로 지불해야 하므로, 모든 토큰 전송 + closeAccount 완료 후 SOL 잔액에서 fee를 차감하여 전량 전송한다.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- WITHDRAW-06 충족: Phase 34 WithdrawService가 sweepAll 시그니처 참조 가능
- OWNER-07 충족: Phase 32/33에서 resolveOwnerState()로 OwnerState 기반 분기 설계 가능
- OWNER-08 충족: Phase 32 OwnerLifecycleService가 markOwnerVerified() 호출 위치를 명세할 기반 확보
- BEGIN IMMEDIATE 패턴 일관성: 기존 5개 사용처와 동일한 패턴으로 추가

## Self-Check: PASSED

---
*Phase: 31-데이터-모델-타입-기반-설계*
*Completed: 2026-02-08*
