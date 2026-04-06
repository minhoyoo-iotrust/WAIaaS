---
phase: 42-error-handling-completion
plan: 01
subsystem: api
tags: [chain-error, error-categorization, retry-strategy, pipeline-stage5]

# Dependency graph
requires:
  - phase: 41-policy-engine-completion
    provides: PolicyRuleSchema SSoT 정리 완료
provides:
  - ChainError category 필드 ('PERMANENT' | 'TRANSIENT' | 'STALE')
  - 25개 에러 코드 3-카테고리 분류 테이블
  - 카테고리별 복구 전략 테이블 (재시도 횟수, 백오프, 시작 단계)
affects: [43-pipeline-stage5-pseudocode, 37-rest-api-error-mapping]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ChainError 3-카테고리 패턴: PERMANENT(즉시 실패) / TRANSIENT(지수 백오프) / STALE(즉시 재빌드)"
    - "category가 복구 전략 결정, retryable은 클라이언트 hint (backward compat)"

key-files:
  created: []
  modified:
    - .planning/deliverables/27-chain-adapter-interface.md

key-decisions:
  - "25개 에러 코드 분류: PERMANENT 17, TRANSIENT 4, STALE 4"
  - "CONTRACT_CALL_FAILED는 기본 PERMANENT (Action Provider 레벨에서 개별 재분류 가능)"
  - "EVM_GAS_TOO_LOW는 TRANSIENT이지만 gas limit 1.2x 상향 후 1회만 재시도하는 특수 케이스"
  - "retryable 필드 유지 (backward compat), category에서 자동 파생: PERMANENT=false, TRANSIENT/STALE=true"

patterns-established:
  - "카테고리별 복구 전략: PERMANENT(0회) / TRANSIENT(max3, exp 1s-2s-4s) / STALE(1회, 즉시, Stage 5a)"
  - "Stage 5 파이프라인 switch(err.category) 분기 패턴"

# Metrics
duration: 3min
completed: 2026-02-09
---

# Phase 42 Plan 01: ChainError 3-카테고리 분류 Summary

**ChainError에 category 필드(PERMANENT/TRANSIENT/STALE) 추가, 25개 에러 코드 전체 분류, 카테고리별 복구 전략 테이블 정의**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T11:43:15Z
- **Completed:** 2026-02-09T11:46:40Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- SS4.4 ChainError 클래스에 `readonly category: 'PERMANENT' | 'TRANSIENT' | 'STALE'` 필드 추가
- SS4.5 매핑 테이블에 카테고리 열 추가, 25개 에러 코드 전체 3-카테고리 분류 완료
- 카테고리별 복구 전략 테이블 정의 (재시도 횟수, 백오프 방식, 재시도 시작 단계)
- 카테고리 기반 분기 코드 예시 추가 (Phase 43 Stage 5 파이프라인 연동)
- retryable 필드와 category 일관성 확보 (PERMANENT=false, TRANSIENT/STALE=true)
- SS4.6 WalletApiError 매핑에 category 전달 규칙 추가

## Task Commits

Each task was committed atomically:

1. **Task 1: ChainError 클래스 category 필드 추가 + 에러 매핑 테이블 확장** - `a4d3a55` (feat)

## Files Created/Modified

- `.planning/deliverables/27-chain-adapter-interface.md` - SS4.4 ChainError 클래스 category 필드, SS4.5 매핑 테이블 카테고리 열, 복구 전략 테이블, 코드 예시 업데이트

## Decisions Made

1. **25개 에러 코드 분류 (plan은 24개로 언급했으나 실제 SS4.5에 25행):** PERMANENT 17개, TRANSIENT 4개, STALE 4개. 공통 7 + Solana 3 + EVM 3 = 13개 기본에 v0.6 추가 12개.
2. **CONTRACT_CALL_FAILED는 PERMANENT:** 기본적으로 입력 오류이며, RPC 일시 장애는 RPC_ERROR로 분류됨. Action Provider 레벨에서 개별 판단 가능.
3. **EVM_GAS_TOO_LOW는 TRANSIENT (특수):** 일반 TRANSIENT과 달리 gas limit 1.2x 상향 후 재빌드 필요. 1회만 시도.
4. **retryable 필드 유지:** backward compatibility를 위해 유지하되, constructor에서 `category !== 'PERMANENT'`으로 자동 파생. 명시적 override도 허용.
5. **에러 코드 수 정정:** plan의 "24개"를 실제 SS4.5 테이블 기준 "25개"로 정정 (BATCH_INSTRUCTION_INVALID 포함).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 에러 코드 수 정정 (24 -> 25)**
- **Found during:** Task 1 (매핑 테이블 확장)
- **Issue:** plan에서 24개로 참조했으나 실제 SS4.5 테이블에 25개 행이 존재 (BATCH_INSTRUCTION_INVALID 포함 계수 누락)
- **Fix:** 분류 요약 테이블과 설명을 25개로 정정
- **Files modified:** .planning/deliverables/27-chain-adapter-interface.md
- **Verification:** 테이블 행 수 직접 카운트, PERMANENT 17 + TRANSIENT 4 + STALE 4 = 25
- **Committed in:** a4d3a55 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** 단순 계수 정정. 스코프 변경 없음.

## Issues Encountered

None

## User Setup Required

None - 설계 문서 수정만 수행.

## Next Phase Readiness

- ChainError category 분류 완료 -- Phase 43(CONC-01) Stage 5 완전 의사코드가 `err.category`로 switch 분기 가능
- 42-02 plan(HTTP 에러 통합 매트릭스 또는 PolicyType 확장)과 독립적으로 실행 완료

---
*Phase: 42-error-handling-completion*
*Completed: 2026-02-09*

## Self-Check: PASSED
