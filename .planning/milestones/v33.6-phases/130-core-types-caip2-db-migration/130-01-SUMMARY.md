---
phase: 130-core-types-caip2-db-migration
plan: 01
subsystem: core
tags: [x402, caip-2, zod, enum, error-codes, i18n]

# Dependency graph
requires: []
provides:
  - "@waiaas/core에 x402 타입 시스템 (CAIP-2 매핑 + Zod 스키마 + enum + 에러 코드)"
  - "TransactionType X402_PAYMENT, PolicyType X402_ALLOWED_DOMAINS"
  - "CAIP-2 양방향 매핑 13개 (EVM 10 + Solana 3)"
  - "X402 도메인 에러 코드 8개 + i18n en/ko"
  - "@x402/core re-export (PaymentRequiredV2Schema, PaymentPayloadV2Schema, PaymentRequirementsV2Schema)"
affects: [131-x402-handler, 132-rest-api-mcp, 133-e2e-tests]

# Tech tracking
tech-stack:
  added: ["@x402/core ^2.3.1"]
  patterns: ["CAIP-2 상수 매핑 테이블 패턴", "@x402/core subpath import 패턴 (@x402/core/schemas, @x402/core/types)"]

key-files:
  created:
    - "packages/core/src/interfaces/x402.types.ts"
    - "packages/core/src/__tests__/x402-types.test.ts"
  modified:
    - "packages/core/package.json"
    - "packages/core/src/enums/transaction.ts"
    - "packages/core/src/enums/policy.ts"
    - "packages/core/src/errors/error-codes.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"
    - "packages/core/src/interfaces/index.ts"
    - "packages/core/src/index.ts"
    - "packages/core/src/__tests__/enums.test.ts"
    - "packages/core/src/__tests__/errors.test.ts"
    - "packages/core/src/__tests__/package-exports.test.ts"
    - "packages/core/src/__tests__/i18n.test.ts"
    - "packages/core/src/__tests__/chain-error.test.ts"

key-decisions:
  - "@x402/core subpath imports 사용: @x402/core/schemas (Zod 스키마), @x402/core/types (TypeScript 타입). 기본 export는 x402Version만 포함"
  - "X402_PAYMENT_REJECTED HTTP 상태 코드 402 사용 (WAIaaS 에러 JSON body의 code 필드로 x402 프로토콜 402와 구분)"

patterns-established:
  - "CAIP-2 매핑: Record<string, {chain, network}> 상수 테이블 + Object.fromEntries 역방향 매핑"
  - "@x402/core 타입 re-export: x402.types.ts -> interfaces/index.ts -> core/index.ts 3단계 체인"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 130 Plan 01: Core Types + CAIP-2 + Error Codes Summary

**@x402/core 의존성 + CAIP-2 양방향 매핑 13개 + TransactionType/PolicyType SSoT 확장 + X402 에러 코드 8개 + 23개 신규 테스트**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-15T11:21:54Z
- **Completed:** 2026-02-15T11:27:37Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- @x402/core ^2.3.1 의존성 추가 및 subpath import 검증 (schemas/types)
- CAIP-2 <-> WAIaaS NetworkType 양방향 매핑 13개 (EVM 10 + Solana 3) 정의 + parseCaip2/resolveX402Network 함수
- TransactionType 7개 (X402_PAYMENT), PolicyType 12개 (X402_ALLOWED_DOMAINS), ErrorDomain 11개 (X402), ERROR_CODES 84개 (X402 8개)
- X402FetchRequest/Response/PaymentInfo Zod 스키마 + @x402/core re-export (PaymentRequiredV2Schema 등)
- 기존 테스트 카운트 불일치 전면 수정 (enums, errors, i18n, package-exports, chain-error)
- x402-types.test.ts 신규 23개 테스트 작성 및 전체 통과

## Task Commits

Each task was committed atomically:

1. **Task 1: @x402/core 의존성 + Enum 확장 + x402.types.ts + 에러 코드 + i18n** - `12225c6` (feat)
2. **Task 2: 테스트 카운트 수정 + x402-types 테스트 작성** - `4f19b1d` (test)

