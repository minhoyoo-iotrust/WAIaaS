---
phase: 105-environment-data-model-db-migration
plan: 02
subsystem: database
tags: [sqlite, migration, 12-step-recreation, environment, network, wallets, transactions, pushSchema, drizzle]

# Dependency graph
requires:
  - phase: 105-01
    provides: "EnvironmentType SSoT, 환경-네트워크 매핑 (deriveEnvironment 13개 전수 매핑), WalletSchema 변경 설계"
provides:
  - "v6a(version 6) 마이그레이션 전략: transactions.network ADD COLUMN + UPDATE 역참조 SQL"
  - "v6b(version 7) 마이그레이션 전략: wallets 12-step 재생성 (network -> environment + default_network)"
  - "13개 NETWORK_TYPES -> environment CASE WHEN 전수 매핑 SQL"
  - "pushSchema DDL 동기화 계획 (LATEST_SCHEMA_VERSION=7)"
  - "Drizzle ORM 스키마 변경 계획"
  - "마이그레이션 테스트 전략 6개 케이스"
  - "위험 완화 전략 4개"
affects: [106-pipeline, 107-policy, 108-api]

# Tech tracking
tech-stack:
  added: []
  patterns: ["v6a/v6b 2단계 마이그레이션 분리 (비파괴적 ADD COLUMN + 파괴적 12-step)", "wallets 12-step 재생성 with CASE WHEN 데이터 변환", "pushSchema DDL과 마이그레이션 결과 동기화 패턴"]

key-files:
  created: ["docs/69-db-migration-v6-design.md"]
  modified: []

key-decisions:
  - "MIG-v6a: transactions.network은 nullable로 유지 (향후 유연성 + Zod 일치)"
  - "MIG-v6b: FK dependent 테이블 4개(sessions/transactions/policies/audit_log) 함께 재생성 (v3 선례)"
  - "MIG-v6b: policies.network 컬럼은 Phase 107 범위로 스코프 분리"
  - "MIG-v6b: CASE ELSE 분기는 testnet fallback (CHECK 제약으로 실행 불가하지만 안전장치)"

patterns-established:
  - "v6a/v6b 순서 의존성: version 번호로 강제 (6 < 7)"
  - "12-step 재생성 시 FK dependent 테이블 함께 재생성 (v2/v3/v6b 일관 패턴)"
  - "pushSchema DDL과 LATEST_SCHEMA_VERSION 동시 업데이트 필수"

# Metrics
duration: 4min
completed: 2026-02-14
---

# Phase 105 Plan 02: DB 마이그레이션 v6a+v6b 설계 Summary

**v6a(ADD COLUMN + UPDATE 역참조) + v6b(wallets 12-step 재생성 with 13개 CASE WHEN) 마이그레이션 전략을 copy-paste 수준 SQL로 완성하고, pushSchema/Drizzle 동기화 + 테스트 전략 + 위험 완화를 포함한 설계 문서(docs/69) 작성**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-14T00:58:55Z
- **Completed:** 2026-02-14T01:03:36Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- v6a(version 6) 마이그레이션 설계: ALTER TABLE ADD COLUMN + UPDATE 역참조 SQL 2개, managesOwnTransaction: false
- v6b(version 7) 마이그레이션 설계: 12-step 재생성 (wallets + sessions + transactions + policies + audit_log), managesOwnTransaction: true
- 13개 NETWORK_TYPES -> environment CASE WHEN 전수 매핑 (docs/68 deriveEnvironment()와 1:1 일치 검증)
- v6a -> v6b 순서 의존성 다이어그램 + 근거 명시
- pushSchema DDL 동기화 계획: wallets/transactions DDL + 인덱스 + LATEST_SCHEMA_VERSION=7
- Drizzle ORM 스키마 변경 계획: wallets(environment/defaultNetwork) + transactions(network)
- 테스트 전략 6개 케이스 + 위험 완화 4개 전략
- PRAGMA foreign_key_check 검증이 v6b Step 12에 포함

## Task Commits

Each task was committed atomically:

1. **Task 1: v6a 마이그레이션 설계 (transactions.network ADD COLUMN)** - `58eb1ba` (feat)
2. **Task 2: v6b 마이그레이션 설계 (wallets 12-step 재생성) + pushSchema 동기화** - `c2c0215` (feat)

## Files Created/Modified

- `docs/69-db-migration-v6-design.md` - DB 마이그레이션 v6a+v6b 전략 설계 (7개 섹션: 전략 개요, v6a 상세, v6b 12-step 상세, pushSchema DDL, Drizzle 스키마, 테스트 전략, 위험 완화)

## Decisions Made

- **MIG-v6a:** transactions.network nullable 유지 -- ON DELETE RESTRICT로 보호되지만, 향후 유연성과 Zod `NetworkTypeEnum.nullable()` 일치
- **MIG-v6b:** FK dependent 테이블 4개 함께 재생성 -- v3 선례를 따라 안전 우선. sessions/policies는 스키마 변경 없이 FK 재연결만
- **MIG-v6b:** policies.network 컬럼 미추가 -- Phase 107 범위로 스코프 분리 (v8 마이그레이션에서 처리)
- **MIG-v6b:** CASE ELSE 분기는 `testnet` fallback -- 기존 CHECK가 13개 값만 허용하므로 실행 불가하지만 방어적 코딩

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v1.4.6 구현자가 docs/69만으로 migrate.ts에 v6a+v6b 마이그레이션을 추가 가능 (SQL copy-paste 수준)
- pushSchema DDL + Drizzle 스키마 변경 계획이 함께 제공되어 동기화 누락 방지
- Phase 106 (파이프라인), 107 (정책), 108 (API/DX)이 docs/68 + docs/69를 참조하여 설계 가능
- Phase 105 완료 -- 환경 데이터 모델 설계 + DB 마이그레이션 설계 모두 완성

## Self-Check: PASSED

- FOUND: `docs/69-db-migration-v6-design.md`
- FOUND: `105-02-SUMMARY.md`
- FOUND: commit `58eb1ba`
- FOUND: commit `c2c0215`

---
*Phase: 105-environment-data-model-db-migration*
*Completed: 2026-02-14*
