---
phase: 31-데이터-모델-타입-기반-설계
plan: 01
subsystem: database
tags: [sqlite, drizzle-orm, zod, schema-migration, owner-state, sweep-result, policy-decision]

# Dependency graph
requires:
  - phase: 06-core-architecture-design
    provides: agents 테이블 DDL + Drizzle ORM 정의 (CORE-02)
  - phase: 07-session-transaction-protocol-design
    provides: PolicyDecision 인터페이스 (TX-PIPE)
provides:
  - agents 스키마 v0.8 변경 (nullable owner_address, owner_verified 컬럼, CHECK 제약)
  - 테이블 재생성 마이그레이션 SQL (PRAGMA foreign_keys OFF/ON)
  - OwnerState Zod SSoT 타입 (NONE/GRACE/LOCKED)
  - SweepResult 타입 (AssetInfo 재사용)
  - PolicyDecision v0.8 확장 (downgraded, originalTier)
affects:
  - 31-02 (resolveOwnerState 유틸리티가 이 스키마 참조)
  - 32 (IChainAdapter.sweepAll 시그니처가 SweepResult 사용)
  - 33 (정책 다운그레이드 로직이 PolicyDecision.downgraded 참조)
  - 34 (sweepAll API가 SweepResult 반환)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OwnerState 런타임 파생: DB 컬럼(owner_address + owner_verified)에서 resolveOwnerState()로 산출, DB 저장 금지"
    - "PolicyDecision optional 확장: 하위 호환성 유지하면서 downgraded/originalTier 추가"
    - "SQLite 테이블 재생성 마이그레이션: PRAGMA foreign_keys OFF -> BEGIN -> CREATE/INSERT/DROP/RENAME -> COMMIT -> foreign_keys ON -> foreign_key_check"

key-files:
  created: []
  modified:
    - .planning/deliverables/25-sqlite-schema.md
    - .planning/deliverables/32-transaction-pipeline-api.md

key-decisions:
  - "OwnerState는 DB 컬럼이 아닌 런타임 파생 상태로 설계 (동기화 오류 방지)"
  - "SweepResult.tokensRecovered는 v0.6 AssetInfo를 직접 재사용 (중복 정의 금지)"
  - "PolicyDecision 확장은 optional 필드로 하위 호환성 유지"
  - "v0.8 마이그레이션에서 PRAGMA foreign_keys OFF/ON 패턴 적용 (v0.7 마이그레이션과 차별화)"

patterns-established:
  - "v0.8 태그 패턴: 변경 지점에 [v0.8] 주석으로 변경 이력 추적"
  - "owner_verified boolean CHECK: integer + mode:'boolean' + CHECK(IN(0,1)) 조합"

# Metrics
duration: 8min
completed: 2026-02-08
---

# Phase 31 Plan 01: 데이터 모델 타입 기반 설계 Summary

**agents 스키마 v0.8 변경(nullable owner_address, owner_verified CHECK), OwnerState/SweepResult 타입 정의, PolicyDecision downgraded 확장을 설계 문서 25/32에 반영**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-08T14:43:51Z
- **Completed:** 2026-02-08T14:52:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- agents 테이블의 owner_address를 nullable로 전환하고 owner_verified 컬럼을 추가하여 Owner 선택적 등록 데이터 모델 확립
- OwnerState(NONE/GRACE/LOCKED) Zod SSoT 타입과 SweepResult 타입을 설계 문서에 정의
- PolicyDecision에 downgraded/originalTier optional 필드를 추가하여 정책 다운그레이드 타입 기반 확립
- v0.8 테이블 재생성 마이그레이션 SQL을 PRAGMA foreign_keys OFF/ON 패턴으로 확정

## Task Commits

Each task was committed atomically:

1. **Task 1: agents 스키마 v0.8 변경 + OwnerState/SweepResult 타입 정의** - `ee3b385` (docs)
2. **Task 2: PolicyDecision 타입 v0.8 확장** - `54e4b02` (docs)

## Files Created/Modified
- `.planning/deliverables/25-sqlite-schema.md` - agents 스키마 v0.8 변경 (Drizzle ORM, DDL, 마이그레이션, ERD, 전체 export, 컬럼 설명, 요구사항 매핑), OwnerState/SweepResult 타입 정의, 안티패턴 주의사항 4건
- `.planning/deliverables/32-transaction-pipeline-api.md` - PolicyDecision 인터페이스 v0.8 확장 (downgraded, originalTier), Stage 3 다운그레이드 주석, 소비자 목록

## Decisions Made
- OwnerState를 DB 컬럼이 아닌 런타임 파생 상태로 설계: owner_address + owner_verified 조합에서 resolveOwnerState()로 산출. DB 저장 시 동기화 오류 위험
- SweepResult.tokensRecovered는 v0.6 AssetInfo 타입을 직접 재사용: 중복 정의 방지, 타입 일관성 유지
- PolicyDecision 확장은 optional 필드로 추가: 기존 6개 필드 변경 없이 하위 호환성 보장
- v0.8 마이그레이션은 PRAGMA foreign_keys OFF/ON 패턴 적용: v0.7 마이그레이션(BEGIN IMMEDIATE, FK OFF 불필요)과 달리 agents 테이블 DROP/RENAME 시 FK 참조 보호 필요

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- agents 스키마 v0.8 변경이 확정되어 Plan 31-02(resolveOwnerState, IChainAdapter.sweepAll, BEGIN IMMEDIATE 트랜잭션) 진행 가능
- OwnerState 타입이 정의되어 resolveOwnerState() 유틸리티 설계의 입력 타입 확정
- SweepResult 타입이 정의되어 IChainAdapter.sweepAll 시그니처 추가의 반환 타입 확정
- PolicyDecision.downgraded가 정의되어 Phase 33 다운그레이드 로직 설계의 타입 기반 확정
- 차단 요소 없음

## Self-Check: PASSED

---
*Phase: 31-데이터-모델-타입-기반-설계*
*Completed: 2026-02-08*
