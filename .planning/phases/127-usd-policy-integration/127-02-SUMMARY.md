---
phase: 127-usd-policy-integration
plan: 02
subsystem: pipeline
tags: [spending-limit, zod-ssot, usd-policy, policy-engine, tier-classification]

# Dependency graph
requires:
  - phase: 127-usd-policy-integration
    plan: 01
    provides: "PriceResult 3-state, resolveEffectiveAmountUsd()"
provides:
  - "SpendingLimitRulesSchema Zod SSoT (instant_max_usd/notify_max_usd/delay_max_usd optional)"
  - "evaluateSpendingLimit USD 분기 (maxTier 보수적 선택)"
  - "evaluateAndReserve 인라인 SPENDING_LIMIT 코드 통일 (evaluateSpendingLimit 호출)"
  - "evaluateBatch batchUsdAmount 파라미터 확장"
  - "TIER_ORDER + maxTier 헬퍼 (모듈 레벨 공유)"
affects: [127-03, 128-spending-limit-usd, 129-mcp-oracle-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "maxTier(nativeTier, usdTier) 보수적 선택 패턴"
    - "evaluateNativeTier/evaluateUsdTier/hasUsdThresholds private 헬퍼 분리"
    - "evaluateAndReserve 인라인 코드를 evaluateSpendingLimit 호출로 통일 (DRY)"

key-files:
  created: []
  modified:
    - packages/core/src/schemas/policy.schema.ts
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/__tests__/database-policy-engine.test.ts

key-decisions:
  - "TIER_ORDER + maxTier를 클래스 외부 모듈 레벨에 배치 (evaluateBatch 기존 tierOrder와 동일 패턴이나 공유 가능)"
  - "evaluateNativeTier를 별도 private 메서드로 추출하여 evaluateSpendingLimit 가독성 향상"
  - "usdAmount=0일 때 USD 평가 스킵 (APPROVE 등 네이티브 금액 0인 케이스 안전 처리)"
  - "SpendingLimitRulesSchema를 named export하여 daemon 테스트에서 직접 검증 가능"

patterns-established:
  - "maxTier(a, b): 두 PolicyTier 중 더 보수적인(높은 인덱스) 티어 반환"
  - "hasUsdThresholds() 가드: USD 필드 존재 여부 확인 후 USD 평가 진행"
  - "evaluateAndReserve에서 effectiveAmount 계산 후 evaluateSpendingLimit(resolved, amount, usdAmount) 통일 호출"

# Metrics
duration: 6min
completed: 2026-02-15
---

# Phase 127 Plan 02: SpendingLimitRulesSchema + evaluateSpendingLimit USD 분기 Summary

**SpendingLimitRulesSchema Zod SSoT + evaluateSpendingLimit USD 병행 평가 + evaluateAndReserve 코드 통일 (10 tests)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-15T07:51:11Z
- **Completed:** 2026-02-15T07:57:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- SpendingLimitRulesSchema를 Zod SSoT로 정의, POLICY_RULES_SCHEMAS에 등록하여 SPENDING_LIMIT 정책 생성 시 instant_max_usd/notify_max_usd/delay_max_usd 포함 rules 검증
- evaluateSpendingLimit에 usdAmount 파라미터 추가, evaluateNativeTier + evaluateUsdTier + hasUsdThresholds + maxTier 헬퍼로 네이티브+USD 병행 평가
- evaluateAndReserve 내부 인라인 SPENDING_LIMIT 코드를 evaluateSpendingLimit() 호출로 통일 (DRY)
- evaluateBatch에 batchUsdAmount 파라미터 추가하여 Phase B USD 평가 준비 완료
- 10개 신규 테스트 추가, 기존 65개 + 신규 10개 = 75개 전체 PASS, daemon 전체 1016 테스트 회귀 없음

## Task Commits

Each task was committed atomically:

1. **Task 1: SpendingLimitRulesSchema Zod SSoT + evaluateSpendingLimit USD 분기** - `ff3c8c0` (feat)
2. **Task 2: USD SPENDING_LIMIT 단위 테스트 10개** - `cbe97df` (test)

## Files Created/Modified
- `packages/core/src/schemas/policy.schema.ts` - SpendingLimitRulesSchema Zod 정의 + POLICY_RULES_SCHEMAS에 SPENDING_LIMIT 등록
- `packages/core/src/schemas/index.ts` - SpendingLimitRulesSchema/SpendingLimitRules re-export 추가
- `packages/core/src/index.ts` - SpendingLimitRulesSchema/SpendingLimitRules re-export 추가
- `packages/daemon/src/pipeline/database-policy-engine.ts` - TIER_ORDER/maxTier 헬퍼, evaluateSpendingLimit USD 분기, evaluateNativeTier/evaluateUsdTier/hasUsdThresholds, evaluateAndReserve 통일, evaluateBatch batchUsdAmount
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` - USD SPENDING_LIMIT 10개 테스트 블록 추가

## Decisions Made
- TIER_ORDER + maxTier를 클래스 외부 모듈 레벨에 배치 -- evaluateBatch에서도 동일 패턴 사용 가능
- evaluateNativeTier를 별도 private 메서드로 추출 -- evaluateSpendingLimit의 로직을 네이티브/USD로 명확 분리
- usdAmount=0일 때 USD 평가 스킵 -- APPROVE 타입은 usdAmount=0이므로 USD 평가 불필요
- SpendingLimitRulesSchema를 named export -- daemon 테스트에서 직접 Zod 검증 테스트 가능

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] superRefine 주석 정정**
- **Found during:** Task 2 (테스트 작성)
- **Issue:** CreatePolicyRequestSchema 주석이 "기존 4 types" 검증 미대상으로 기술하지만 SPENDING_LIMIT 등록으로 8개 타입 검증 대상으로 변경
- **Fix:** 주석을 "8 PolicyTypes (v1.4 + SPENDING_LIMIT)"로 정정
- **Files modified:** packages/core/src/schemas/policy.schema.ts
- **Verification:** 주석 일관성 확인
- **Committed in:** cbe97df (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** 주석 정정으로 코드 정확도 향상. 기능 변경 없음.

## Issues Encountered
- core 패키지 dist가 stale 상태여서 SpendingLimitRulesSchema import 실패 -> `npm run build` 재빌드로 해결
- 테스트 수를 계획의 8개에서 10개로 증가 (Zod superRefine 검증 + usdAmount=0 스킵 테스트 추가)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- evaluateSpendingLimit가 usdAmount를 받아 maxTier를 반환하므로 Plan 03(stage3Policy 통합)에서 resolveEffectiveAmountUsd -> evaluateAndReserve(usdAmount) 연결 가능
- SpendingLimitRulesSchema가 POLICY_RULES_SCHEMAS에 등록되어 REST API에서 SPENDING_LIMIT 정책 생성 시 USD 필드 포함 검증 동작
- evaluateBatch에 batchUsdAmount 파라미터가 준비되어 BATCH 타입 USD 평가 연결 가능
- daemon 전체 1016 테스트 PASS 유지

## Self-Check: PASSED

- All 5 modified files verified on disk
- Both task commits (ff3c8c0, cbe97df) verified in git log
- 75 policy engine tests passing, 1016 daemon tests with 0 regressions

---
*Phase: 127-usd-policy-integration*
*Completed: 2026-02-15*
