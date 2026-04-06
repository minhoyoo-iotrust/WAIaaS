---
phase: 134-form-infra-5type-forms
plan: 02
subsystem: ui
tags: [preact, signals, policy-forms, admin-ui, validation, dynamic-row-list]

# Dependency graph
requires:
  - phase: 134-01
    provides: DynamicRowList, PolicyFormRouter placeholder, PolicyFormProps, JSON 토글, formRulesObj/formErrors
provides:
  - SpendingLimitForm (SPENDING_LIMIT 전용 폼: 3-tier 네이티브 + USD 선택 + delay)
  - WhitelistForm (WHITELIST 전용 폼: DynamicRowList 기반 동적 주소 목록)
  - RateLimitForm (RATE_LIMIT 전용 폼: max_requests + window_seconds)
  - ApproveAmountLimitForm (APPROVE_AMOUNT_LIMIT 전용 폼: maxAmount + blockUnlimited)
  - ApproveTierOverrideForm (APPROVE_TIER_OVERRIDE 전용 폼: tier 셀렉트)
  - validateRules 함수 (5개 타입 클라이언트 유효성 검증)
  - policy-forms.test.tsx (10개 테스트: 렌더링/전환/유효성/생성 통합)
affects: [135-7type-forms]

# Tech tracking
tech-stack:
  added: []
  patterns: [type-specific form components, client-side validation with error clearing, DynamicRowList address management]

key-files:
  created:
    - packages/admin/src/components/policy-forms/spending-limit-form.tsx
    - packages/admin/src/components/policy-forms/whitelist-form.tsx
    - packages/admin/src/components/policy-forms/rate-limit-form.tsx
    - packages/admin/src/components/policy-forms/approve-amount-limit-form.tsx
    - packages/admin/src/components/policy-forms/approve-tier-override-form.tsx
    - packages/admin/src/__tests__/policy-forms.test.tsx
  modified:
    - packages/admin/src/components/policy-forms/index.tsx
    - packages/admin/src/pages/policies.tsx

key-decisions:
  - "DEFAULT_RULES 스키마 불일치 수정: APPROVE_AMOUNT_LIMIT(max_amount -> maxAmount+blockUnlimited), APPROVE_TIER_OVERRIDE(overrides:{} -> tier:'DELAY')"
  - "Create 시 validateRules로 클라이언트 유효성 검증 + onChange에서 에러 실시간 클리어"
  - "PolicyFormRouter를 .ts -> .tsx로 변경 (JSX 지원 필요)"

patterns-established:
  - "type-specific form: PolicyFormProps 인터페이스로 통일, onChange로 전체 rules 객체 전달"
  - "USD optional 필드: 빈 값 시 rules 객체에서 delete (서버 스키마 optional 매칭)"
  - "validateRules: Create 버튼 클릭 시 검증 + onChange에서 기존 에러 재검증으로 수정 즉시 반영"

# Metrics
duration: 6min
completed: 2026-02-15
---

# Phase 134 Plan 02: 5-Type Policy Forms Summary

**5개 핵심 타입(SPENDING_LIMIT, WHITELIST, RATE_LIMIT, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE) 전용 폼 + 유효성 검증 + 10개 통합 테스트**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-15T14:38:18Z
- **Completed:** 2026-02-15T14:44:44Z
- **Tasks:** 2
- **Files created:** 6
- **Files modified:** 2

## Accomplishments

- SpendingLimitForm: 3개 네이티브 금액(text, 큰 수 지원) + 3개 USD 선택(number) + delay_seconds(min 60)
- WhitelistForm: DynamicRowList로 주소 동적 행 추가/삭제, 행별 개별 에러 표시
- RateLimitForm: max_requests + window_seconds 숫자 입력
- ApproveAmountLimitForm: maxAmount 텍스트(optional) + blockUnlimited 체크박스
- ApproveTierOverrideForm: INSTANT/NOTIFY/DELAY/APPROVAL 4-옵션 셀렉트
- PolicyFormRouter switch/case 5개 타입 분기 완성 (나머지 타입은 JSON 폴백)
- validateRules 함수로 Create 시 클라이언트 유효성 검증 + onChange에서 에러 실시간 클리어
- 10개 통합 테스트 (렌더링, 타입 전환, JSON 토글, DynamicRowList, 생성, 유효성 검증 3종, APPROVE_TIER_OVERRIDE)

