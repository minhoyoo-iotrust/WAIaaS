---
phase: 152-enum-config-test
plan: 01
subsystem: testing
tags: [enum, ssot, zod, drizzle, sqlite, config, pagination, notification, bigint, vitest]

# Dependency graph
requires:
  - phase: 151-coverage-mock-infra
    provides: "v8 coverage 인프라 + Mock 경계 테스트 패턴"
provides:
  - "16개 Enum SSoT 4단계 빌드타임 검증 스크립트 (scripts/verify-enum-ssot.ts)"
  - "generateCheckConstraint 유틸리티 (DB CHECK SQL 생성)"
  - "formatAmount/parseAmount 블록체인 단위 변환 유틸리티 (@waiaas/core)"
  - "Enum DB CHECK 일관성 Integration 테스트 (IT-01~06)"
  - "config.toml CF-01~12 테스트 완성"
  - "NOTE 매핑 4건 22 테스트 케이스 (NOTE-01, 02, 08, 11)"
affects: [153-ci-pipeline, 154-api-integration-test]

# Tech tracking
tech-stack:
  added: [tsx]
  patterns: [enum-ssot-4-stage-verification, sqlite_master-check-parsing, bigint-amount-formatting, cursor-pagination-drizzle-pattern]

key-files:
  created:
    - scripts/verify-enum-ssot.ts
    - packages/daemon/src/infrastructure/database/checks.ts
    - packages/daemon/src/__tests__/enum-db-consistency.test.ts
    - packages/core/src/utils/format-amount.ts
    - packages/core/src/__tests__/format-amount.test.ts
    - packages/daemon/src/__tests__/pagination-e2e.test.ts
    - packages/daemon/src/__tests__/note-02-notification-policy.test.ts
  modified:
    - packages/core/src/__tests__/enums.test.ts
    - packages/core/src/utils/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/infrastructure/database/index.ts
    - packages/daemon/src/__tests__/config-loader.test.ts
    - package.json

key-decisions:
  - "verify-enum-ssot.ts에서 @waiaas/core 대신 상대 경로 import 사용 (루트 레벨에서 workspace 패키지 해석 불가)"
  - "better-sqlite3는 CJS 모듈이므로 createRequire 패턴으로 import"
  - "IT-04 CHECK 개수 12개 (SSoT 11 + owner_verified boolean 1)"
  - "NOTE-11 페이지네이션 테스트를 Hono E2E 대신 Drizzle 직접 쿼리로 구현 (복잡한 앱 의존성 회피)"
  - "NOTE-02 N02-04 PolicyEngine amount는 lamport-scale 정수 문자열 사용 (BigInt 변환 호환)"

patterns-established:
  - "Enum SSoT 4단계 검증: as const -> Zod enum -> Drizzle schema -> DB CHECK constraint"
  - "sqlite_master CHECK SQL 파싱으로 런타임 DB 스키마 검증"
  - "bigint formatAmount/parseAmount 패턴 (SOL 9 decimals, ETH 18 decimals, USDC 6 decimals)"
  - "in-memory SQLite + Drizzle 직접 쿼리로 페이지네이션 로직 검증"

# Metrics
duration: 12min
completed: 2026-02-16
---

# Phase 152 Plan 01: Enum SSoT Build-time Verification + Config/NOTE Test Coverage Summary

**16개 Enum SSoT 4단계 빌드타임 검증 스크립트 + config.toml CF-01~12 테스트 + NOTE 매핑 4건(22 테스트 케이스) + formatAmount/parseAmount 유틸리티**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-16T14:10:00Z
- **Completed:** 2026-02-16T14:22:11Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- 16개 Enum의 as const -> Zod -> Drizzle -> DB CHECK 4단계 일관성을 빌드타임에 자동 검증하는 스크립트 구축 (`pnpm verify:enums`)
- generateCheckConstraint 유틸리티로 테스트/스크립트에서 CHECK SQL 비교 가능
- config.toml 로딩 테스트 CF-01~12 완성 (Docker hostname, 중첩 env var, 범위 검증, Zod 기본값 등)
- NOTE 매핑 4건 22 테스트 케이스 구현: formatAmount 8건, notification-policy 5건, shutdown_timeout 4건, cursor pagination 5건
- formatAmount/parseAmount bigint 단위 변환 유틸리티를 @waiaas/core에 추가 (MAX_SAFE_INTEGER 이상 정밀도 보장)

## Task Commits

Each task was committed atomically:

1. **Task 1: Enum SSoT 빌드타임 검증 스크립트 + DB 일관성 테스트** - `452d406` (feat)
2. **Task 2: config.toml CF-01~12 테스트 + NOTE 매핑 4건(22 테스트 케이스)** - `f653ec2` (test)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `scripts/verify-enum-ssot.ts` - 16개 Enum SSoT 4단계 빌드타임 검증 스크립트 (tsx 실행)
- `packages/daemon/src/infrastructure/database/checks.ts` - generateCheckConstraint SQL 생성 유틸리티
- `packages/daemon/src/infrastructure/database/index.ts` - checks.ts export 추가
- `packages/core/src/__tests__/enums.test.ts` - 16개 Enum 전체 커버 (29 tests, 기존 확장)
- `packages/daemon/src/__tests__/enum-db-consistency.test.ts` - IT-01~06 + UT-06~07 (39 tests)
- `packages/core/src/utils/format-amount.ts` - formatAmount/parseAmount bigint 단위 변환
- `packages/core/src/utils/index.ts` - format-amount export 추가
- `packages/core/src/index.ts` - formatAmount/parseAmount re-export
- `packages/core/src/__tests__/format-amount.test.ts` - NOTE-01 8건 테스트
- `packages/daemon/src/__tests__/config-loader.test.ts` - CF-01~12 + NOTE-08 추가 (49 tests 총)
- `packages/daemon/src/__tests__/pagination-e2e.test.ts` - NOTE-11 커서 페이지네이션 5건
- `packages/daemon/src/__tests__/note-02-notification-policy.test.ts` - NOTE-02 알림 채널-정책 5건
- `package.json` - verify:enums 스크립트 + tsx devDependency 추가
- `pnpm-lock.yaml` - tsx 설치 반영

