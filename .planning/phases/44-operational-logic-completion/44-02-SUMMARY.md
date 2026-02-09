---
phase: 44-operational-logic-completion
plan: 02
subsystem: database
tags: [sqlite, drizzle, batch-transaction, parent-child, partial-failure, migration]

# Dependency graph
requires:
  - phase: 23-transaction-type-extension
    provides: "60-batch-transaction-spec.md 원본 §6 감사 로그 전략"
  - phase: 41-policy-engine-completion
    provides: "25-sqlite §4.4 rules 컬럼 SSoT 정리"
provides:
  - "60-batch-tx §6 부모-자식 2계층 DB 저장 전략 + PARTIAL_FAILURE 상태 전이"
  - "25-sqlite transactions 테이블 parent_id + batch_index 컬럼 + PARTIAL_FAILURE status"
  - "§4.14 v0.10 마이그레이션 가이드"
affects:
  - "구현 시 transactions 테이블 Drizzle 스키마"
  - "배치 트랜잭션 DB 저장/조회 로직"
  - "EVM 배치 지원 시 PARTIAL_FAILURE 활용"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "부모-자식 2계층 DB 저장: parent_id self-ref FK + batch_index 순서 보장"
    - "PARTIAL_FAILURE 예비 상태: EVM 순차 배치 전용, v0.10에서 CHECK에 미리 포함"

key-files:
  created: []
  modified:
    - "docs/60-batch-transaction-spec.md"
    - ".planning/deliverables/25-sqlite-schema.md"

key-decisions:
  - "BATCH-DB-01: 단일 레코드에서 부모-자식 2계층으로 전환 -- 자식 레코드 정규화로 metadata JSON 의존도 제거"
  - "BATCH-DB-02: ON DELETE CASCADE 선택 -- 부모-자식 논리적 단위 관리, 거래 보존은 agents RESTRICT가 보장"
  - "BATCH-DB-03: PARTIAL_FAILURE는 EVM 순차 배치 전용 예비 상태, Solana 원자적 배치에서는 미사용"

patterns-established:
  - "부모-자식 2계층 저장: 부모 레코드(type=BATCH, parentId=null)가 배치 전체 대표, 자식 레코드(parentId=부모ID, batchIndex=순서)가 개별 instruction"
  - "감사 컬럼 이중 저장: 부모에 대표값, 자식에 개별값 -- metadata JSON fallback 불필요"

# Metrics
duration: 4min
completed: 2026-02-09
---

# Phase 44 Plan 02: Batch Transaction DB Storage Summary

**배치 트랜잭션 부모-자식 2계층 DB 저장 전략 정의 + transactions 스키마에 parent_id/batch_index/PARTIAL_FAILURE 추가**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-09T12:36:21Z
- **Completed:** 2026-02-09T12:40:26Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- 60-batch-tx §6를 단일 레코드에서 부모-자식 2계층 저장 전략으로 전환, 상태 전이 테이블 3가지 시나리오 정의
- 25-sqlite transactions 테이블에 parent_id + batch_index 컬럼, PARTIAL_FAILURE 상태, partial index 추가
- §4.14 마이그레이션 가이드 작성 (SQLite CHECK 변경 제약 고려, drizzle-kit 자동 처리 안내)

## Task Commits

Each task was committed atomically:

1. **Task 1: 60-batch-tx §6 부모-자식 2계층 DB 저장 전략으로 전환** - `da85d11` (feat)
2. **Task 2: 25-sqlite transactions 테이블에 parent_id + batch_index + PARTIAL_FAILURE 추가** - `1d866f1` (feat)

## Files Created/Modified
- `docs/60-batch-transaction-spec.md` - §6 부모-자식 2계층 저장 전략, 상태 전이 테이블, 자식 조회 SQL, metadata 구조 변경
- `.planning/deliverables/25-sqlite-schema.md` - transactions 테이블 parent_id/batch_index 컬럼, PARTIAL_FAILURE 상태, §4.14 마이그레이션, §6 export 블록 반영

## Decisions Made

1. **BATCH-DB-01: 단일 레코드 -> 부모-자식 2계층 전환**
   - 근거: metadata JSON의 batch_instructions 배열 의존을 정규화된 테이블 행으로 대체. 인덱싱 가능한 쿼리, 표준 SQL 활용
   - 영향: metadata에서 batch_instructions 제거, 요약 통계만 유지

2. **BATCH-DB-02: ON DELETE CASCADE**
   - 근거: 부모-자식은 논리적 단위이므로 함께 관리. agents -> transactions의 RESTRICT가 거래 기록 보존을 보장하므로, 부모 삭제 시 자식도 함께 삭제되어야 일관성 유지
   - 주석으로 근거 명시

3. **BATCH-DB-03: PARTIAL_FAILURE 예비 상태**
   - 근거: 현재 Solana-only 배치에서는 원자적 실행이므로 CONFIRMED/FAILED만 발생. EVM 순차 배치 지원 시를 위해 v0.10에서 미리 CHECK에 포함

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 60-batch-tx §6과 25-sqlite transactions 스키마가 부모-자식 2계층 구조로 정합
- 구현자가 배치 트랜잭션의 DB 저장과 상태 관리를 추측 없이 구현 가능
- PARTIAL_FAILURE 상태는 EVM 배치 지원 마일스톤에서 활용 예정

## Self-Check: PASSED

---
*Phase: 44-operational-logic-completion*
*Completed: 2026-02-09*
