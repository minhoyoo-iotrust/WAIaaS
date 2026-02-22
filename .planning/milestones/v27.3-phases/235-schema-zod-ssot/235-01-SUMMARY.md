---
phase: 235-schema-zod-ssot
plan: 01
subsystem: api
tags: [zod, policy, spending-limit, caip-19, token-limits, superrefine]

# Dependency graph
requires:
  - phase: 234-caip19-policy
    provides: CAIP-19 asset identification for token_limits keys
provides:
  - TokenLimitSchema for human-readable per-token spending limits
  - SpendingLimitRulesSchema with optional raw fields and token_limits record
  - superRefine validation (at-least-one-source, ordering, key-format)
  - Daemon API accepting USD-only and token_limits-only policies
affects: [236-pipeline-evaluation, 237-admin-mcp, 238-e2e-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [superRefine-on-base-schema, inline-caip19-regex-to-avoid-circular-dep]

key-files:
  created: []
  modified:
    - packages/core/src/schemas/policy.schema.ts
    - packages/core/src/__tests__/policy-superrefine.test.ts
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/daemon/src/api/routes/policies.ts
    - packages/daemon/src/pipeline/database-policy-engine.ts

key-decisions:
  - "CAIP-19 regex duplicated inline in policy.schema.ts to avoid circular dependency with caip/ module"
  - "Non-null assertions (!) in evaluateNativeTier -- Phase 236 will add proper undefined guards"
  - "token_limits key validation: native | native:{solana|ethereum} | CAIP-19 format"

patterns-established:
  - "SpendingLimitRules base schema + superRefine pattern for cross-field validation"
  - "At-least-one-source validation: raw OR USD OR token_limits must be present"

requirements-completed: [SCHM-01, SCHM-02, SCHM-03, SCHM-04, SCHM-05, SCHM-06]

# Metrics
duration: 3min
completed: 2026-02-22
---

# Phase 235 Plan 01: Schema Zod SSoT Summary

**TokenLimitSchema with human-readable decimal amounts, optional raw fields, CAIP-19-keyed token_limits record, and superRefine cross-field validation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-22T09:07:09Z
- **Completed:** 2026-02-22T09:10:58Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- TokenLimitSchema accepting human-readable decimal string amounts (e.g., "1.5" SOL, "1000" USDC)
- Raw fields (instant_max/notify_max/delay_max) now optional in SpendingLimitRulesSchema, enabling USD-only and token_limits-only policies
- superRefine validation enforcing: at least one limit source, ordering constraints within token_limits, CAIP-19/native key format
- Daemon API and interface updated to accept USD-only and token_limits-only policies without requiring raw fields

## Task Commits

Each task was committed atomically:

1. **Task 1: RED -- Write failing tests for TokenLimitSchema + SpendingLimitRules changes** - `e5deee16` (test)
2. **Task 2: GREEN -- Implement TokenLimitSchema + raw optional + token_limits + superRefine** - `c2bc8a9d` (feat)
3. **Task 3: Unblock USD-only policy creation at daemon API level** - `d57b4f51` (feat)

## Files Created/Modified
- `packages/core/src/schemas/policy.schema.ts` - TokenLimitSchema + SpendingLimitRulesSchema with superRefine
- `packages/core/src/__tests__/policy-superrefine.test.ts` - 17 new test cases for token_limits validation
- `packages/core/src/schemas/index.ts` - Export TokenLimitSchema and TokenLimit type
- `packages/core/src/index.ts` - Export TokenLimitSchema and TokenLimit type from @waiaas/core
- `packages/daemon/src/api/routes/policies.ts` - validateSpendingLimitRules accepts USD-only/token_limits-only
- `packages/daemon/src/pipeline/database-policy-engine.ts` - SpendingLimitRules interface raw fields optional + token_limits field

## Decisions Made
- CAIP-19 regex duplicated inline in policy.schema.ts to avoid circular dependency with caip/ module
- Non-null assertions (!) used in evaluateNativeTier for BigInt conversion -- Phase 236 will add proper undefined guards for runtime safety
- token_limits key validation accepts: "native", "native:solana", "native:ethereum", or valid CAIP-19 asset IDs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- TokenLimitSchema and SpendingLimitRulesSchema are ready for Phase 236 (pipeline evaluation with token_limits)
- evaluateNativeTier has non-null assertions that Phase 236 must replace with proper undefined guards
- token_limits field available in daemon-local SpendingLimitRules interface for Phase 236 consumption

## Self-Check: PASSED

All 6 modified files verified present. All 3 task commits verified (e5deee16, c2bc8a9d, d57b4f51).

---
*Phase: 235-schema-zod-ssot*
*Completed: 2026-02-22*
