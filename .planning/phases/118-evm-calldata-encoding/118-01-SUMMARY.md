---
phase: 118-evm-calldata-encoding
plan: 01
subsystem: api
tags: [viem, evm, abi-encoding, openapi, hono, calldata]

# Dependency graph
requires: []
provides:
  - "POST /v1/utils/encode-calldata REST endpoint"
  - "ABI_ENCODING_FAILED error code in @waiaas/core"
  - "EncodeCalldataRequest/Response OpenAPI Zod schemas"
  - "utils route pattern (stateless utility with sessionAuth)"
affects: [118-02, sdk, mcp, skills]

# Tech tracking
tech-stack:
  added: []
  patterns: ["stateless utility route with sessionAuth (utils.ts pattern)"]

key-files:
  created:
    - packages/daemon/src/api/routes/utils.ts
  modified:
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/daemon/src/api/error-hints.ts
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/api/server.ts
    - packages/daemon/src/__tests__/api-hint-field.test.ts

key-decisions:
  - "viem encodeFunctionData 직접 import (adapter-evm 경유 안 함)"
  - "abi 타입을 as unknown as Abi 이중 캐스트 (Record<string, unknown>[] -> Abi 직접 변환 불가)"
  - "utils 라우트 등록을 deps-check 밖에 배치 (DB/adapter 의존성 없음)"

patterns-established:
  - "Stateless utility route: no DB/adapter deps, sessionAuth, OpenAPIHono pattern"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 118 Plan 01: Encode Calldata REST Endpoint Summary

**POST /v1/utils/encode-calldata endpoint wrapping viem encodeFunctionData with ABI_ENCODING_FAILED error code, OpenAPI schemas, sessionAuth**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T16:34:10Z
- **Completed:** 2026-02-14T16:39:07Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- ABI_ENCODING_FAILED 에러 코드를 @waiaas/core TX 도메인에 등록 (httpStatus 400, retryable false)
- POST /v1/utils/encode-calldata 라우트 생성 (viem encodeFunctionData 래핑, 순수 연산, 동기)
- sessionAuth 미들웨어를 /v1/utils/* 경로에 등록
- EncodeCalldataRequest/Response OpenAPI Zod 스키마 추가
- 에러 힌트 + i18n 한/영 번역 추가

## Task Commits

Each task was committed atomically:

1. **Task 1: ABI_ENCODING_FAILED error code + OpenAPI schemas + utils route** - `f5ee58c` (feat)
2. **Task 2: Route registration in server.ts + barrel export + tests** - `1dab80e` (feat)

## Files Created/Modified
- `packages/daemon/src/api/routes/utils.ts` - encode-calldata 라우트 핸들러 (viem encodeFunctionData 래핑)
- `packages/core/src/errors/error-codes.ts` - ABI_ENCODING_FAILED 에러 코드 추가
- `packages/core/src/i18n/en.ts` - 영문 번역 추가
- `packages/core/src/i18n/ko.ts` - 한글 번역 추가
- `packages/daemon/src/api/error-hints.ts` - ABI_ENCODING_FAILED 힌트 추가
- `packages/daemon/src/api/routes/openapi-schemas.ts` - EncodeCalldataRequest/Response 스키마 추가
- `packages/daemon/src/api/routes/index.ts` - utilsRoutes barrel export 추가
- `packages/daemon/src/api/server.ts` - utils 라우트 등록 + sessionAuth 미들웨어
- `packages/daemon/src/__tests__/api-hint-field.test.ts` - 힌트 카운트 32->33 갱신

## Decisions Made
- viem encodeFunctionData를 daemon에서 직접 import (adapter-evm 경유 안 함 -- daemon이 이미 viem 직접 의존)
- abi 파라미터 타입을 `as unknown as Abi`로 이중 캐스트 (Record<string, unknown>[]에서 Abi로 직접 변환 시 TS 에러)
- utils 라우트 등록을 deps-check 블록 밖에 배치 (DB/adapter 의존성 없는 순수 연산 엔드포인트)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n 파일에 ABI_ENCODING_FAILED 키 누락**
- **Found during:** Task 1
- **Issue:** error-codes.ts에 새 코드 추가 후 빌드 실패 -- en.ts/ko.ts Record<ErrorCode, string> 타입에 ABI_ENCODING_FAILED 키 누락
- **Fix:** en.ts와 ko.ts에 ABI_ENCODING_FAILED 번역 추가
- **Files modified:** packages/core/src/i18n/en.ts, packages/core/src/i18n/ko.ts
- **Verification:** tsc 빌드 성공
- **Committed in:** f5ee58c (Task 1 commit)

**2. [Rule 1 - Bug] Abi 타입 캐스트 오류**
- **Found during:** Task 1
- **Issue:** `abi as Abi` 직접 캐스트 시 TS2352 에러 (Record<string, unknown>[]과 Abi 타입 불호환)
- **Fix:** `abi as unknown as Abi` 이중 캐스트로 변경
- **Files modified:** packages/daemon/src/api/routes/utils.ts
- **Verification:** daemon 빌드 성공
- **Committed in:** f5ee58c (Task 1 commit)

**3. [Rule 1 - Bug] api-hint-field 테스트 힌트 카운트 불일치**
- **Found during:** Task 2
- **Issue:** 새 ABI_ENCODING_FAILED 힌트 추가로 errorHintMap 개수 32->33 변경, 테스트 실패
- **Fix:** 테스트 기대값을 33으로 갱신
- **Files modified:** packages/daemon/src/__tests__/api-hint-field.test.ts
- **Verification:** api-hint-field 테스트 12개 전부 통과
- **Committed in:** 1dab80e (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** 모두 코드 정확성을 위한 필수 수정. 범위 확장 없음.

## Issues Encountered
- settings-service.test.ts 실패 (SETTING_DEFINITIONS 32 vs 35) -- 기존 알려진 이슈, 이번 변경과 무관

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- encode-calldata REST endpoint 완성, SDK/MCP 통합 (118-02) 준비 완료
- utils 라우트 패턴 확립 -- 향후 stateless 유틸리티 엔드포인트 추가 시 동일 패턴 사용

## Self-Check: PASSED

All 9 files verified present. Both commits (f5ee58c, 1dab80e) verified in git log.

---
*Phase: 118-evm-calldata-encoding*
*Completed: 2026-02-15*
