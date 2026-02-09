---
phase: 43-concurrency-execution-completion
plan: 01
subsystem: api
tags: [pipeline-stage5, executeStage5, chain-error-category, retry-strategy, abort-controller, tier-timeout]

# Dependency graph
requires:
  - phase: 42-error-handling-completion
    provides: ChainError category 필드 (PERMANENT/TRANSIENT/STALE), 25개 에러 코드 3-카테고리 분류, 복구 전략 테이블
provides:
  - executeStage5() 완전 의사코드 (build->simulate->sign->submit + 에러 분기 + 재시도 루프)
  - 티어별 타임아웃 테이블 (INSTANT/NOTIFY=30초, DELAY/APPROVAL=60초)
  - Stage 5 에러 분기 요약 테이블 (단계별 재시도 행동/시작/최대 횟수)
  - transitionTo() CAS 패턴 DB 상태 전이
affects: [44-sqlite-batch-schema, 37-rest-api-error-mapping]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "executeStage5() 통합 실행 루프: 외부 buildLoop + 내부 단계별 실행, ChainError category switch 분기"
    - "티어별 AbortController 타임아웃: INSTANT/NOTIFY=30초, DELAY/APPROVAL=60초"
    - "TRANSIENT 실패한 단계 재시도 vs STALE Stage 5a 전체 재빌드 구분"
    - "transitionTo() CAS 패턴: WHERE id = :txId AND status = :fromState + changes === 0 검사"

key-files:
  created: []
  modified:
    - .planning/deliverables/32-transaction-pipeline-api.md

key-decisions:
  - "CONC-01: retryCount는 TRANSIENT과 STALE을 합산하여 전체 재시도 횟수를 제한"
  - "CONC-01: TRANSIENT 재시도는 실패한 단계(5b/5d)에서만, build(5a)/sign(5c)은 로컬 연산이므로 TRANSIENT 불가"
  - "CONC-01: EVM_GAS_TOO_LOW는 TRANSIENT이지만 gas 1.2x 상향 후 Stage 5a 재빌드 (continue buildLoop)"
  - "CONC-01: AbortController signal은 각 단계 시작 전 검사, IChainAdapter 메서드 시그니처 변경은 구현 단계 검토"

patterns-established:
  - "Stage 5 에러 분기: switch(err.category) -> PERMANENT(즉시 FAILED) / TRANSIENT(지수 백오프 1s,2s,4s max 3) / STALE(5a 복귀 1회)"
  - "타임아웃 패턴: AbortController + setTimeout(timeoutMs) + finally clearTimeout"

# Metrics
duration: 3min
completed: 2026-02-09
---

# Phase 43 Plan 01: Stage 5 통합 실행 루프 의사코드 Summary

**executeStage5() 완전 의사코드: build->simulate->sign->submit 4단계 + ChainError category 기반 에러 분기(PERMANENT/TRANSIENT/STALE) + 티어별 타임아웃(30초/60초) + transitionTo() CAS 패턴**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-09T12:08:49Z
- **Completed:** 2026-02-09T12:12:13Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- 32-pipeline SS5에 `executeStage5()` 완전 의사코드 추가 (163행 삽입)
- ChainError category 기반 `switch(err.category)` 3-분기 정의: PERMANENT(즉시 실패, 0회) / TRANSIENT(지수 백오프 max 3회) / STALE(Stage 5a 복귀 1회)
- 티어별 타임아웃 테이블 추가: INSTANT/NOTIFY=30초, DELAY/APPROVAL=60초 (AbortController 패턴)
- 에러 분기 요약 테이블 추가: 5개 에러 유형별 재시도 행동/시작 단계/최대 횟수
- EVM_GAS_TOO_LOW 특수 처리: TRANSIENT이지만 gas limit 1.2x 상향 후 Stage 5a 재빌드
- transitionTo() CAS 패턴으로 DB 상태 전이 원자성 보장 (QUEUED->EXECUTING->SUBMITTED->FAILED)
- 핵심 설명 노트 6항목: buildByType, transitionTo, TRANSIENT/STALE 재시도 규칙, DELAY/APPROVAL 재진입, AbortController signal

## Task Commits

Each task was committed atomically:

1. **Task 1: Stage 5 완전 실행 루프 의사코드 + 에러 분기 + 티어별 타임아웃 추가** - `27f498c` (feat)

## Files Created/Modified

- `.planning/deliverables/32-transaction-pipeline-api.md` - SS5에 Stage 5 통합 실행 루프(executeStage5) 의사코드, 티어별 타임아웃 테이블, 에러 분기 요약 테이블, 핵심 설명 노트 추가. 문서 메타데이터에 v0.10 업데이트 기록.

## Decisions Made

1. **retryCount 합산 전략:** TRANSIENT과 STALE의 retryCount를 합산하여 전체 재시도 횟수를 제한한다. STALE 1회 후 TRANSIENT은 최대 2회까지만 가능. 이는 타임아웃 내 완료를 보장하기 위한 보수적 접근.
2. **TRANSIENT 재시도 단계 한정:** build(5a)와 sign(5c)은 로컬 연산이므로 TRANSIENT이 발생하지 않는 것으로 가정. TRANSIENT 재시도 대상은 simulate(5b)와 submit(5d)로 한정. 27-chain-adapter SS4.5 테이블과 일치.
3. **AbortController signal 전달 방식:** IChainAdapter 메서드 시그니처에 signal 파라미터를 추가하는 대신, 각 단계 시작 전 `controller.signal.aborted` 검사로 구현. 시그니처 변경은 구현 단계에서 검토.
4. **DELAY/APPROVAL 재진입:** 동일 executeStage5() 호출, tier 파라미터로 60초 타임아웃 적용. 재진입 트리거 자체는 Stage 4 영역(Phase 8)에 위임.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - 설계 문서 수정만 수행.

## Next Phase Readiness

- Stage 5 완전 의사코드 완료 -- 구현자가 추측 없이 코드 변환 가능
- 43-02(세션 갱신 낙관적 잠금), 43-03(Kill Switch CAS)과 독립적으로 완료
- Phase 44(SQLite 스키마 + 배치 처리)에서 parent_id/batch_index 추가 시 transitionTo() 패턴을 동일하게 적용 가능

---
*Phase: 43-concurrency-execution-completion*
*Completed: 2026-02-09*

## Self-Check: PASSED
