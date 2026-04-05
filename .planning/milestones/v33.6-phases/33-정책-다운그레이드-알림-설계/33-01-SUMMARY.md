---
phase: 33-정책-다운그레이드-알림-설계
plan: 01
subsystem: policy-engine
tags: [evaluate, step-9.5, downgrade, APPROVAL-to-DELAY, resolveOwnerState, evaluateBatch, TX_DOWNGRADED, audit-log]

# Dependency graph
requires:
  - phase: 31-데이터-모델-타입-기반-설계
    provides: PolicyDecision.downgraded/originalTier optional 필드, OwnerState 타입, resolveOwnerState() 유틸리티
  - phase: 08-security-layers-design
    provides: DatabasePolicyEngine evaluate() 11단계 알고리즘, SPENDING_LIMIT 규칙
provides:
  - evaluate() Step 9.5 APPROVAL->DELAY 다운그레이드 로직 (삽입 지점, 분기 조건, delaySeconds 결정)
  - evaluate() 시그니처 v0.8 확장 (agentOwnerInfo optional 파라미터)
  - evaluateBatch() 합산 티어 다운그레이드
  - TX_DOWNGRADED 감사 로그 이벤트 정의
  - Owner LOCKED 후 정상 APPROVAL 복원 흐름
  - Stage 4 다운그레이드 분기 (metadata 저장 + 알림 분기)
affects:
  - 33-02 (TX_DOWNGRADED_DELAY 알림 템플릿이 이 다운그레이드 로직의 결과를 소비)
  - 35 (14개 설계 문서 통합 시 evaluate() Step 9.5 반영)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Step 9.5 삽입 패턴: evaluate() 알고리즘 내 조건부 다운그레이드 + return으로 후속 단계 스킵"
    - "합산 다운그레이드: evaluateBatch()에서 개별 instruction 다운그레이드 불적용, 합산 tierDecision에만 1회"
    - "Stage 4 알림 분기: PolicyDecision.downgraded 기반 TX_DOWNGRADED_DELAY vs TX_DELAY_QUEUED"

key-files:
  created: []
  modified:
    - .planning/deliverables/33-time-lock-approval-mechanism.md

key-decisions:
  - "evaluate() 시그니처에 optional agentOwnerInfo 추가 -- IPolicyEngine 인터페이스 미변경 (하위 호환)"
  - "Step 9.5에서 return으로 Step 10 스킵 -- APPROVE_TIER_OVERRIDE가 다운그레이드 복원하는 것 방지"
  - "delaySeconds: SPENDING_LIMIT delay_seconds 우선, fallback 300초, 최소 60초 보장"
  - "TX_DOWNGRADED를 독립 감사 이벤트로 추가 -- audit_log 쿼리 직접 집계 지원"
  - "evaluateBatch()에서 개별 instruction 다운그레이드 불적용 -- 합산 1회만 (이중 다운그레이드 방지)"

patterns-established:
  - "OwnerState 기반 정책 분기: resolveOwnerState() + LOCKED 여부로 다운그레이드 결정"
  - "다운그레이드 metadata 저장: Stage 4에서 transactions.metadata에 downgraded/originalTier 포함"

# Metrics
duration: 6min
completed: 2026-02-09
---

# Phase 33 Plan 01: 정책 다운그레이드 로직 설계 Summary

