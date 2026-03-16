---
phase: 429-database-policy-engine-zod
plan: 01
started: "2026-03-16T05:39:54Z"
completed: "2026-03-16T05:43:00Z"
duration: ~3 min
tasks_completed: 1
tasks_total: 1
key-files:
  created: []
  modified:
    - packages/core/src/schemas/policy.schema.ts
    - packages/core/src/schemas/index.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/__tests__/errors.test.ts
    - packages/core/src/__tests__/i18n.test.ts
    - packages/core/src/__tests__/package-exports.test.ts
    - packages/core/src/__tests__/safe-json-parse.test.ts
decisions:
  - "VENUE_NOT_ALLOWED already in POLICY domain, so POLICY domain count is 7 (not 6)"
  - "ActionCategoryLimitRulesSchema.tier_on_exceed is z.string().optional() (not PolicyTierEnum) to match daemon local interface"
---

# Phase 429 Plan 01: Lending/Perp/Venue/ActionCategory 7 Zod Schemas + POLICY_RULES_CORRUPT Error Code Summary

7 Zod rule schemas added for Lending/Perp/Venue/ActionCategory policy types, POLICY_RULES_SCHEMAS expanded 13->20 entries, POLICY_RULES_CORRUPT error code registered

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add 7 Zod rule schemas + POLICY_RULES_CORRUPT error code | 50876045 | 9 files |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] POLICY_RULES_SCHEMAS count test was 13, not mentioned in plan**
- **Found during:** Task 1
- **Issue:** safe-json-parse.test.ts had `toHaveLength(13)` for POLICY_RULES_SCHEMAS
- **Fix:** Updated to `toHaveLength(20)`
- **Files modified:** packages/core/src/__tests__/safe-json-parse.test.ts

**2. [Rule 1 - Bug] POLICY domain count was 5+VENUE_NOT_ALLOWED=6, not 5+1=6**
- **Found during:** Task 1
- **Issue:** Plan said POLICY domain has 5 codes, but VENUE_NOT_ALLOWED (v31.12) is also POLICY domain, so adding POLICY_RULES_CORRUPT makes 7
- **Fix:** Set POLICY domain test to toHaveLength(7)
- **Files modified:** packages/core/src/__tests__/errors.test.ts

## Verification

- POLICY_RULES_SCHEMAS has 20 entries (all 20 PolicyType values covered)
- 7 new Zod schemas exported from @waiaas/core with inferred types
- POLICY_RULES_CORRUPT error code registered (domain POLICY, httpStatus 500, retryable false)
- All 886 core tests pass (including error code count test at 147)
- typecheck passes
