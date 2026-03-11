---
phase: 384-policy-tracking
plan: 01
subsystem: policy
tags: [venue-whitelist, action-category-limit, transaction-param, risk-level, zod, policy-engine]

requires:
  - phase: 383-pipeline-routing
    provides: toPolicyParam() 변환 흐름 + 정책 평가 시점 placeholder
  - phase: 380-resolved-action-type-system
    provides: SignedDataActionPolicyContextSchema + policyContext 필드 정의
provides:
  - TransactionParam 6개 off-chain 확장 필드 (venue/actionCategory/notionalUsd/leverage/expiry/hasWithdrawCapability)
  - VENUE_WHITELIST default-deny 정책 설계 (VenueWhitelistRulesSchema)
  - ACTION_CATEGORY_LIMIT 카테고리별 누적 한도 정책 설계 (ActionCategoryLimitRulesSchema)
  - ActionDefinition riskLevel 4등급 + defaultTier 자동 매핑
affects: [385-design-integration, policy-engine, admin-ui-policy-forms]

tech-stack:
  added: []
  patterns: [VENUE_WHITELIST default-deny (CONTRACT_WHITELIST 패턴), ACTION_CATEGORY_LIMIT 카테고리별 누적 한도, riskLevel -> defaultTier 4단계 자동 매핑]

key-files:
  created:
    - .planning/phases/384-policy-tracking/design/policy-extension-design.md
  modified: []

key-decisions:
  - "VENUE_WHITELIST는 default-deny + Admin Settings venue_whitelist_enabled로 비활성화 가능 (초기 유연성)"
  - "ACTION_CATEGORY_LIMIT와 SPENDING_LIMIT 완전 독립 (on-chain amount vs off-chain notionalUsd)"
  - "notionalUsd를 metadata JSON에 저장 (스키마 변경 최소화, json_extract 쿼리)"
  - "riskLevel 4등급 자동 매핑: low->INSTANT, medium->NOTIFY, high->DELAY, critical->APPROVAL"
  - "requiresVenueWhitelist는 venue_whitelist_enabled 무시 (ActionProvider 강제 요구)"

patterns-established:
  - "VENUE_WHITELIST: CONTRACT_WHITELIST와 동일한 default-deny 패턴, toLowerCase 정규화"
  - "ACTION_CATEGORY_LIMIT: SPENDING_LIMIT 패턴 확장, evaluateAndReserve BEGIN IMMEDIATE 재사용"
  - "riskLevel -> defaultTier: ActionProvider 개발자가 위험도 선언, 정책 미설정 시 자동 적용"

requirements-completed: [PLCY-01, PLCY-02, PLCY-03, PLCY-04]

duration: 5min
completed: 2026-03-12
---

# Phase 384 Plan 01: Policy Extension Design Summary

**VENUE_WHITELIST default-deny + ACTION_CATEGORY_LIMIT 카테고리별 누적 USD 한도 + ActionDefinition riskLevel 4등급 자동 매핑으로 off-chain action 정책 평가 체계 설계**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T15:32:07Z
- **Completed:** 2026-03-11T15:37:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- TransactionParam에 venue/actionCategory/notionalUsd/leverage/expiry/hasWithdrawCapability 6개 off-chain 확장 필드 설계
- VENUE_WHITELIST 정책: CONTRACT_WHITELIST 패턴 재사용, default-deny, venue id toLowerCase 정규화, network 무시
- ACTION_CATEGORY_LIMIT 정책: 5종 카테고리별 daily/monthly/per-action USD 누적 한도, TOCTOU 방지 BEGIN IMMEDIATE 재사용
- ActionDefinition riskLevel 4등급(low/medium/high/critical) -> defaultTier 자동 매핑
- 10개 설계 결정 + 9개 pitfall 방지 체크리스트

## Task Commits

1. **Task 1: off-chain action 정책 확장 설계 문서 작성** - `7c8085d5` (docs)

## Files Created/Modified
- `.planning/phases/384-policy-tracking/design/policy-extension-design.md` - PLCY-01~04 전체 설계

## Decisions Made
- VENUE_WHITELIST는 default-deny이나 Admin Settings `policy.venue_whitelist_enabled`(기본 false)로 비활성화 가능
- ACTION_CATEGORY_LIMIT와 SPENDING_LIMIT은 완전 독립 (이중 차감 없음)
- notionalUsd는 metadata JSON에 저장 (별도 컬럼 아님, json_extract 쿼리)
- riskLevel 없는 기존 ActionDefinition은 INSTANT (기존 동작 무변경)
- requiresVenueWhitelist=true면 venue_whitelist_enabled 설정과 무관하게 VENUE_WHITELIST 필수

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 385 설계 문서 통합(doc-77)에서 정책 확장 섹션 포함 가능
- ACTION_CATEGORY_LIMIT 누적 쿼리 성능은 구현 시 EXPLAIN QUERY PLAN으로 검증 필요

---
*Phase: 384-policy-tracking*
*Completed: 2026-03-12*
