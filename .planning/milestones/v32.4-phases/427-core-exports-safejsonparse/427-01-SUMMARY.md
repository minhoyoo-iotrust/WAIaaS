---
phase: 427-core-exports-safejsonparse
plan: 01
subsystem: core
tags: [utility, zod, ssot, error-codes]
dependency_graph:
  requires: []
  provides: [safeJsonParse, POLICY_RULES_SCHEMAS, sleep-ssot, INTERNAL_ERROR, VALIDATION_FAILED]
  affects: [daemon, solana-adapter, cli, core]
tech_stack:
  added: []
  patterns: [safe-json-parse-with-zod, sleep-ssot-re-export]
key_files:
  created:
    - packages/core/src/utils/safe-json-parse.ts
    - packages/core/src/utils/sleep.ts
    - packages/core/src/__tests__/safe-json-parse.test.ts
    - packages/core/src/__tests__/sleep.test.ts
  modified:
    - packages/core/src/utils/index.ts
    - packages/core/src/schemas/policy.schema.ts
    - packages/core/src/schemas/index.ts
    - packages/core/src/index.ts
    - packages/core/src/errors/error-codes.ts
    - packages/core/src/i18n/en.ts
    - packages/core/src/i18n/ko.ts
    - packages/core/src/interfaces/connection-state.ts
    - packages/daemon/src/pipeline/sleep.ts
    - packages/daemon/src/api/routes/x402.ts
    - packages/adapters/solana/src/adapter.ts
    - packages/cli/src/commands/stop.ts
    - packages/core/src/__tests__/errors.test.ts
    - packages/core/src/__tests__/i18n.test.ts
    - packages/core/src/__tests__/package-exports.test.ts
key_decisions:
  - "safeJsonParse returns discriminated union (SafeJsonParseResult<T>) instead of throwing -- consumers use pattern matching"
  - "daemon/pipeline/sleep.ts kept as re-export to avoid breaking existing imports within daemon"
  - "connection-state.ts uses internal relative import (../utils/sleep.js) to avoid circular dependency"
metrics:
  duration: "~10 minutes"
  completed: "2026-03-16"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 27
  files_changed: 18
---

# Phase 427 Plan 01: safeJsonParse + POLICY_RULES_SCHEMAS export + sleep SSoT + error codes Summary

safeJsonParse<T> generic helper with Zod schema validation, POLICY_RULES_SCHEMAS export (13 policy types + 7 newly-exported rule schemas), sleep() SSoT consolidated from 5 locations, INTERNAL_ERROR/VALIDATION_FAILED error codes registered.

## Completed Tasks

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | safeJsonParse + POLICY_RULES_SCHEMAS + error codes | 88d35bc9 | safeJsonParse.ts, 8 schemas exported, 2 error codes, 24 tests |
| 2 | sleep() SSoT consolidation | 92f45b0d | sleep.ts SSoT, 5 local defs removed, 3 test count fixes |

## What Was Built

### safeJsonParse<T> (ZOD-01, ZOD-02)
- `safeJsonParse<T>(json: string, schema: ZodType<T>): SafeJsonParseResult<T>`
- Returns discriminated union: `{ success: true, data: T }` or `{ success: false, error: SafeJsonParseError }`
- Error types: `json_parse` (invalid JSON or null/undefined) and `validation` (Zod schema mismatch with issues array)
- Never throws -- all errors captured in result

### POLICY_RULES_SCHEMAS Export (ZOD-02)
- Exported from `@waiaas/core` as `Record<string, z.ZodTypeAny>` with 13 entries
- 7 previously-internal schemas now exported: AllowedTokensRulesSchema, ContractWhitelistRulesSchema, MethodWhitelistRulesSchema, ApprovedSpendersRulesSchema, ApproveAmountLimitRulesSchema, ApproveTierOverrideRulesSchema, AllowedNetworksRulesSchema
- Also exported ReputationThresholdRulesSchema (was already `export` but not in index)
- All corresponding inferred types exported (AllowedTokensRules, etc.)

### sleep() SSoT (SSOT-02)
- Single definition in `packages/core/src/utils/sleep.ts`
- 5 local definitions removed:
  - `packages/daemon/src/pipeline/sleep.ts` -- changed to re-export
  - `packages/daemon/src/api/routes/x402.ts` -- inline const removed
  - `packages/adapters/solana/src/adapter.ts` -- function removed
  - `packages/cli/src/commands/stop.ts` -- function removed
  - `packages/core/src/interfaces/connection-state.ts` -- function replaced with import

### Error Codes (LAYER-06, LAYER-07)
- `INTERNAL_ERROR`: domain SYSTEM, httpStatus 500, retryable false
- `VALIDATION_FAILED`: domain SYSTEM, httpStatus 400, retryable false
- i18n: en + ko translations added
- Total error codes: 146 (was 144)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed error code count in 3 test files**
- **Found during:** Task 2 verification
- **Issue:** errors.test.ts, i18n.test.ts, package-exports.test.ts expected 144 error codes but got 146 after adding INTERNAL_ERROR + VALIDATION_FAILED
- **Fix:** Updated expected count from 144 to 146 in all 3 test files
- **Files modified:** packages/core/src/__tests__/errors.test.ts, i18n.test.ts, package-exports.test.ts

**2. [Rule 3 - Blocking] Removed unused type imports in test file**
- **Found during:** Task 2 typecheck
- **Issue:** safe-json-parse.test.ts imported SafeJsonParseResult and SafeJsonParseError types but never used them (TS6133)
- **Fix:** Removed unused type imports
- **Files modified:** packages/core/src/__tests__/safe-json-parse.test.ts

## Verification Results

- Core package: 938 tests pass (50 test files)
- Full typecheck: 20/20 tasks pass
- No duplicate sleep definitions found (grep verified)
- POLICY_RULES_SCHEMAS has 13 entries (all policy types covered)
- ERROR_CODES.INTERNAL_ERROR and ERROR_CODES.VALIDATION_FAILED exist

## Decisions Made

1. **safeJsonParse returns discriminated union instead of throwing** -- Consumers use `if (result.success)` pattern matching, matching Zod safeParse convention
2. **daemon/pipeline/sleep.ts kept as re-export** -- Prevents breaking change for the many daemon files importing from `../../pipeline/sleep.js`
3. **connection-state.ts uses relative import** -- Uses `../utils/sleep.js` instead of `@waiaas/core` to avoid potential circular dependency within the core package