## Task Commits

Each task was committed atomically:

1. **Task 1: 5개 타입 전용 폼 + PolicyFormRouter 통합 + 유효성 검증** - `6f6dc5f` (feat)
2. **Task 2: 폼 렌더링 + 유효성 검증 + 생성 통합 테스트** - `2c8e775` (test)

## Files Created/Modified

- `packages/admin/src/components/policy-forms/spending-limit-form.tsx` - SPENDING_LIMIT 전용 폼 (76줄)
- `packages/admin/src/components/policy-forms/whitelist-form.tsx` - WHITELIST 전용 폼 + DynamicRowList (38줄)
- `packages/admin/src/components/policy-forms/rate-limit-form.tsx` - RATE_LIMIT 전용 폼 (30줄)
- `packages/admin/src/components/policy-forms/approve-amount-limit-form.tsx` - APPROVE_AMOUNT_LIMIT 전용 폼 (30줄)
- `packages/admin/src/components/policy-forms/approve-tier-override-form.tsx` - APPROVE_TIER_OVERRIDE 전용 폼 (23줄)
- `packages/admin/src/components/policy-forms/index.tsx` - PolicyFormRouter 5개 타입 분기 (.ts -> .tsx 변경)
- `packages/admin/src/pages/policies.tsx` - validateRules 함수 + handleCreate 검증 + onChange 에러 클리어 + DEFAULT_RULES 수정
- `packages/admin/src/__tests__/policy-forms.test.tsx` - 10개 통합 테스트 (387줄)

## Decisions Made

- DEFAULT_RULES 스키마 불일치를 Zod 스키마와 일치하도록 수정: `APPROVE_AMOUNT_LIMIT`의 `max_amount` -> `maxAmount` + `blockUnlimited: true`, `APPROVE_TIER_OVERRIDE`의 `overrides: {}` -> `tier: 'DELAY'`
- PolicyFormRouter 파일을 `.ts`에서 `.tsx`로 변경: JSX 렌더링이 필요하므로 esbuild 빌드 오류 해결
- Create 버튼 클릭 시 검증 + onChange에서 기존 에러 재검증: 사용자가 필드를 수정하면 해당 에러가 즉시 사라지는 UX

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DEFAULT_RULES 스키마 불일치 수정**
- **Found during:** Task 1
- **Issue:** APPROVE_AMOUNT_LIMIT의 DEFAULT_RULES가 `max_amount`(snake_case)를 사용했으나 Zod 스키마는 `maxAmount`(camelCase). APPROVE_TIER_OVERRIDE도 `overrides: {}`가 아닌 `tier` 필드 필요.
- **Fix:** DEFAULT_RULES를 Zod 스키마와 일치하도록 수정
- **Files modified:** packages/admin/src/pages/policies.tsx
- **Committed in:** 6f6dc5f

**2. [Rule 3 - Blocking] PolicyFormRouter .ts -> .tsx 변경**
- **Found during:** Task 1
- **Issue:** Plan 01에서 `.ts` 확장자로 생성된 PolicyFormRouter에 JSX를 추가하면 esbuild 빌드 실패
- **Fix:** `index.ts`를 `index.tsx`로 변경
- **Files modified:** packages/admin/src/components/policy-forms/index.tsx
- **Committed in:** 6f6dc5f

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 blocking issue)
**Impact on plan:** 스키마 일치 수정은 정확한 API 호출을 위한 필수 수정. .tsx 변경은 빌드 성공을 위한 필수 조치.

## Issues Encountered

- sessions.test.tsx, settings.test.tsx 기존 실패 (pre-existing, 본 플랜과 무관)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 5개 핵심 타입 전용 폼 완성 + 10개 테스트 통과
- Phase 135에서 나머지 7개 타입(ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, TIME_RESTRICTION, ALLOWED_NETWORKS, X402_ALLOWED_DOMAINS) 전용 폼 추가 예정
- 동일한 패턴(PolicyFormProps, switch/case 분기)으로 확장 가능

## Self-Check: PASSED

- All 8 files verified (6 created, 2 modified)
- Both commits verified (6f6dc5f, 2c8e775)
- Admin build: SUCCESS
- Policy-forms tests: 10/10 PASSED

---
*Phase: 134-form-infra-5type-forms*
*Completed: 2026-02-15*
