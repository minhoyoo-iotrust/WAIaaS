---
phase: 134-form-infra-5type-forms
plan: 01
subsystem: ui
tags: [preact, signals, zod, policy-forms, admin-ui, dynamic-row-list]

# Dependency graph
requires:
  - phase: 104-mcp-5type-skill-files
    provides: PolicyType 12종 enum, POLICY_RULES_SCHEMAS 8종 등록
provides:
  - DynamicRowList 재사용 컴포넌트 (동적 행 추가/삭제)
  - PolicyFormRouter 타입별 분기 구조 (placeholder)
  - JSON 토글 상태 관리 (jsonMode, formRulesObj, formErrors)
  - 4개 미등록 Zod rules 스키마 (WHITELIST, RATE_LIMIT, TIME_RESTRICTION, X402_ALLOWED_DOMAINS)
  - X402_ALLOWED_DOMAINS 드롭다운 옵션
  - CSS: dynamic-row-list, policy-form-section, json-toggle, placeholder
affects: [134-02-PLAN, 135-7type-forms]

# Tech tracking
tech-stack:
  added: []
  patterns: [PolicyFormRouter switch/case 분기, DynamicRowList renderRow 콜백, JSON/Form 듀얼 모드]

key-files:
  created:
    - packages/admin/src/components/dynamic-row-list.tsx
    - packages/admin/src/components/policy-forms/index.ts
  modified:
    - packages/core/src/schemas/policy.schema.ts
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/core/src/__tests__/policy-superrefine.test.ts
    - packages/admin/src/pages/policies.tsx
    - packages/admin/src/styles/global.css

key-decisions:
  - "POLICY_RULES_SCHEMAS를 Partial<Record>에서 Record로 변경 (12개 전체 등록)"
  - "기존 free-form 테스트를 구조화 검증 테스트로 갱신 (backward compatibility -> strict validation)"
  - "DEFAULT_RULES 타입을 Record<string, Record<string, unknown>>으로 강화"

patterns-established:
  - "PolicyFormRouter: type prop으로 분기, PolicyFormProps 인터페이스로 통일"
  - "DynamicRowList: generic T 타입, renderRow 콜백으로 행 렌더링 위임"
  - "JSON 토글: jsonMode signal로 JSON textarea / PolicyFormRouter 전환"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 134 Plan 01: Form Infra Summary

**12개 PolicyType 전체 Zod 스키마 등록 + DynamicRowList/PolicyFormRouter/JSON 토글 폼 인프라 구축**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-15T14:30:33Z
- **Completed:** 2026-02-15T14:35:50Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- 4개 미등록 PolicyType(WHITELIST, RATE_LIMIT, TIME_RESTRICTION, X402_ALLOWED_DOMAINS) Zod rules 스키마 추가, POLICY_RULES_SCHEMAS 12개 전체 등록
- DynamicRowList 재사용 컴포넌트 (generic T, renderRow/onAdd/onRemove/onChange, minItems)
- PolicyFormRouter 타입별 분기 구조 (현재 placeholder, Plan 02에서 5개 타입 폼 추가 예정)
- policies.tsx JSON 토글 (jsonMode/formRulesObj/formErrors signal), X402_ALLOWED_DOMAINS 드롭다운 추가
- policy-superrefine 테스트 29개 통과 (기존 free-form -> 구조화 검증 갱신)

## Task Commits

Each task was committed atomically:

1. **Task 1: 4개 미등록 Zod rules 스키마 추가 + core export** - `0fe0852` (feat)
2. **Task 2: DynamicRowList + PolicyFormRouter + JSON 토글 + policies.tsx 리팩터링 + CSS** - `b3b65be` (feat)

## Files Created/Modified
- `packages/core/src/schemas/policy.schema.ts` - 4개 신규 Zod rules 스키마 + POLICY_RULES_SCHEMAS 12개 전체 등록
- `packages/core/src/schemas/index.ts` - 4개 스키마 re-export 추가
- `packages/core/src/index.ts` - 4개 스키마 re-export 추가
- `packages/core/src/__tests__/policy-superrefine.test.ts` - 29개 테스트 (4개 신규 타입 + 기존 갱신)
- `packages/admin/src/components/dynamic-row-list.tsx` - DynamicRowList 재사용 컴포넌트
- `packages/admin/src/components/policy-forms/index.ts` - PolicyFormRouter + PolicyFormProps
- `packages/admin/src/pages/policies.tsx` - JSON 토글, formRulesObj, X402_ALLOWED_DOMAINS, PolicyFormRouter 통합
- `packages/admin/src/styles/global.css` - dynamic-row-list, policy-form CSS

## Decisions Made
- POLICY_RULES_SCHEMAS를 `Partial<Record<string, z.ZodTypeAny>>`에서 `Record<string, z.ZodTypeAny>`로 변경: 12개 전체 타입이 등록되었으므로 타입 안전성 강화
- 기존 backward compatibility 테스트(free-form rules)를 구조화 검증 테스트로 갱신: 이제 모든 타입이 스키마 검증을 거치므로 free-form 테스트는 더 이상 유효하지 않음
- DEFAULT_RULES 타입을 `Record<string, unknown>`에서 `Record<string, Record<string, unknown>>`으로 강화: formRulesObj와의 타입 호환성 확보

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 기존 backward compatibility 테스트 갱신**
- **Found during:** Task 1
- **Issue:** 4개 타입에 Zod 스키마를 추가하면서 기존 free-form rules 테스트가 실패하게 됨
- **Fix:** backward compatibility 테스트를 제거하고 4개 신규 타입별 구조화 검증 테스트로 교체
- **Files modified:** packages/core/src/__tests__/policy-superrefine.test.ts
- **Verification:** 29개 테스트 전체 통과
- **Committed in:** 0fe0852 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** 테스트 갱신은 스키마 변경의 필연적 결과. Scope creep 없음.

## Issues Encountered
- sessions.test.tsx, settings.test.tsx 기존 실패 (pre-existing, 본 플랜과 무관)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DynamicRowList + PolicyFormRouter 인프라 준비 완료
- Plan 02에서 5개 타입(SPENDING_LIMIT, ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS) 전용 폼 구현 예정
- PolicyFormRouter의 switch/case에 타입별 컴포넌트 import만 추가하면 됨

---
*Phase: 134-form-infra-5type-forms*
*Completed: 2026-02-15*
