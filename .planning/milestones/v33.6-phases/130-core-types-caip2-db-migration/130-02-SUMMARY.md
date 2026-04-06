---
phase: 130-core-types-caip2-db-migration
plan: 02
subsystem: database
tags: [migration, sqlite, check-constraint, x402, 12-step-recreation]

# Dependency graph
requires:
  - "130-01: TransactionType X402_PAYMENT, PolicyType X402_ALLOWED_DOMAINS SSoT 배열 확장"
provides:
  - "DB 마이그레이션 v12: transactions CHECK에 X402_PAYMENT, policies CHECK에 X402_ALLOWED_DOMAINS 포함"
  - "LATEST_SCHEMA_VERSION = 12"
  - "v1 -> v12 전체 체인 마이그레이션 테스트 검증"
affects: [131-x402-handler, 132-rest-api-mcp, 133-e2e-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: ["v12 dual 12-step recreation (transactions + policies 동시 재생성)"]

key-files:
  created: []
  modified:
    - "packages/daemon/src/infrastructure/database/migrate.ts"
    - "packages/daemon/src/__tests__/migration-chain.test.ts"
    - "packages/daemon/src/__tests__/migration-runner.test.ts"
    - "packages/daemon/src/__tests__/migration-v6-v8.test.ts"
    - "packages/daemon/src/__tests__/settings-schema-migration.test.ts"

key-decisions:
  - "v12 마이그레이션에서 transactions + policies를 단일 트랜잭션 내 순차 재생성 (2개 테이블 동시 처리)"

patterns-established:
  - "dual 12-step recreation: 하나의 마이그레이션에서 여러 테이블의 CHECK 제약을 동시에 갱신하는 패턴 (v8+v9 결합)"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 130 Plan 02: DB Migration v12 Summary

**v12 마이그레이션: transactions + policies 12-step 재생성으로 X402_PAYMENT/X402_ALLOWED_DOMAINS CHECK 제약 갱신 + 7개 체인 테스트**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-15T11:32:29Z
- **Completed:** 2026-02-15T11:37:28Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- v12 마이그레이션 추가: transactions 12-step 재생성 (TRANSACTION_TYPES SSoT에 X402_PAYMENT 포함)
- v12 마이그레이션 추가: policies 12-step 재생성 (POLICY_TYPES SSoT에 X402_ALLOWED_DOMAINS 포함)
- LATEST_SCHEMA_VERSION 11 -> 12 업데이트 (fresh DB pushSchema 시 v12까지 자동 기록)
- 4개 테스트 파일 버전 기대값 11 -> 12 전면 업데이트
- migration-chain.test.ts에 T-14a~g 7개 v12 체인 테스트 추가
- migration-runner.test.ts 테스트 마이그레이션 버전 12+ -> 13+ 범프 (실제 v12와 충돌 방지)
- 전체 daemon 테스트 1088개 통과

## Task Commits

Each task was committed atomically:

1. **Task 1: v12 마이그레이션 추가 + LATEST_SCHEMA_VERSION 업데이트** - `9d54973` (feat)
2. **Task 2: 마이그레이션 테스트 버전 기대값 업데이트 + v12 체인 테스트** - `fb5ebbb` (test)

## Files Created/Modified
- `packages/daemon/src/infrastructure/database/migrate.ts` - v12 마이그레이션 (transactions + policies 12-step 재생성) + LATEST_SCHEMA_VERSION=12
- `packages/daemon/src/__tests__/migration-chain.test.ts` - T-14a~g 7개 v12 테스트 추가 + 버전 기대값 업데이트
- `packages/daemon/src/__tests__/migration-runner.test.ts` - 테스트 마이그레이션 버전 13+로 범프 + 기대값 12 업데이트
- `packages/daemon/src/__tests__/migration-v6-v8.test.ts` - LATEST_SCHEMA_VERSION 기대값 12 업데이트
- `packages/daemon/src/__tests__/settings-schema-migration.test.ts` - schema_version/LATEST 기대값 12 업데이트

## Decisions Made
- v12 마이그레이션에서 transactions + policies를 단일 트랜잭션 내 순차 재생성 결정: v8(policies) + v9(transactions) 패턴을 결합하여 하나의 마이그레이션으로 처리. 별도 v12/v13으로 분리하지 않음 (동일한 x402 기능 지원 목적)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] migration-runner.test.ts 테스트 마이그레이션 버전 충돌 수정**
- **Found during:** Task 2 (테스트 업데이트)
- **Issue:** pushSchema가 이제 v12까지 기록하므로, 기존 테스트 마이그레이션(version: 12/13/14)이 실제 v12와 충돌. getMaxVersion()가 이미 12를 반환하여 테스트 마이그레이션이 적용되지 않거나 중복 발생
- **Fix:** 모든 테스트 마이그레이션 버전을 12+ -> 13+로 범프 (12->13, 13->14, 14->15), 관련 assertion 값 모두 업데이트
- **Files modified:** packages/daemon/src/__tests__/migration-runner.test.ts
- **Committed in:** fb5ebbb (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** 계획에서 "적절히 수정"으로 기술된 범위. 테스트 마이그레이션 버전 충돌은 예상된 변경. 스코프 확장 없음.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DB 마이그레이션 v12 완비. Phase 131(x402-handler)에서 X402_PAYMENT 트랜잭션과 X402_ALLOWED_DOMAINS 정책을 DB에 저장 가능
- Phase 130 전체 완료: Core 타입 (Plan 01) + DB 마이그레이션 (Plan 02) 모두 완료

## Self-Check: PASSED

- FOUND: packages/daemon/src/infrastructure/database/migrate.ts
- FOUND: packages/daemon/src/__tests__/migration-chain.test.ts
- FOUND: packages/daemon/src/__tests__/migration-runner.test.ts
- FOUND: packages/daemon/src/__tests__/migration-v6-v8.test.ts
- FOUND: packages/daemon/src/__tests__/settings-schema-migration.test.ts
- FOUND: .planning/phases/130-core-types-caip2-db-migration/130-02-SUMMARY.md
- FOUND: 9d54973 (Task 1 commit)
- FOUND: fb5ebbb (Task 2 commit)

---
*Phase: 130-core-types-caip2-db-migration*
*Completed: 2026-02-15*