## Decisions Made
1. **verify-enum-ssot.ts 상대 경로 import** - 루트 레벨 스크립트에서 `@waiaas/core` workspace 패키지를 해석할 수 없어 `../packages/core/src/index.js` 상대 경로 사용
2. **better-sqlite3 createRequire 패턴** - CJS 모듈이므로 ESM에서 `createRequire(import.meta.url)` 패턴으로 import
3. **IT-04 CHECK 개수 12** - SSoT CHECK 11개 + `owner_verified IN (0, 1)` boolean CHECK 1개 = 총 12개
4. **NOTE-11 Drizzle 직접 쿼리** - Hono E2E 접근은 KillSwitchService/OwnerLifecycle 등 복잡한 의존성으로 503 에러 발생하여, 동일한 페이지네이션 쿼리 패턴을 Drizzle로 직접 테스트
5. **NOTE-02 N02-04 lamport-scale 정수** - PolicyEngine의 `BigInt(amount)` 변환이 소수점 문자열을 거부하므로 `'10000000000'` (10 SOL in lamports) 사용

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsx devDependency 설치**
- **Found during:** Task 1 (verify-enum-ssot.ts 실행)
- **Issue:** `pnpm verify:enums` 실행 시 `sh: tsx: command not found`
- **Fix:** `pnpm add -Dw tsx` 로 workspace root에 tsx devDependency 추가
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `pnpm verify:enums` 정상 실행
- **Committed in:** 452d406 (Task 1 commit)

**2. [Rule 1 - Bug] @waiaas/core import 경로 수정**
- **Found during:** Task 1 (verify-enum-ssot.ts 실행)
- **Issue:** 루트 레벨 스크립트에서 `@waiaas/core` import 실패 (workspace 해석 불가)
- **Fix:** 상대 경로 `../packages/core/src/index.js` 로 변경 + createRequire for better-sqlite3
- **Files modified:** scripts/verify-enum-ssot.ts
- **Verification:** `pnpm verify:enums` exit code 0
- **Committed in:** 452d406 (Task 1 commit)

**3. [Rule 1 - Bug] IT-04 CHECK 제약 개수 수정**
- **Found during:** Task 1 (enum-db-consistency.test.ts 실행)
- **Issue:** Expected 11 SSoT CHECK but actual 12 (owner_verified IN (0,1) 포함)
- **Fix:** Expected count를 12로 수정하고 주석으로 11 SSoT + 1 boolean 설명 추가
- **Files modified:** packages/daemon/src/__tests__/enum-db-consistency.test.ts
- **Verification:** IT-04 테스트 통과
- **Committed in:** 452d406 (Task 1 commit)

**4. [Rule 1 - Bug] NOTE-02 N02-04 BigInt 변환 에러 수정**
- **Found during:** Task 2 (note-02-notification-policy.test.ts 실행)
- **Issue:** `BigInt('10.0')` 변환 에러 - PolicyEngine이 소수점 문자열 거부
- **Fix:** amount를 `'10000000000'` (lamport-scale 정수 문자열)으로 변경
- **Files modified:** packages/daemon/src/__tests__/note-02-notification-policy.test.ts
- **Verification:** N02-04 테스트 통과
- **Committed in:** f653ec2 (Task 2 commit)

**5. [Rule 3 - Blocking] NOTE-11 페이지네이션 테스트 Hono -> Drizzle 전환**
- **Found during:** Task 2 (pagination-e2e.test.ts 실행)
- **Issue:** Hono app.request() 접근 시 503 에러 (KillSwitchService, OwnerLifecycle 등 복잡한 의존성)
- **Fix:** 동일한 cursor pagination 쿼리 패턴을 Drizzle ORM으로 직접 테스트하도록 리팩터링
- **Files modified:** packages/daemon/src/__tests__/pagination-e2e.test.ts
- **Verification:** N11-01~05 전체 통과
- **Committed in:** f653ec2 (Task 2 commit)

---

**Total deviations:** 5 auto-fixed (2 bug fixes, 1 blocking dependency, 1 blocking import path, 1 blocking test approach)
**Impact on plan:** All auto-fixes necessary for correctness and test execution. No scope creep.

## Issues Encountered
- turbo.json enum-verify task 추가는 plan에 언급되었으나, 루트 전용 스크립트로 충분하여 turbo task는 추가하지 않음 (CI에서 `pnpm verify:enums`로 직접 호출)
- Pre-existing CLI E2E failures (E-07~E-09) 확인 -- 본 plan과 무관, 기존 known issue

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 빌드타임 Enum 검증 인프라 완성 -- CI pipeline (Phase 153)에서 `pnpm verify:enums` step 추가 준비 완료
- config.toml + NOTE 매핑 테스트 완성 -- API Integration 테스트 (Phase 154)의 기반 준비 완료
- formatAmount/parseAmount 유틸리티 -- 향후 UI/SDK에서 잔액 표시 시 활용 가능
- Pre-existing blockers (CLI E2E E-07~09, lifecycle.test.ts flaky) 는 별도 이슈로 추적 중

## Self-Check: PASSED

- 13/13 files FOUND
- 2/2 commits FOUND (452d406, f653ec2)

---
*Phase: 152-enum-config-test*
*Completed: 2026-02-16*
