---
phase: 429-database-policy-engine-zod
plan: 02
started: "2026-03-16T05:43:00Z"
completed: "2026-03-16T05:54:00Z"
duration: ~11 min
tasks_completed: 2
tasks_total: 2
key-files:
  created: []
  modified:
    - packages/daemon/src/pipeline/database-policy-engine.ts
    - packages/daemon/src/__tests__/database-policy-engine.test.ts
    - packages/core/src/index.ts
decisions:
  - "parseRules<S extends z.ZodTypeAny> generic to properly infer types from superRefine schemas"
  - "Only SpendingLimitRules type import needed (used as function parameter); other rule types inferred from parseRules"
  - "WAIaaSError requires options object { message } not string as second arg"
  - "Empty whitelist now throws POLICY_RULES_CORRUPT (WhitelistRulesSchema min(1) validation)"
  - "Invalid CAIP-19 in ALLOWED_TOKENS rules now caught at parse time (Zod Caip19Schema validation)"
---

# Phase 429 Plan 02: DatabasePolicyEngine JSON.parse -> safeJsonParse Summary

20 JSON.parse(policy.rules) calls replaced with Zod-validated parseRules(), 17 local interfaces removed, 8 corrupt data tests added

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace JSON.parse with safeJsonParse + remove local interfaces | d2ee31cb | 2 files |
| 2 | Add corrupt data handling tests | ed776543 | 1 file |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] core/src/index.ts barrel missing new schema exports**
- **Found during:** Task 1
- **Issue:** schemas/index.ts exported new schemas but core/src/index.ts did not re-export them
- **Fix:** Added 7 new schema + type exports to core/src/index.ts
- **Files modified:** packages/core/src/index.ts
- **Commit:** d2ee31cb

**2. [Rule 1 - Bug] Existing tests used behaviors incompatible with Zod validation**
- **Found during:** Task 2
- **Issue:** Two existing tests relied on invalid data passing through: (1) empty whitelist allowed_addresses, (2) invalid CAIP-19 in ALLOWED_TOKENS policy assetId
- **Fix:** Updated tests to expect POLICY_RULES_CORRUPT (Zod now catches these at parse time)
- **Files modified:** packages/daemon/src/__tests__/database-policy-engine.test.ts
- **Commit:** ed776543

**3. [Rule 1 - Bug] APPROVE_TIER_OVERRIDE batch test needed APPROVED_SPENDERS first**
- **Found during:** Task 2
- **Issue:** Batch path checks APPROVED_SPENDERS before reaching APPROVE_TIER_OVERRIDE parse
- **Fix:** Added APPROVED_SPENDERS policy in the test so the corrupt APPROVE_TIER_OVERRIDE is actually reached
- **Files modified:** packages/daemon/src/__tests__/database-policy-engine.test.ts
- **Commit:** ed776543

## Verification

- 0 JSON.parse(policy.rules) calls in database-policy-engine.ts (only pos.metadata parse remains)
- 0 local interface definitions for rule types
- 21 parseRules references (20 call sites + 1 definition)
- 8 new tests in 'Zod safeParse validation' describe block
- All 109 database-policy-engine tests pass
- pnpm turbo run typecheck passes for daemon package

## Out-of-scope discovery

- integration-wiring.test.ts has pre-existing TS errors (pollAll/checkFinalized/getBlockNumber not in mock type) from Phase 428. Not related to this plan's changes.