**evaluate() Step 9.5에 APPROVAL->DELAY 다운그레이드 삽입, evaluateBatch() 합산 다운그레이드, evaluate() agentOwnerInfo 시그니처 확장, TX_DOWNGRADED 감사 로그, Owner LOCKED 후 정상 APPROVAL 복원 흐름, Stage 4 다운그레이드 분기를 33-time-lock-approval-mechanism.md에 명세**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-08T23:28:45Z
- **Completed:** 2026-02-08T23:34:25Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- evaluate() 알고리즘에 Step 9.5를 삽입하여 APPROVAL 티어 + OwnerState NONE/GRACE 조건에서 DELAY 다운그레이드 로직 완성
- evaluate() 시그니처에 optional agentOwnerInfo 파라미터 추가 (IPolicyEngine 인터페이스 미변경으로 하위 호환성 유지)
- loadAgentOwnerInfo() fallback 헬퍼 메서드로 agentOwnerInfo 미전달 시 DB 조회 대체
- evaluateBatch()에 동일한 Step 9.5 다운그레이드를 합산 tierDecision에 적용 (개별 instruction 다운그레이드 불적용)
- TX_DOWNGRADED 감사 로그 이벤트를 독립 이벤트 타입으로 정의 (severity: info)
- Owner LOCKED 후 정상 APPROVAL / GRACE 다운그레이드 / NONE 다운그레이드 3개 흐름을 단계별 명세
- OwnerState별 동일 금액 거래 처리 비교 테이블 작성
- Stage 4 다운그레이드 분기 상세화: metadata에 downgraded/originalTier 저장, TX_DOWNGRADED_DELAY vs TX_DELAY_QUEUED 알림 분기
- evaluate() JSDoc 알고리즘 설명과 Mermaid 플로우차트에 Step 9.5 반영
- 안티패턴 5건 테이블로 명시 (외부 다운그레이드 금지, GRACE APPROVAL 금지, 0초 delay 금지, Step 10 이후 삽입 금지, 개별 instruction 다운그레이드 금지)

## Task Commits

Each task was committed atomically:

1. **Task 1: evaluate() Step 9.5 다운그레이드 + 시그니처 확장 + TX_DOWNGRADED 감사 로그** - `5b03d4e` (feat)
2. **Task 2: evaluateBatch() 다운그레이드 + Owner LOCKED APPROVAL 복원 + Stage 4 분기** - `6c5b14c` (feat)

## Files Created/Modified

- `.planning/deliverables/33-time-lock-approval-mechanism.md` - evaluate() Step 9.5 다운그레이드 로직 (코드 + 상세 섹션 11.6), evaluate() 시그니처 확장 (섹션 3.2), evaluateBatch() 합산 다운그레이드 (섹션 11.5), TX_DOWNGRADED 감사 이벤트 (섹션 8.3 + 11.6), Owner LOCKED 정상 APPROVAL 복원 흐름 (섹션 11.7), GRACE/NONE 다운그레이드 흐름 비교, Stage 4 다운그레이드 분기 (섹션 11.8), 플로우차트 갱신 (섹션 3.3)

## Decisions Made

1. **evaluate() 시그니처 optional 확장:** IPolicyEngine 인터페이스 자체는 변경하지 않고 DatabasePolicyEngine.evaluate()의 3번째 파라미터로 AgentOwnerInfo를 optional로 추가. Stage 3에서 이미 agent를 로드하므로 전달이 자연스러움.

2. **Step 9.5에서 return으로 Step 10 스킵:** 다운그레이드 후 APPROVE_TIER_OVERRIDE(Step 10)가 DELAY를 다시 APPROVAL로 복원하는 것을 방지. APPROVE 트랜잭션의 이중 다운그레이드 문제를 원천 차단.

3. **delaySeconds 결정 로직:** SPENDING_LIMIT 규칙의 delay_seconds를 우선 사용하고, 미설정 시 300초(5분) fallback. Math.max(rawDelay, 60)으로 최소 60초 보장하여 0초 DELAY(= INSTANT)를 방지.

4. **TX_DOWNGRADED 독립 감사 이벤트:** 기존 TX_QUEUED의 details에 포함하는 대신 별도 이벤트 타입을 추가. audit_log에서 `WHERE event_type = 'TX_DOWNGRADED'`로 직접 집계 가능.

5. **evaluateBatch() 다운그레이드 적용 지점:** 개별 instruction evaluate()에서는 다운그레이드를 적용하지 않고, 합산 tierDecision에만 1회 적용. 이중 다운그레이드 방지.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- POLICY-01 충족: evaluate() Step 9.5에서 OwnerState NONE/GRACE 에이전트의 APPROVAL이 DELAY로 다운그레이드
- POLICY-02 충족: PolicyDecision.downgraded: true + originalTier: 'APPROVAL'로 알림 분기 조건 확보
- POLICY-03 충족: Owner LOCKED 후 정상 APPROVAL 흐름 + 상태별 비교 테이블 완성
- Plan 33-02(알림 템플릿 설계)가 TX_DOWNGRADED_DELAY 이벤트와 Stage 4 알림 분기를 소비할 기반 확보
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 33-정책-다운그레이드-알림-설계*
*Completed: 2026-02-09*