## Files Created/Modified
- `packages/core/src/interfaces/x402.types.ts` - CAIP-2 매핑 + X402 스키마 + @x402/core re-export (신규)
- `packages/core/src/__tests__/x402-types.test.ts` - CAIP-2 매핑/스키마/re-export 테스트 23개 (신규)
- `packages/core/package.json` - @x402/core ^2.3.1 의존성 추가
- `packages/core/src/enums/transaction.ts` - X402_PAYMENT 추가 (7번째)
- `packages/core/src/enums/policy.ts` - X402_ALLOWED_DOMAINS 추가 (12번째)
- `packages/core/src/errors/error-codes.ts` - X402 도메인 + 에러 코드 8개 추가
- `packages/core/src/i18n/en.ts` - X402 영문 메시지 8개 추가
- `packages/core/src/i18n/ko.ts` - X402 한글 메시지 8개 추가
- `packages/core/src/interfaces/index.ts` - x402 타입/스키마 re-export 추가
- `packages/core/src/index.ts` - x402 타입/스키마 패키지 re-export 추가
- `packages/core/src/__tests__/enums.test.ts` - 카운트 수정 (Status 10, Type 7, Policy 12)
- `packages/core/src/__tests__/errors.test.ts` - 카운트 수정 (84개, 11 domains, TX 28, ACTION 8, X402 8)
- `packages/core/src/__tests__/package-exports.test.ts` - ERROR_CODES 카운트 84로 수정
- `packages/core/src/__tests__/i18n.test.ts` - 에러 코드 카운트 84로 수정
- `packages/core/src/__tests__/chain-error.test.ts` - ChainErrorCode 29개(PERMANENT 21)로 수정

## Decisions Made
- @x402/core subpath imports 사용 결정: `@x402/core/schemas`에서 Zod 스키마, `@x402/core/types`에서 TypeScript 타입을 import. 기본 export(`@x402/core`)는 `x402Version`만 포함하여 부적합
- X402_PAYMENT_REJECTED HTTP 상태 코드 402 사용: WAIaaS 에러 응답 JSON body에 `code: 'X402_PAYMENT_REJECTED'`가 포함되어 x402 프로토콜의 순수 402 응답과 구분 가능

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18n.test.ts 에러 코드 카운트 불일치 수정**
- **Found during:** Task 2 (테스트 실행)
- **Issue:** i18n.test.ts에서 에러 코드 69개로 assertion하지만 실제 84개
- **Fix:** 69 -> 84로 수정
- **Files modified:** packages/core/src/__tests__/i18n.test.ts
- **Committed in:** 4f19b1d (Task 2 commit)

**2. [Rule 1 - Bug] chain-error.test.ts ChainErrorCode 카운트 불일치 수정**
- **Found during:** Task 2 (테스트 실행)
- **Issue:** chain-error.test.ts에서 27개로 assertion하지만 실제 29개 (INVALID_RAW_TRANSACTION, WALLET_NOT_SIGNER 추가됨)
- **Fix:** 27 -> 29, PERMANENT 19 -> 21, 누락된 코드 2개 추가
- **Files modified:** packages/core/src/__tests__/chain-error.test.ts
- **Committed in:** 4f19b1d (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bug fixes)
**Impact on plan:** 기존 테스트 카운트 불일치 수정. 계획 범위에 포함된 패턴과 동일한 작업. 스코프 확장 없음.

## Issues Encountered
- pre-existing: policy-superrefine.test.ts의 SPENDING_LIMIT backward compatibility 테스트 1개 실패 (X402 변경과 무관, 기존 이슈)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- @waiaas/core 패키지에 x402 타입 시스템 완비. 후속 Phase 131(x402-handler)에서 CAIP-2 매핑과 에러 코드를 사용하여 핸들러 구현 가능
- Plan 02 (DB 마이그레이션 v12)로 진행 가능: TransactionType/PolicyType SSoT 배열이 확장되어 12-step 마이그레이션에서 자동 반영됨

## Self-Check: PASSED

- FOUND: packages/core/src/interfaces/x402.types.ts
- FOUND: packages/core/src/__tests__/x402-types.test.ts
- FOUND: .planning/phases/130-core-types-caip2-db-migration/130-01-SUMMARY.md
- FOUND: 12225c6 (Task 1 commit)
- FOUND: 4f19b1d (Task 2 commit)

---
*Phase: 130-core-types-caip2-db-migration*
*Completed: 2026-02-15*
