---
phase: 162-compatibility-docker
plan: 01
subsystem: database
tags: [sqlite, migration, schema-version, compatibility, daemon-lifecycle]

# Dependency graph
requires:
  - phase: 160-version-check
    provides: VersionCheckService (npm registry version fetch)
  - phase: 161-cli-notify-upgrade
    provides: BackupService, upgrade CLI command
provides:
  - checkSchemaCompatibility 3-시나리오 판별 함수
  - MIN_COMPATIBLE_SCHEMA_VERSION 상수
  - SCHEMA_INCOMPATIBLE 에러 코드
  - daemon Step 2 호환성 검사 통합
affects: [162-02-docker, 163-release-please, 164-sync-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [schema-compatibility-check-before-migration, reject-on-incompatible-schema]

key-files:
  created:
    - packages/daemon/src/infrastructure/database/compatibility.ts
    - packages/daemon/src/__tests__/schema-compatibility.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/lifecycle/daemon.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts

key-decisions:
  - "dbVersion null 처리: MAX(version)이 null이면 빈 테이블로 판단하여 'ok' 반환 (0은 유효한 구버전으로 취급)"
  - "SCHEMA_INCOMPATIBLE 에러 코드를 @waiaas/core SYSTEM 도메인에 추가 (httpStatus: 503, retryable: false)"
  - "MIN_COMPATIBLE_SCHEMA_VERSION = 1: 현재 모든 마이그레이션 경로가 v1부터 지원되므로 최소값"

patterns-established:
  - "Schema compatibility check: 데몬 시작 시 pushSchema 전에 checkSchemaCompatibility 호출"
  - "Reject with guidance: 호환 불가 시 WAIaaSError throw + console.error로 구체적 안내 메시지"

requirements-completed: [CMPT-01, CMPT-02, CMPT-03]

# Metrics
duration: 4min
completed: 2026-02-17
---

# Phase 162 Plan 01: Schema Compatibility Matrix Summary

**checkSchemaCompatibility 3-시나리오 판별 함수 + daemon Step 2 통합으로 코드-DB 스키마 불일치 자동 감지**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-17T00:51:46Z
- **Completed:** 2026-02-17T00:55:56Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- checkSchemaCompatibility 함수: 5개 시나리오 (ok, migrate, code_too_old reject, schema_too_old reject, fresh DB) 정확히 판별
- daemon.ts Step 2에서 pushSchema 전 호환성 검사 -- reject 시 WAIaaSError('SCHEMA_INCOMPATIBLE') throw로 시작 거부
- 9개 단위 테스트 전체 통과, 기존 테스트(migration-runner 19, database 41) 회귀 없음
- SCHEMA_INCOMPATIBLE 에러 코드 + i18n(en/ko) 추가

## Task Commits

Each task was committed atomically:

1. **Task 1: checkSchemaCompatibility 함수 + MIN_COMPATIBLE_SCHEMA_VERSION + 테스트 (RED-GREEN)** - `f8a55d6` (feat)
2. **Task 2: daemon Step 2 호환성 검사 통합 + SCHEMA_INCOMPATIBLE 에러 코드** - `f638eb4` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/compatibility.ts` - checkSchemaCompatibility 3-시나리오 판별 함수 + MIN_COMPATIBLE_SCHEMA_VERSION 상수 + CompatibilityResult 타입
- `packages/daemon/src/__tests__/schema-compatibility.test.ts` - 9개 시나리오별 단위 테스트
- `packages/daemon/src/infrastructure/database/index.ts` - barrel export 추가 (checkSchemaCompatibility, MIN_COMPATIBLE_SCHEMA_VERSION, CompatibilityResult)
- `packages/daemon/src/lifecycle/daemon.ts` - Step 2에 checkSchemaCompatibility 호출 + reject 시 WAIaaSError throw
- `packages/core/src/errors/error-codes.ts` - SCHEMA_INCOMPATIBLE 에러 코드 추가 (SYSTEM 도메인)
- `packages/core/src/i18n/en.ts` - SCHEMA_INCOMPATIBLE 영문 메시지
- `packages/core/src/i18n/ko.ts` - SCHEMA_INCOMPATIBLE 한글 메시지

## Decisions Made
- **dbVersion null vs 0 구분**: MAX(version)이 null이면 빈 테이블(fresh DB)로 'ok' 반환, 0은 유효한 구버전으로 schema_too_old 경로 진입. 이를 통해 Scenario D(db < MIN_COMPATIBLE) 테스트가 정확히 동작함.
- **SCHEMA_INCOMPATIBLE 에러 코드**: WAIaaSError가 ErrorCode union literal을 요구하므로 @waiaas/core에 새 에러 코드 추가. SYSTEM 도메인, httpStatus 503, retryable false.
- **MIN_COMPATIBLE_SCHEMA_VERSION = 1**: 현재 v1~v16 전체 마이그레이션 경로가 존재하므로 최소값. 향후 파괴적 마이그레이션 시 이 값을 올려 단계별 업그레이드를 강제할 수 있음.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SCHEMA_INCOMPATIBLE 에러 코드 + i18n 추가**
- **Found during:** Task 2 (daemon Step 2 통합)
- **Issue:** WAIaaSError 생성자가 ErrorCode union literal을 요구하는데 'SCHEMA_INCOMPATIBLE'이 정의되지 않아 TypeScript 컴파일 실패
- **Fix:** @waiaas/core error-codes.ts에 SCHEMA_INCOMPATIBLE 추가 + en.ts/ko.ts i18n 메시지 추가
- **Files modified:** packages/core/src/errors/error-codes.ts, packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** tsc --noEmit 통과, core 빌드 성공
- **Committed in:** f638eb4 (Task 2 commit)

**2. [Rule 1 - Bug] dbVersion null vs 0 구분 수정**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** dbVersion을 `row?.max_version ?? 0`으로 처리하면 version 0이 empty DB로 잘못 판별됨
- **Fix:** `row?.max_version ?? null`로 변경하여 null(빈 테이블)과 0(유효한 구버전)을 정확히 구분
- **Files modified:** packages/daemon/src/infrastructure/database/compatibility.ts
- **Verification:** 9개 테스트 전체 통과
- **Committed in:** f8a55d6 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** 두 수정 모두 정확한 동작을 위해 필수. 범위 확장 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema compatibility check 완전 동작 -- 162-02 Docker 구성으로 진행 가능
- 기존 테스트 전체 회귀 없음 확인

---
## Self-Check: PASSED

- All 3 created files exist on disk
- Both task commits (f8a55d6, f638eb4) exist in git log

---
*Phase: 162-compatibility-docker*
*Completed: 2026-02-17*
