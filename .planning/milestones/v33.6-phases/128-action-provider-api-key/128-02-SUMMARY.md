---
phase: 128-action-provider-api-key
plan: 02
subsystem: database, infra
tags: [sqlite, drizzle, aes-256-gcm, hkdf, migration, encryption, api-key]

# Dependency graph
requires:
  - phase: 100-admin-settings
    provides: settings-crypto.ts (HKDF + AES-256-GCM encrypt/decrypt)
provides:
  - api_keys Drizzle 테이블 스키마 (Table 11)
  - DB v11 마이그레이션 (CREATE TABLE api_keys)
  - ApiKeyStore 클래스 (set/get/getMasked/has/delete/listAll)
affects: [128-03 (REST API endpoints), 128-04 (Admin UI / MCP)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ApiKeyStore: settings-crypto 패턴 재사용으로 API 키 암호화 저장"
    - "getMasked 3단계 마스킹 (>6: 앞4+...+끝2, 4-6: 앞2+..., <4: ****)"

key-files:
  created:
    - packages/daemon/src/infrastructure/action/api-key-store.ts
    - packages/daemon/src/__tests__/api-key-store.test.ts
  modified:
    - packages/daemon/src/infrastructure/database/schema.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/infrastructure/action/index.ts

key-decisions:
  - "ApiKeyStore.set()에서 new Date(Math.floor(Date.now()/1000)*1000)으로 Unix epoch 초 정밀도 보장"
  - "maskKey를 모듈 레벨 private 함수로 분리하여 getMasked/listAll 공유"
  - "has()에서 SELECT providerName만 조회하여 불필요한 복호화 방지"

patterns-established:
  - "ApiKeyStore 패턴: BetterSQLite3Database + masterPassword 생성자 DI"
  - "DB v11: api_keys 테이블 -- provider_name PK, encrypted_key, created_at, updated_at"

# Metrics
duration: 19min
completed: 2026-02-15
---

# Phase 128 Plan 02: api_keys DB v11 마이그레이션 + ApiKeyStore 암호화 저장소 Summary

**api_keys 테이블 DB v11 증분 마이그레이션 + HKDF/AES-256-GCM ApiKeyStore CRUD with 14 unit tests**

## Performance

- **Duration:** 19 min
- **Started:** 2026-02-15T08:33:57Z
- **Completed:** 2026-02-15T08:53:23Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- api_keys 테이블을 Drizzle 스키마 + DDL + v11 증분 마이그레이션으로 추가
- ApiKeyStore 클래스 구현 (set/get/getMasked/has/delete/listAll 6개 메서드)
- 기존 settings-crypto.ts의 HKDF + AES-256-GCM 패턴 재사용으로 API 키 암호화 저장
- 14개 단위 테스트 작성 + 기존 1059개 테스트 전체 통과

## Task Commits

Each task was committed atomically:

1. **Task 1: api_keys Drizzle 스키마 + DB v11 마이그레이션** - `4f1c113` (feat)
2. **Task 2: ApiKeyStore 암호화 저장소 + 단위 테스트** - `deb6b6d` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/schema.ts` - Table 11: apiKeys Drizzle 스키마 추가
- `packages/daemon/src/infrastructure/database/migrate.ts` - LATEST_SCHEMA_VERSION=11, v11 마이그레이션 추가
- `packages/daemon/src/infrastructure/database/index.ts` - apiKeys export 추가
- `packages/daemon/src/infrastructure/action/api-key-store.ts` - ApiKeyStore 클래스 (NEW)
- `packages/daemon/src/infrastructure/action/index.ts` - ApiKeyStore barrel export 추가
- `packages/daemon/src/__tests__/api-key-store.test.ts` - 14개 단위 테스트 (NEW)
- `packages/daemon/src/__tests__/migration-chain.test.ts` - ALL_TABLES + 버전 갱신
- `packages/daemon/src/__tests__/database.test.ts` - 테이블 수 11->12 갱신
- `packages/daemon/src/__tests__/migration-runner.test.ts` - 테스트 마이그레이션 버전 11->12+ 갱신
- `packages/daemon/src/__tests__/migration-v6-v8.test.ts` - LATEST_SCHEMA_VERSION 갱신
- `packages/daemon/src/__tests__/notification-log.test.ts` - Initial schema 설명 갱신
- `packages/daemon/src/__tests__/settings-schema-migration.test.ts` - 스키마 버전 갱신

## Decisions Made
- ApiKeyStore.set()에서 `new Date(Math.floor(Date.now()/1000)*1000)`으로 Unix epoch 초 정밀도 보장 (SQLite timestamp 규칙 준수)
- `maskKey`를 모듈 레벨 private 함수로 분리하여 getMasked/listAll에서 공유
- `has()`에서 SELECT providerName만 조회하여 불필요한 복호화 방지 (성능 최적화)
- 기존 테스트 6개 파일에서 LATEST_SCHEMA_VERSION 참조를 10->11로 갱신 (회귀 방지)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 기존 테스트 6개 파일의 LATEST_SCHEMA_VERSION 하드코딩 갱신**
- **Found during:** Task 2 (전체 테스트 회귀 확인)
- **Issue:** migration-runner, migration-v6-v8, notification-log, settings-schema-migration, database 테스트가 LATEST_SCHEMA_VERSION=10을 하드코딩
- **Fix:** 모든 참조를 10->11로 갱신, 테스트 마이그레이션 버전을 11+에서 12+로 범프
- **Files modified:** 5개 테스트 파일
- **Verification:** 전체 1059 테스트 통과
- **Committed in:** deb6b6d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** LATEST_SCHEMA_VERSION 변경에 따른 필수 갱신. 범위 확장 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- ApiKeyStore가 Plan 03 (REST API 엔드포인트)에서 DI로 주입 가능
- api_keys 테이블이 Plan 04 (Admin UI / MCP)에서 조회 가능

---
*Phase: 128-action-provider-api-key*
*Completed: 2026-02-15*
