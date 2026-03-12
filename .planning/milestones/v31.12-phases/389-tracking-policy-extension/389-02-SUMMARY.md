---
phase: 389-tracking-policy-extension
plan: 02
subsystem: policy
tags: [venue-whitelist, action-category-limit, default-deny, cumulative-usd, policy-engine]

requires:
  - phase: 386-type-system-errors-db
    provides: "VENUE_NOT_ALLOWED error code, TransactionParam baseline, POLICY_TYPES enum"
provides:
  - "VENUE_WHITELIST default-deny policy with Admin Settings toggle"
  - "ACTION_CATEGORY_LIMIT per-action/daily/monthly USD limits"
  - "TransactionParam 6 off-chain fields (venue, actionCategory, notionalUsd, leverage, expiry, hasWithdrawCapability)"
  - "ActionCategoryEnum 5-value Zod enum"
  - "venue_whitelist_enabled Admin Setting"
affects: [external-action-pipeline, admin-ui-policy-forms, mcp-policy-tools]

tech-stack:
  added: []
  patterns: ["Admin Settings toggle for policy activation", "cumulative json_extract SQL for off-chain USD tracking"]

key-files:
  created:
    - packages/daemon/src/__tests__/venue-whitelist-policy.test.ts
    - packages/daemon/src/__tests__/action-category-limit-policy.test.ts
  modified:
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/core/src/enums/policy.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts

key-decisions:
  - "VENUE_WHITELIST uses Admin Settings toggle (venue_whitelist_enabled=false by default) rather than always-on"
  - "ACTION_CATEGORY_LIMIT cumulative queries use json_extract on transaction metadata for off-chain notionalUsd tracking"
  - "walletId passed explicitly to evaluateActionCategoryLimit to avoid incorrect toAddress-based wallet resolution"
  - "TRANSFER type used in all policy tests to avoid CONTRACT_WHITELIST default-deny interference"

patterns-established:
  - "Off-chain policy pattern: skip evaluation when actionCategory/notionalUsd absent, allowing on-chain transactions to pass through"
  - "Cumulative USD query pattern: json_extract(metadata, '$.notionalUsd') with action_kind IN ('signedData','signedHttp') filter"

requirements-completed: [POLICY-01, POLICY-02, POLICY-03, POLICY-04, POLICY-05, POLICY-06]

duration: 15min
completed: 2026-03-12
---

# Phase 389 Plan 02: TransactionParam Extension + VENUE_WHITELIST + ACTION_CATEGORY_LIMIT Summary

**VENUE_WHITELIST default-deny policy with Admin Settings toggle + ACTION_CATEGORY_LIMIT per-action/daily/monthly USD limits with cumulative json_extract queries**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-12T04:50:00Z
- **Completed:** 2026-03-12T05:01:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- TransactionParam extended with 6 off-chain fields for External Action pipeline integration
- VENUE_WHITELIST default-deny policy with case-insensitive matching and Admin Settings toggle
- ACTION_CATEGORY_LIMIT policy with per-action, daily, and monthly USD limits via cumulative SQL queries
- 18 new tests (7 venue + 11 category) with 100% existing regression pass (100 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: TransactionParam + VENUE_WHITELIST policy** - `3f4a8644` (feat)
2. **Task 2: ACTION_CATEGORY_LIMIT policy + walletId fix** - `cf1527a5` (feat)

## Files Created/Modified
- `packages/core/src/enums/policy.ts` - Added VENUE_WHITELIST + ACTION_CATEGORY_LIMIT to POLICY_TYPES
- `packages/daemon/src/pipeline/database-policy-engine.ts` - TransactionParam 6 fields, evaluateVenueWhitelist(), evaluateActionCategoryLimit(), Steps 4j+4k
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - venue_whitelist_enabled setting (default false)
- `packages/daemon/src/__tests__/venue-whitelist-policy.test.ts` - 7 tests for VENUE_WHITELIST policy
- `packages/daemon/src/__tests__/action-category-limit-policy.test.ts` - 11 tests for ACTION_CATEGORY_LIMIT policy
- `packages/core/src/__tests__/enums.test.ts` - Updated POLICY_TYPES count 19->21

## Decisions Made
- VENUE_WHITELIST uses Admin Settings toggle (venue_whitelist_enabled=false by default) -- allows gradual rollout
- ACTION_CATEGORY_LIMIT cumulative queries use json_extract on transaction metadata -- no schema change needed
- walletId explicitly passed to evaluateActionCategoryLimit -- fixes bug where toAddress-based resolution could return wrong wallet
- All policy tests use TRANSFER type to avoid CONTRACT_WHITELIST default-deny interference

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed walletId resolution in cumulative queries**
- **Found during:** Task 2 (ACTION_CATEGORY_LIMIT implementation)
- **Issue:** Cumulative queries used `transaction.toAddress ? resolved[0]?.walletId : null` which would return null for transactions without toAddress or wrong wallet for global policies
- **Fix:** Pass walletId parameter from evaluate()/evaluateAndReserve() to evaluateActionCategoryLimit()
- **Files modified:** packages/daemon/src/pipeline/database-policy-engine.ts
- **Verification:** All 11 ACTION_CATEGORY_LIMIT tests pass including cumulative daily/monthly queries
- **Committed in:** cf1527a5

**2. [Rule 3 - Blocking] Rebuilt @waiaas/core for compiled output**
- **Found during:** Task 1 (VENUE_WHITELIST tests)
- **Issue:** Tests failed with CHECK constraint error because compiled core output was stale (missing new POLICY_TYPES)
- **Fix:** Ran `pnpm --filter @waiaas/core build` to regenerate compiled output
- **Verification:** All 7 VENUE_WHITELIST tests pass after rebuild

**3. [Rule 1 - Bug] Fixed CONTRACT_CALL test type to TRANSFER**
- **Found during:** Task 1 (VENUE_WHITELIST tests)
- **Issue:** Tests using type: 'CONTRACT_CALL' triggered CONTRACT_WHITELIST default-deny before VENUE_WHITELIST was reached
- **Fix:** Changed all test transaction types from CONTRACT_CALL to TRANSFER
- **Files modified:** packages/daemon/src/__tests__/venue-whitelist-policy.test.ts
- **Committed in:** 3f4a8644

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- VENUE_WHITELIST and ACTION_CATEGORY_LIMIT policies ready for External Action pipeline integration
- Admin UI policy forms will need new form components for these policy types
- MCP tools will need policy management commands for venue whitelist and category limits

---
*Phase: 389-tracking-policy-extension*
*Completed: 2026-03-12*
