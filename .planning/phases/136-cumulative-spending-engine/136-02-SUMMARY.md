---
phase: 136-cumulative-spending-engine
plan: 02
subsystem: policy-engine, notifications, approval-workflow
tags: [cumulative-spending, usd-limits, approval-escalation, notifications]
dependency-graph:
  requires:
    - "136-01: DB v13 amount_usd/reserved_amount_usd columns"
    - "136-01: SpendingLimitRulesSchema daily_limit_usd/monthly_limit_usd fields"
    - "136-01: evaluateAndReserve USD amount recording"
  provides:
    - "evaluateAndReserve: 24h/30d rolling window cumulative USD aggregation + APPROVAL escalation"
    - "getCumulativeUsdSpent: SUM(amount_usd) + SUM(reserved_amount_usd) helper"
    - "PolicyEvaluation.approvalReason: per_tx / cumulative_daily / cumulative_monthly"
    - "PolicyEvaluation.cumulativeWarning: 80% threshold warning"
    - "CUMULATIVE_LIMIT_WARNING notification event type"
    - "TX_APPROVAL_REQUIRED notification with reason field"
    - "approval-workflow: reserved_amount_usd NULL clearing on approve/reject/expire"
  affects:
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/pipeline/stages.ts"
    - "packages/core/src/interfaces/IPolicyEngine.ts"
    - "packages/core/src/enums/notification.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"
    - "packages/daemon/src/workflow/approval-workflow.ts"
tech-stack:
  added: []
  patterns:
    - "Rolling window cumulative aggregation via SUM() within BEGIN IMMEDIATE transaction"
    - "max(per_tx tier, cumulative tier) conservative tier selection"
    - "80% threshold warning via cumulativeWarning optional field"
key-files:
  created:
    - "packages/daemon/src/__tests__/cumulative-spending.test.ts"
  modified:
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/pipeline/stages.ts"
    - "packages/core/src/interfaces/IPolicyEngine.ts"
    - "packages/core/src/enums/notification.ts"
    - "packages/core/src/i18n/en.ts"
    - "packages/core/src/i18n/ko.ts"
    - "packages/daemon/src/workflow/approval-workflow.ts"
    - "packages/daemon/src/__tests__/notification-channels.test.ts"
key-decisions:
  - "SIGNED 상태 중복 카운팅 방지: CONFIRMED/SIGNED는 amount_usd로, PENDING/QUEUED는 reserved_amount_usd로 분리 집계"
  - "daily 초과가 먼저 감지되면 monthly 평가 스킵 (cumulativeReason === undefined 체크)"
  - "80% 경고는 한도 미초과 + 초과 미발생 시에만 설정 (초과 시 APPROVAL이 우선)"
  - "daily 경고가 설정되면 monthly 경고는 스킵 (중복 알림 방지)"
  - "APPROVAL 격상 알림은 downgrade 전 tier 기준 -- downgraded=true면 발송 안함"
metrics:
  duration: "6m 16s"
  completed: "2026-02-16"
  tasks: 2
  files-modified: 8
  files-created: 1
  tests-added: 13
  tests-total-passed: 159
---

# Phase 136 Plan 02: evaluateAndReserve 누적 USD 집계 + APPROVAL 격상 Summary

evaluateAndReserve의 BEGIN IMMEDIATE 트랜잭션 내에서 24시간/30일 롤링 윈도우 누적 USD 집계, 한도 초과 APPROVAL 격상, 80% 경고 알림, TX_APPROVAL_REQUIRED reason 필드를 구현.

## What was done

