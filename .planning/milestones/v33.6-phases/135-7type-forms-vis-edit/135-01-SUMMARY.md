---
phase: 135-7type-forms-vis-edit
plan: 01
subsystem: ui
tags: [preact, signals, policy-forms, admin-ui, dynamic-row-list, validation]

# Dependency graph
requires:
  - phase: 134-02
    provides: DynamicRowList, PolicyFormRouter 5-type, PolicyFormProps, validateRules 5-type, FormField
provides:
  - AllowedTokensForm (ALLOWED_TOKENS 전용 폼: address/symbol/chain)
  - ContractWhitelistForm (CONTRACT_WHITELIST 전용 폼: address/name/chain)
  - MethodWhitelistForm (METHOD_WHITELIST 전용 폼: 2단계 중첩 contractAddress + selectors[])
  - ApprovedSpendersForm (APPROVED_SPENDERS 전용 폼: address/name/maxAmount)
  - TimeRestrictionForm (TIME_RESTRICTION 전용 폼: 시간 범위 셀렉트 + 요일 체크박스)
  - AllowedNetworksForm (ALLOWED_NETWORKS 전용 폼: network 셀렉트 + name)
  - X402AllowedDomainsForm (X402_ALLOWED_DOMAINS 전용 폼: 도메인 패턴)
  - PolicyFormRouter 12-type 완전 분기
  - validateRules 12-type 클라이언트 유효성 검증 (APPROVE_TIER_OVERRIDE 제외)
affects: [135-02-PLAN]

# Tech tracking
tech-stack:
  added: []
  patterns: [nested DynamicRowList for METHOD_WHITELIST, day-checkbox array toggle, hour range select]

key-files:
  created:
    - packages/admin/src/components/policy-forms/allowed-tokens-form.tsx
    - packages/admin/src/components/policy-forms/contract-whitelist-form.tsx
    - packages/admin/src/components/policy-forms/method-whitelist-form.tsx
    - packages/admin/src/components/policy-forms/approved-spenders-form.tsx
    - packages/admin/src/components/policy-forms/time-restriction-form.tsx
    - packages/admin/src/components/policy-forms/allowed-networks-form.tsx
    - packages/admin/src/components/policy-forms/x402-allowed-domains-form.tsx
  modified:
    - packages/admin/src/components/policy-forms/index.tsx
    - packages/admin/src/pages/policies.tsx

key-decisions:
  - "chain 셀렉트 옵션은 각 폼 내부에 CHAIN_OPTIONS 로컬 상수로 정의 (core는 Node.js 전용이라 admin에서 import 불가)"
  - "NETWORK_OPTIONS 13개 네트워크를 AllowedNetworksForm 내부에 하드코딩 (동일 이유)"
  - "METHOD_WHITELIST는 2단계 중첩 DynamicRowList 패턴 (외부: method entry, 내부: selectors)"

patterns-established:
  - "중첩 DynamicRowList: 외부 행의 renderRow 안에서 내부 DynamicRowList를 독립적으로 관리"
  - "체크박스 배열 관리: includes() 검사 + filter/spread로 toggle"
  - "셀렉트 기반 시간 범위: HOUR_START_OPTIONS(0-23) + HOUR_END_OPTIONS(1-24)"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 135 Plan 01: 7-Type Policy Forms Summary

**7개 나머지 PolicyType 전용 폼 컴포넌트 + PolicyFormRouter 12-type 완전 분기 + validateRules 12-type 클라이언트 유효성 검증**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T15:02:20Z
- **Completed:** 2026-02-15T15:04:55Z
- **Tasks:** 2
- **Files created:** 7
- **Files modified:** 2

## Accomplishments

