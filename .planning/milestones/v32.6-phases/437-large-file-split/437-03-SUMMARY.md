---
phase: 437-large-file-split
plan: 03
subsystem: pipeline
tags: [policy-engine, evaluator, refactoring, file-split]

requires:
  - phase: 437-01
    provides: stable migration refactoring pattern

provides:
  - 6 evaluator modules for independent policy type maintenance
  - ParseRulesContext pattern for dependency injection in evaluators

affects: [438-pipeline-split]

tech-stack:
  added: []
  patterns: [ParseRulesContext for evaluator dependency injection, maxTier shared helper]

key-files:
  created:
    - packages/daemon/src/pipeline/evaluators/types.ts
    - packages/daemon/src/pipeline/evaluators/helpers.ts
    - packages/daemon/src/pipeline/evaluators/allowed-tokens.ts
    - packages/daemon/src/pipeline/evaluators/contract-whitelist.ts
    - packages/daemon/src/pipeline/evaluators/approved-spenders.ts
    - packages/daemon/src/pipeline/evaluators/spending-limit.ts
    - packages/daemon/src/pipeline/evaluators/lending-asset-whitelist.ts
    - packages/daemon/src/pipeline/evaluators/lending-ltv-limit.ts
  modified:
    - packages/daemon/src/pipeline/database-policy-engine.ts

key-decisions:
  - "Use ParseRulesContext + SettingsContext interfaces for evaluator dependency injection"
  - "Keep REPUTATION_THRESHOLD evaluation in DatabasePolicyEngine (async, uses ReputationCacheService)"
  - "Group evaluators by affinity: perp markets with contract whitelist, perp limits with lending limits"
  - "Export PolicyRow and TransactionParam types from evaluators/types.ts for shared use"

patterns-established:
  - "Extract evaluator functions with context parameter instead of this binding"
  - "Shared helpers in evaluators/helpers.ts (maxTier)"

requirements-completed: [DPE-01, DPE-02, DPE-03, DPE-04, DPE-05, DPE-06, DPE-07, DPE-08]

duration: 12min
completed: 2026-03-17
---

# Phase 437 Plan 03: database-policy-engine.ts Split Summary

**Split database-policy-engine.ts (2,318 lines) into orchestrator (852 lines) + 8 evaluator files (1,152 lines) across evaluators/ directory**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-17T04:10:00Z
- **Completed:** 2026-03-17T04:22:00Z
- **Tasks:** 2 of 2 planned
- **Files modified:** 9

## Accomplishments
- Created evaluators/ directory with 8 files (6 evaluator + types + helpers)
- Extracted WHITELIST/ALLOWED_TOKENS/ALLOWED_NETWORKS to allowed-tokens.ts (DPE-03)
- Extracted CONTRACT_WHITELIST/METHOD_WHITELIST/VENUE_WHITELIST/PERP_ALLOWED_MARKETS to contract-whitelist.ts (DPE-02)
- Extracted APPROVED_SPENDERS/APPROVE_AMOUNT_LIMIT/APPROVE_TIER_OVERRIDE to approved-spenders.ts (DPE-04)
- Extracted SPENDING_LIMIT/ACTION_CATEGORY_LIMIT to spending-limit.ts (DPE-01)
- Extracted LENDING_ASSET_WHITELIST to lending-asset-whitelist.ts (DPE-05)
- Extracted LENDING_LTV_LIMIT/PERP_MAX_LEVERAGE/PERP_MAX_POSITION_USD to lending-ltv-limit.ts (DPE-06)
- Created shared types.ts (PolicyRow, TransactionParam, ParseRulesContext, SettingsContext) (DPE-07)
- Created helpers.ts with maxTier utility (DPE-08)
- Slimmed database-policy-engine.ts to 852 lines: orchestration + reputation + resolve + cumulative
- All 109 policy engine tests pass unchanged
- All 314 daemon test files pass (5040 tests)

## Task Commits

1. **Task 1+2: Extract evaluators and slim orchestrator** - `092b0e41` (refactor)

## Files Created/Modified
- `packages/daemon/src/pipeline/database-policy-engine.ts` - Orchestration only (852 lines, was 2,318)
- `packages/daemon/src/pipeline/evaluators/types.ts` - Shared types (75 lines)
- `packages/daemon/src/pipeline/evaluators/helpers.ts` - maxTier utility (16 lines)
- `packages/daemon/src/pipeline/evaluators/allowed-tokens.ts` - WHITELIST + ALLOWED_TOKENS + ALLOWED_NETWORKS (169 lines)
- `packages/daemon/src/pipeline/evaluators/contract-whitelist.ts` - CONTRACT_WHITELIST + METHOD_WHITELIST + VENUE + PERP_MARKETS (218 lines)
- `packages/daemon/src/pipeline/evaluators/approved-spenders.ts` - APPROVED_SPENDERS + AMOUNT_LIMIT + TIER_OVERRIDE (152 lines)
- `packages/daemon/src/pipeline/evaluators/spending-limit.ts` - SPENDING_LIMIT + ACTION_CATEGORY_LIMIT (306 lines)
- `packages/daemon/src/pipeline/evaluators/lending-asset-whitelist.ts` - LENDING_ASSET_WHITELIST (55 lines)
- `packages/daemon/src/pipeline/evaluators/lending-ltv-limit.ts` - LTV_LIMIT + PERP_LEVERAGE + PERP_POSITION (161 lines)

## Decisions Made
- ParseRulesContext + SettingsContext interfaces provide clean dependency injection for evaluators
- REPUTATION_THRESHOLD stays in DatabasePolicyEngine (async, requires ReputationCacheService instance)
- evaluateInstructionPolicies stays in DatabasePolicyEngine (orchestration for batch Phase A)
- Grouped perp market whitelist with contract whitelist (same pattern)
- Grouped perp leverage/position limits with lending LTV limit (same pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

---
*Phase: 437-large-file-split*
*Completed: 2026-03-17*
