---
phase: 236-policy-engine-token-tier
plan: 02
subsystem: pipeline
tags: [policy-engine, token-limits, CAIP-19, decimal-conversion, spending-limit, evaluateTokenTier]

# Dependency graph
requires:
  - phase: 236-policy-engine-token-tier
    provides: tokenDecimals field in TransactionParam (plan 01)
  - phase: 235-schema-zod-ssot
    provides: token_limits field in SpendingLimitRules + policy.schema.ts validation
provides:
  - evaluateTokenTier() with CAIP-19 key matching (exact -> native:chain -> native -> null)
  - evaluateSpendingLimit() tokenContext parameter for token-aware evaluation
  - evaluateNativeTier() proper undefined guards for optional raw fields
  - parseDecimalToBigInt() precision-safe decimal conversion helper
  - buildTokenContext() TransactionParam-to-tokenContext mapper
  - APPROVE without APPROVE_TIER_OVERRIDE falls through to SPENDING_LIMIT
affects: [236-03-PLAN, policy-engine, approve-flow, sign-only-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [token_limits CAIP-19 matching priority, parseDecimalToBigInt fixed-point comparison]

key-files:
  created: []
  modified:
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/__tests__/database-policy-engine.test.ts

key-decisions:
  - "APPROVE without APPROVE_TIER_OVERRIDE now falls through to SPENDING_LIMIT for token_limits evaluation (was previously defaulting to APPROVAL tier)"
  - "NATIVE_DECIMALS duplicated in database-policy-engine.ts to avoid cross-file dependency with resolve-effective-amount-usd.ts"
  - "parseDecimalToBigInt uses fixed-point multiplication (limit * 10^decimals) instead of dividing amount, avoiding precision loss"
  - "evaluateBatch APPROVE_TIER_OVERRIDE default (APPROVAL) kept unchanged -- only single-evaluate flow updated"

patterns-established:
  - "token_limits CAIP-19 matching priority: exact assetId -> native:{chain} -> native shorthand -> null (raw fallback)"
  - "parseDecimalToBigInt for precision-safe human-readable to raw BigInt conversion"
  - "buildTokenContext maps TransactionParam fields to evaluateTokenTier context"

requirements-completed: [ENGN-03, ENGN-04, ENGN-05, ENGN-06, ENGN-07, ENGN-08, ENGN-09, ENGN-10]

# Metrics
duration: 9min
completed: 2026-02-22
---

# Phase 236 Plan 02: evaluateTokenTier + Token-Aware Spending Limit Summary

**evaluateTokenTier with CAIP-19 key matching + parseDecimalToBigInt decimal conversion + evaluateNativeTier undefined guards, enabling human-readable token_limits in policy engine**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-22T09:29:13Z
- **Completed:** 2026-02-22T09:38:19Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Implemented evaluateTokenTier() with CAIP-19 key matching in priority order: exact assetId (TOKEN_TRANSFER/APPROVE) -> native:{chain} (TRANSFER) -> native shorthand (TRANSFER with policy network) -> null (raw fallback)
- Extended evaluateSpendingLimit() with tokenContext parameter, routing to evaluateTokenTier when token_limits exist
- Fixed evaluateNativeTier() with proper undefined guards -- raw fields are now optional, returns INSTANT when all undefined
- Added parseDecimalToBigInt() helper for precision-safe conversion of human-readable decimal limits to raw BigInt units
- Changed APPROVE flow: without APPROVE_TIER_OVERRIDE, APPROVE now falls through to SPENDING_LIMIT for token_limits evaluation
- All 88 tests pass (11 new token_limits + 77 existing/updated), typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: RED -- Write failing tests for evaluateTokenTier + token_limits** - `c2676d76` (test)
2. **Task 2: GREEN -- Implement evaluateTokenTier + evaluateSpendingLimit tokenContext + evaluateNativeTier guards** - `2736239b` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `packages/daemon/src/pipeline/database-policy-engine.ts` - evaluateTokenTier, parseDecimalToBigInt, NATIVE_DECIMALS, buildTokenContext, evaluateNativeTier undefined guards, evaluateSpendingLimit tokenContext, evaluateApproveTierOverride behavioral change
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` - 11 new token_limits test cases + 5 existing tests updated for APPROVE behavioral change

## Decisions Made
- APPROVE without APPROVE_TIER_OVERRIDE now falls through to SPENDING_LIMIT. Previously defaulted to APPROVAL tier, blocking APPROVE from token_limits evaluation. Updated 5 existing tests to use explicit APPROVE_TIER_OVERRIDE with `tier: 'APPROVAL'` where needed.
- NATIVE_DECIMALS constant duplicated from resolve-effective-amount-usd.ts rather than importing, avoiding cross-file dependency complexity.
- Used fixed-point multiplication (multiply limit by 10^decimals) in parseDecimalToBigInt instead of dividing amount, preventing floating-point precision loss.
- evaluateBatch APPROVE_TIER_OVERRIDE default behavior kept unchanged (still defaults to APPROVAL). Only the single-evaluate flow was updated for consistency with the plan scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 4 network CHECK constraint violation**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Test used 'solana-mainnet' as network value, but DB has CHECK constraint with specific allowed values
- **Fix:** Changed to 'mainnet' (valid value from DB CHECK constraint)
- **Files modified:** packages/daemon/src/__tests__/database-policy-engine.test.ts
- **Verification:** Test passes with valid network value

**2. [Rule 2 - Missing Critical] APPROVE_TIER_OVERRIDE behavioral change for token_limits support**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Plan test 8 expects APPROVE without APPROVE_TIER_OVERRIDE to go through SPENDING_LIMIT with token_limits, but existing code defaults to APPROVAL tier
- **Fix:** Changed evaluateApproveTierOverride to return null when no override policy exists, allowing fall-through to SPENDING_LIMIT. Updated 5 existing tests to use explicit APPROVE_TIER_OVERRIDE policies.
- **Files modified:** database-policy-engine.ts (evaluateApproveTierOverride), database-policy-engine.test.ts (5 existing tests)
- **Verification:** All 88 tests pass

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. Test 4 fix is cosmetic (DB constraint). APPROVE behavioral change is intentional per plan requirements.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- evaluateTokenTier is fully operational, ready for Stage 3 wiring in plan 236-03
- evaluate() and evaluateAndReserve() both pass tokenContext to evaluateSpendingLimit
- APPROVE flow updated: without override, APPROVE goes through SPENDING_LIMIT with token_limits

## Self-Check: PASSED

- [x] database-policy-engine.ts: FOUND, evaluateTokenTier + parseDecimalToBigInt + NATIVE_DECIMALS present
- [x] database-policy-engine.test.ts: FOUND, token_limits tests present
- [x] SUMMARY.md: FOUND
- [x] Commit c2676d76: FOUND (RED)
- [x] Commit 2736239b: FOUND (GREEN)

---
*Phase: 236-policy-engine-token-tier*
*Completed: 2026-02-22*
