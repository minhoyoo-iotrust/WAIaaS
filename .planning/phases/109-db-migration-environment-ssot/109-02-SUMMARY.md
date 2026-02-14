---
phase: 109-db-migration-environment-ssot
plan: 02
subsystem: database
tags: [sqlite, drizzle, migration, environment-model, 12-step-recreation]

# Dependency graph
requires:
  - phase: 109-01
    provides: "EnvironmentType SSoT + deriveEnvironment() + ENVIRONMENT_TYPES 상수"
provides:
  - "v6a/v6b/v8 DB 마이그레이션 3개 (LATEST_SCHEMA_VERSION=8)"
  - "Drizzle ORM 스키마 environment 모델 반영 (wallets.environment + defaultNetwork)"
  - "pushSchema/migration 스키마 동치성 검증"
  - "transactions.network, policies.network 컬럼"
affects: [110-route-layer, 111-business-logic, mcp, sdk, admin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "12-step SQLite table recreation for CHECK constraint changes"
    - "managesOwnTransaction: true for PRAGMA foreign_keys=OFF migrations"
    - "pushSchema DDL과 migration 결과 스키마 동치성 테스트 패턴"

key-files:
  created:
    - "packages/daemon/src/__tests__/migration-v6-v8.test.ts"
  modified:
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/daemon/src/infrastructure/database/schema.ts"
    - "packages/daemon/src/api/routes/wallets.ts"
    - "packages/daemon/src/api/routes/wallet.ts"
    - "packages/daemon/src/api/routes/transactions.ts"
    - "packages/daemon/src/lifecycle/daemon.ts"
    - "packages/daemon/src/pipeline/pipeline.ts"
    - "packages/core/src/index.ts"

key-decisions:
  - "wallet.network 참조를 wallet.defaultNetwork!로 최소 변환 (Phase 110/111에서 비즈니스 로직 변경)"
  - "pushSchema DDL에서 default_network은 nullable (NULL OR IN (...)) -- 향후 멀티체인 확장 대비"
  - "v6a는 일반 트랜잭션, v6b/v8은 managesOwnTransaction: true (12-step recreation 필요)"

patterns-established:
  - "migration-v6-v8.test.ts: createV5Database() 헬퍼로 이전 버전 DB 수동 구성 후 마이그레이션 검증"
  - "pushSchema/migration 동치성 테스트: 컬럼명+인덱스명 비교로 스키마 동기화 보장"
  - "v6b 13-branch CASE WHEN: 네트워크 -> 환경 변환 매핑"

# Metrics
duration: 45min
completed: 2026-02-14
---

# Phase 109 Plan 02: DB Migration Environment SSoT Summary

**v6a/v6b/v8 SQLite 마이그레이션으로 wallets.network을 environment+default_network 2컬럼으로 분리, Drizzle 스키마 동기화, 807개 테스트 전체 PASS**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-02-14T08:00:00Z
- **Completed:** 2026-02-14T08:47:10Z
- **Tasks:** 2
- **Files modified:** 32

## Accomplishments

- v6a/v6b/v8 DB 마이그레이션 3개 구현 (LATEST_SCHEMA_VERSION 5->8)
- Drizzle ORM schema.ts 환경 모델 전환 (wallets.environment + defaultNetwork)
- 9개 마이그레이션 데이터 무결성 테스트 작성 (pushSchema 동치성 포함)
- 24개 기존 테스트 파일 INSERT 문 환경 모델로 전환 (807 tests PASS)
- wallet.network -> wallet.defaultNetwork! 타입 에러 수정 (6개 소스파일)

## Task Commits

Each task was committed atomically:

1. **Task 1: migrate.ts v6a/v6b/v8 마이그레이션 + pushSchema DDL 동기화** - `b846e48` (feat)
2. **Task 2: schema.ts Drizzle 스키마 + 마이그레이션 테스트 + 타입 에러 수정** - `b147b96` (feat)

## Files Created/Modified

### Created
- `packages/daemon/src/__tests__/migration-v6-v8.test.ts` - v6a/v6b/v8 마이그레이션 9개 테스트

### Modified (Core)
- `packages/daemon/src/infrastructure/database/migrate.ts` - v6a (tx network backfill), v6b (wallets 12-step recreation), v8 (policies 12-step recreation), pushSchema DDL 동기화, LATEST_SCHEMA_VERSION=8
- `packages/daemon/src/infrastructure/database/schema.ts` - wallets.environment + defaultNetwork, transactions.network, policies.network, CHECK 제약, 인덱스
- `packages/core/src/index.ts` - ENVIRONMENT_TYPES 등 9개 환경 모델 export 추가

### Modified (Type Error Fixes)
- `packages/daemon/src/api/routes/wallets.ts` - wallet.network -> wallet.defaultNetwork! + INSERT에 deriveEnvironment() 적용
- `packages/daemon/src/api/routes/wallet.ts` - wallet.network -> wallet.defaultNetwork!
- `packages/daemon/src/api/routes/transactions.ts` - wallet.network -> wallet.defaultNetwork!
- `packages/daemon/src/lifecycle/daemon.ts` - wallet.network -> wallet.defaultNetwork!
- `packages/daemon/src/pipeline/pipeline.ts` - wallet.network -> wallet.defaultNetwork!

### Modified (Test Files - 24개)
- `migration-runner.test.ts` - LATEST_SCHEMA_VERSION 5->8, skip version 1-8
- `database.test.ts` - wallets 컬럼 체크 (network -> environment+default_network), INSERT 문 전환, environment/default_network CHECK 테스트 추가
- `settings-schema-migration.test.ts` - LATEST_SCHEMA_VERSION 5->8
- `api-agents.test.ts` - DB row 검증 network -> default_network+environment
- 20개 추가 테스트 파일: INSERT 문 network -> environment+default_network 전환

## Decisions Made

1. **wallet.network 최소 변환 전략**: 모든 `wallet.network` 참조를 `wallet.defaultNetwork!` (non-null assertion)로 변환. 비즈니스 로직 변경은 Phase 110/111에서 처리.
2. **default_network nullable 설계**: `default_network TEXT CHECK (... IS NULL OR ...)` -- 향후 네트워크 미지정 멀티체인 월렛 지원 대비.
3. **v6a 단순 ALTER vs v6b/v8 12-step**: v6a는 새 컬럼 추가만이므로 ALTER TABLE + UPDATE 사용. v6b/v8은 CHECK 제약 변경이 필요하여 12-step recreation 패턴 적용.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ENVIRONMENT_TYPES export 누락 수정**
- **Found during:** Task 1 (migrate.ts 빌드)
- **Issue:** ENVIRONMENT_TYPES가 chain.ts에 정의되어 있으나 packages/core/src/index.ts에서 re-export하지 않아 빌드 실패
- **Fix:** index.ts에 9개 환경 모델 export 추가 (ENVIRONMENT_TYPES, EnvironmentType, deriveEnvironment 등)
- **Files modified:** packages/core/src/index.ts
- **Verification:** 빌드 성공
- **Committed in:** b846e48 (Task 1 commit)

**2. [Rule 1 - Bug] 24개 테스트 파일 INSERT 문 환경 모델 전환**
- **Found during:** Task 2 (전체 테스트 실행)
- **Issue:** schema.ts에서 wallets.network 제거 후 raw SQL INSERT와 Drizzle INSERT에서 `network` 컬럼 참조 실패 (256개 테스트 실패)
- **Fix:** 24개 테스트 파일의 seedWallet/insertTestAgent 함수에서 `network` -> `environment + default_network` 전환
- **Files modified:** 24개 테스트 파일
- **Verification:** 807 tests PASS (51 test files)
- **Committed in:** b147b96 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** 플랜에서 "wallet.network 참조 최소 변환" 범위가 소스 6개 파일로 명시되었으나, 테스트 파일 24개도 동일한 변환이 필요했음. 테스트 파일 수정은 스키마 변경의 필연적 결과이며 scope creep 아님.

## Issues Encountered

- migration-runner.test.ts가 `getMaxVersion().toBe(5)` 하드코딩 -> LATEST_SCHEMA_VERSION=8로 변경 필요. 3개소 + "skip version 1-5" 테스트를 "skip version 1-8"로 확장.
- database.test.ts CHECK constraint 테스트가 이전 `network` CHECK를 검증 -> 새 `environment`/`default_network` CHECK 테스트로 교체 + invalid 값 거부 테스트 2개 추가.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 데이터 레이어 환경 모델 전환 완료 (migrate.ts + schema.ts + pushSchema DDL)
- wallet.defaultNetwork! 비-null 단언으로 라우트/파이프라인 컴파일 성공
- Phase 110에서 API 라우트 레이어 환경 모델 적용 필요 (request/response에 environment 노출)
- Phase 111에서 비즈니스 로직 변경 필요 (멀티네트워크 전환, 세션 스코핑)

## Self-Check: PASSED

- All 5 key files found
- Both task commits (b846e48, b147b96) verified in git log

---
*Phase: 109-db-migration-environment-ssot*
*Completed: 2026-02-14*
