---
phase: 127-usd-policy-integration
plan: 01
subsystem: pipeline
tags: [price-oracle, usd-conversion, discriminated-union, tdd, pipeline]

# Dependency graph
requires:
  - phase: 126-oracle-chain
    provides: "OracleChain (IPriceOracle), PriceNotAvailableError, PriceInfo"
  - phase: 125-price-oracle-infra
    provides: "IPriceOracle interface, InMemoryPriceCache, PriceNotAvailableError"
provides:
  - "PriceResult 3-state discriminated union (success/oracleDown/notListed)"
  - "resolveEffectiveAmountUsd() -- 5-type 트랜잭션 USD 환산 함수"
  - "BATCH instruction별 USD 합산 + failedCount tracking"
affects: [127-02, 127-03, 128-spending-limit-usd, 129-mcp-oracle-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PriceResult 3-state discriminated union: success/oracleDown/notListed"
    - "BATCH getNativePrice 선행 + instruction별 순회 합산 패턴"
    - "PriceNotAvailableError catch -> notListed, 기타 에러 -> oracleDown 분류"

key-files:
  created:
    - packages/daemon/src/pipeline/resolve-effective-amount-usd.ts
    - packages/daemon/src/__tests__/resolve-effective-amount-usd.test.ts
  modified:
    - packages/daemon/src/pipeline/index.ts

key-decisions:
  - "PriceResult를 plain TypeScript discriminated union으로 구현 (Zod discriminatedUnion 불필요 -- 단순 타입 분기)"
  - "resolveEffectiveAmountUsd request 파라미터를 Record<string,unknown>으로 정의 (stages.ts의 as 캐스팅 패턴과 동일)"
  - "BATCH instruction 분류를 classifyInstruction 헬퍼로 분리 (stage3Policy와 동일 로직 재사용)"

patterns-established:
  - "PriceResult 3-state: success(usdAmount,isStale) / oracleDown / notListed(tokenAddress,chain,failedCount?)"
  - "Oracle 호출은 evaluateAndReserve 진입 전 완료 (better-sqlite3 동기 트랜잭션 제약)"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 127 Plan 01: resolveEffectiveAmountUsd Summary

**PriceResult 3-state discriminated union + resolveEffectiveAmountUsd 5-type USD 환산 (TDD 16 tests)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T07:45:46Z
- **Completed:** 2026-02-15T07:48:59Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- PriceResult 3-state discriminated union (success/oracleDown/notListed) 구현 -- "가격 불명 != 가격 0" 보안 원칙
- resolveEffectiveAmountUsd() 5-type(TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH) USD 환산
- BATCH instruction별 합산 + notListed failedCount tracking + oracleDown 조기 반환
- TDD RED->GREEN 16개 테스트 전체 PASS, 기존 daemon 1006 테스트 회귀 없음

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD RED -- resolveEffectiveAmountUsd 테스트 작성** - `22e0b20` (test)
2. **Task 2: TDD GREEN -- PriceResult 3-state + resolveEffectiveAmountUsd 구현** - `6d16736` (feat)

_Note: TDD plan -- test commit (RED) followed by implementation commit (GREEN)._

## Files Created/Modified
- `packages/daemon/src/pipeline/resolve-effective-amount-usd.ts` - PriceResult 3-state union + resolveEffectiveAmountUsd() + resolveBatchUsd() + classifyInstruction()
- `packages/daemon/src/__tests__/resolve-effective-amount-usd.test.ts` - 16개 단위 테스트 (5-type 분기 + 에러 핸들링)
- `packages/daemon/src/pipeline/index.ts` - resolve-effective-amount-usd barrel re-export 추가

## Decisions Made
- PriceResult를 plain TypeScript discriminated union으로 구현 (Zod discriminatedUnion은 단순 타입 분기에 과도)
- resolveEffectiveAmountUsd request 파라미터를 `Record<string,unknown>`으로 정의 -- stages.ts의 `as` 캐스팅 패턴과 동일하게 5-type 필드에 접근
- BATCH instruction 분류를 classifyInstruction 헬퍼로 분리 -- stage3Policy BATCH 분류와 동일 로직

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- resolveEffectiveAmountUsd()가 pipeline/index.ts에서 export되어 Plan 02(stage3Policy 통합)에서 import 가능
- PriceResult 타입이 Plan 02(evaluateSpendingLimit USD 분기)와 Plan 03(daemon DI 연결)에서 사용 가능
- 기존 daemon 테스트 1006개 전체 PASS 유지

## Self-Check: PASSED

- All 3 created/modified files verified on disk
- Both task commits (22e0b20, 6d16736) verified in git log
- 16 tests passing, 1006 daemon tests with 0 regressions

---
*Phase: 127-usd-policy-integration*
*Completed: 2026-02-15*