### Task 1: PolicyEvaluation 확장 + CUMULATIVE_LIMIT_WARNING 이벤트 + approval-workflow USD 클리어
- **IPolicyEngine.ts**: PolicyEvaluation에 `approvalReason` (per_tx/cumulative_daily/cumulative_monthly)와 `cumulativeWarning` ({type, ratio, spent, limit}) 필드 추가
- **notification.ts**: CUMULATIVE_LIMIT_WARNING 이벤트 타입 추가 (21 -> 22개)
- **en.ts / ko.ts**: CUMULATIVE_LIMIT_WARNING 알림 메시지 템플릿 추가 (영문/한글)
- **notification-channels.test.ts**: 이벤트 수 21 -> 22 업데이트, CUMULATIVE_LIMIT_WARNING 포함 assertion 추가
- **approval-workflow.ts**: approve(), reject(), processExpiredApprovals() 3곳에서 `reserved_amount_usd = NULL` 클리어 추가
- Commit: `a9cce6c`

### Task 2: evaluateAndReserve 누적 집계 + APPROVAL 격상 + Stage 3 알림
- **database-policy-engine.ts**: SpendingLimitRules 인터페이스에 daily_limit_usd/monthly_limit_usd 추가
- **database-policy-engine.ts**: `getCumulativeUsdSpent()` 헬퍼 -- CONFIRMED/SIGNED amount_usd + PENDING/QUEUED reserved_amount_usd 분리 집계
- **database-policy-engine.ts**: evaluateAndReserve Step 6 -- 24시간/30일 롤링 윈도우 누적 평가, 한도 초과 시 APPROVAL 격상, 80% 경고 시 cumulativeWarning 설정
- **database-policy-engine.ts**: evaluateAndReserve Step 7 -- max(perTxTier, cumulativeTier) 최종 tier 결정
- **database-policy-engine.ts**: evaluateSpendingLimit에서 APPROVAL 시 approvalReason 'per_tx' 반환
- **stages.ts**: Stage 3에서 CUMULATIVE_LIMIT_WARNING 알림 발송 (80% 경고), TX_APPROVAL_REQUIRED 알림에 reason 필드 추가
- **cumulative-spending.test.ts**: 12개 단위 테스트 (누적 미초과, daily/monthly 초과, PENDING/QUEUED 포함, CANCELLED/EXPIRED 제외, max tier, 80% 경고, 오라클 장애, 윈도우 외 제외, per-tx APPROVAL, monthly 경고, QUEUED 포함)
- Commit: `acd5d7d`

## Verification Results

| Test Suite | Tests | Status |
|---|---|---|
| cumulative-spending.test.ts | 12 | PASS |
| database-policy-engine.test.ts | 75 | PASS |
| approval-workflow.test.ts | 14 | PASS |
| notification-channels.test.ts | 50 | PASS |
| i18n.test.ts | 8 | PASS |
| **Total** | **159** | **ALL PASS** |

- `npx turbo build` -- FULL BUILD SUCCESS (8 packages)
- NOTIFICATION_EVENT_TYPES.length === 22 confirmed
- approvalReason returns 'per_tx', 'cumulative_daily', or 'cumulative_monthly' as appropriate
- reserved_amount_usd cleared on approve/reject/expire (3 UPDATE queries updated)

## Deviations from Plan

None -- plan executed exactly as written.

## Success Criteria

- [x] CUMUL-04: evaluateAndReserve에서 24시간/30일 롤링 윈도우 내 누적 USD 지출을 집계하여 한도 초과 시 APPROVAL로 격상
- [x] CUMUL-05: PENDING/QUEUED의 reserved_amount_usd가 누적 합산에 포함되어 이중 지출 방지
- [x] CUMUL-06: 누적 지출이 한도의 80%에 도달하면 CUMULATIVE_LIMIT_WARNING 알림 발송
- [x] CUMUL-07: TX_APPROVAL_REQUIRED 이벤트에 reason 필드(per_tx/cumulative_daily/cumulative_monthly) 포함
- [x] 모든 기존 테스트 + 새 테스트 통과 (159개)

## Self-Check: PASSED

- All 10 files verified (FOUND)
- Commit a9cce6c verified (Task 1)
- Commit acd5d7d verified (Task 2)