- AllowedTokensForm: DynamicRowList 기반, address(필수)/symbol/chain(셀렉트, 빈값=전체) 3열 가로 배치
- ContractWhitelistForm: DynamicRowList 기반, address(필수)/name/chain 셀렉트 3열 배치
- MethodWhitelistForm: 2단계 중첩 DynamicRowList -- 외부(contractAddress + selectors[]), 내부(selector 문자열) 독립 추가/삭제
- ApprovedSpendersForm: DynamicRowList 기반, address(필수)/name/maxAmount(빈값=unlimited) -- maxAmount 빈값 시 객체에서 delete
- TimeRestrictionForm: allowed_hours start/end 셀렉트(0-23/1-24) + allowed_days 7개 체크박스(Sun-Sat) 가로 배치
- AllowedNetworksForm: DynamicRowList 기반, network 셀렉트(13개 네트워크)/name 텍스트
- X402AllowedDomainsForm: WhitelistForm 동일 패턴, 도메인 문자열 동적 행
- PolicyFormRouter: 12개 PolicyType 전체 switch/case 분기 (JSON 폴백 사용 타입 0개)
- validateRules: 7개 신규 타입의 배열 길이 + 필수 필드 + 패턴 검증 추가 (총 11개 타입 검증)

## Task Commits

Each task was committed atomically:

1. **Task 1: 7개 타입 전용 폼 + PolicyFormRouter 12-type 통합** - `f846423` (feat)
2. **Task 2: validateRules 7개 타입 유효성 검증 추가** - `1195b51` (feat)

## Files Created/Modified

- `packages/admin/src/components/policy-forms/allowed-tokens-form.tsx` - ALLOWED_TOKENS 전용 폼 (57줄)
- `packages/admin/src/components/policy-forms/contract-whitelist-form.tsx` - CONTRACT_WHITELIST 전용 폼 (57줄)
- `packages/admin/src/components/policy-forms/method-whitelist-form.tsx` - METHOD_WHITELIST 전용 폼 2단계 중첩 (79줄)
- `packages/admin/src/components/policy-forms/approved-spenders-form.tsx` - APPROVED_SPENDERS 전용 폼 (53줄)
- `packages/admin/src/components/policy-forms/time-restriction-form.tsx` - TIME_RESTRICTION 전용 폼 (72줄)
- `packages/admin/src/components/policy-forms/allowed-networks-form.tsx` - ALLOWED_NETWORKS 전용 폼 (60줄)
- `packages/admin/src/components/policy-forms/x402-allowed-domains-form.tsx` - X402_ALLOWED_DOMAINS 전용 폼 (31줄)
- `packages/admin/src/components/policy-forms/index.tsx` - PolicyFormRouter 12-type 전체 분기 (62줄)
- `packages/admin/src/pages/policies.tsx` - validateRules 7개 타입 검증 분기 추가

## Decisions Made

- chain 셀렉트 옵션(CHAIN_OPTIONS)은 AllowedTokensForm/ContractWhitelistForm 각 내부에 로컬 상수로 정의: core 패키지는 Node.js 전용이라 admin에서 직접 import 불가
- NETWORK_OPTIONS 13개 네트워크를 AllowedNetworksForm 내부에 하드코딩: 동일 이유, NETWORK_TYPES 배열과 동기화 유지 필요
- MethodWhitelistForm에 2단계 중첩 DynamicRowList 패턴 적용: contractAddress 당 복수 selectors를 관리하는 Zod 스키마 구조 반영

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 12개 PolicyType 전체 전용 폼 완성 (Phase 134의 5개 + Phase 135-01의 7개)
- Plan 02에서 정책 목록 시각화 + 수정 폼 통합 진행 예정

## Self-Check: PASSED

- All 9 files verified (7 created, 2 modified)
- Both commits verified (f846423, 1195b51)
- Admin build: SUCCESS
- PolicyFormRouter: 12 case statements confirmed
- policy-forms directory: 13 files confirmed (12 forms + index.tsx)
- validateRules: 11 types with validation (APPROVE_TIER_OVERRIDE excluded by design)

---
*Phase: 135-7type-forms-vis-edit*
*Completed: 2026-02-15*
