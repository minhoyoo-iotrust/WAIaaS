---
phase: 235-schema-zod-ssot
verified: 2026-02-22T18:14:30Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 235: Schema Zod SSoT Verification Report

**Phase Goal:** 토큰별 사람 읽기 단위 한도를 표현할 수 있는 스키마가 정의되고, 기존 raw 필드가 optional로 전환되어 USD만으로 정책을 생성할 수 있다
**Verified:** 2026-02-22T18:14:30Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TokenLimitSchema accepts human-readable decimal strings (e.g. '1.5', '1000') for instant_max/notify_max/delay_max | VERIFIED | `TokenLimitSchema` defined at line 71 of `policy.schema.ts` with regex `/^\d+(\.\d+)?$/`; test "token_limits with valid decimal strings" passes |
| 2 | SpendingLimitRules with only USD fields (no raw, no token_limits) passes Zod validation | VERIFIED | `instant_max_usd/notify_max_usd/delay_max_usd` accepted; test "accepts SpendingLimitRules with only USD fields (no raw)" passes |
| 3 | SpendingLimitRules with only token_limits (no raw, no USD) passes Zod validation | VERIFIED | superRefine `hasTokenLimits` branch; test "accepts SpendingLimitRules with only token_limits (no raw, no USD)" passes |
| 4 | SpendingLimitRules with no USD, no token_limits, and no raw fields fails Zod validation | VERIFIED | superRefine SCHM-04 check at line 124; test "rejects when no USD, no token_limits, and no raw fields" passes |
| 5 | token_limits keys must be 'native', 'native:{chain}', or valid CAIP-19 format -- other keys fail | VERIFIED | `isValidTokenLimitKey()` function at line 86; tests for 'invalid-key', 'native:bitcoin', invalid CAIP format all fail correctly |
| 6 | token_limits with instant_max > notify_max fails ordering validation | VERIFIED | superRefine SCHM-05 ordering check at line 149; test "rejects token_limits where instant_max > notify_max" passes |
| 7 | daemon validateSpendingLimitRules() allows USD-only or token_limits-only policies (raw fields not required) | VERIFIED | `validateSpendingLimitRules()` in `policies.ts` lines 53-92 uses `hasRaw OR hasUsd OR hasTokenLimits` logic |
| 8 | daemon-local SpendingLimitRules interface has raw fields (instant_max/notify_max/delay_max) as optional | VERIFIED | `database-policy-engine.ts` lines 51-53: `instant_max?: string`, `notify_max?: string`, `delay_max?: string` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/core/src/schemas/policy.schema.ts` | TokenLimitSchema + updated SpendingLimitRulesSchema with superRefine | VERIFIED | Lines 71-165: `TokenLimitSchema`, `SpendingLimitRulesBaseSchema`, `SpendingLimitRulesSchema.superRefine()` |
| `packages/core/src/__tests__/policy-superrefine.test.ts` | Comprehensive SPENDING_LIMIT schema validation tests | VERIFIED | 46 tests total, 17 new token_limits tests in nested `describe('SPENDING_LIMIT token_limits')` block, all pass |
| `packages/daemon/src/api/routes/policies.ts` | Updated validateSpendingLimitRules accepting USD-only/token_limits-only policies | VERIFIED | Lines 53-92: refactored to `hasRaw OR hasUsd OR hasTokenLimits` check |
| `packages/daemon/src/pipeline/database-policy-engine.ts` | SpendingLimitRules interface with optional raw fields | VERIFIED | Lines 50-63: `instant_max?`, `notify_max?`, `delay_max?`, plus new `token_limits?` field |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/core/src/schemas/policy.schema.ts` | `packages/core/src/caip/caip19.ts` | CAIP-19 regex duplicated inline (no import) | VERIFIED | `CAIP19_REGEX` defined at line 84 with comment "Duplicated from caip19.ts to avoid circular dependency risk" |
| `packages/core/src/schemas/policy.schema.ts` | `POLICY_RULES_SCHEMAS` map | `SPENDING_LIMIT: SpendingLimitRulesSchema` registered at line 215 | VERIFIED | `SPENDING_LIMIT: SpendingLimitRulesSchema` present; `CreatePolicyRequestSchema.superRefine` uses map for all 12 policy types |
| `packages/core/src/schemas/index.ts` | `packages/core/src/index.ts` | `TokenLimitSchema` and `TokenLimit` exported through package index | VERIFIED | Both files export `TokenLimitSchema` and `type TokenLimit` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SCHM-01 | 235-01-PLAN.md | TokenLimitSchema(instant_max/notify_max/delay_max 사람 읽기 단위) Zod 스키마가 정의됨 | SATISFIED | `TokenLimitSchema` with `/^\d+(\.\d+)?$/` regex; 2 test cases passing |
| SCHM-02 | 235-01-PLAN.md | raw 필드(instant_max/notify_max/delay_max)가 optional로 전환됨 | SATISFIED | All three raw fields have `.optional()` in `SpendingLimitRulesBaseSchema`; USD-only and token_limits-only policy tests pass |
| SCHM-03 | 235-01-PLAN.md | token_limits 필드가 CAIP-19 키 기반 z.record로 추가됨 | SATISFIED | `token_limits: z.record(z.string(), TokenLimitSchema).optional()` at line 115; CAIP-19 key tests passing |
| SCHM-04 | 235-01-PLAN.md | superRefine으로 "USD/token_limits/raw 중 하나 이상 필수" 검증이 동작함 | SATISFIED | `if (!hasRaw && !hasUsd && !hasTokenLimits)` at line 124; rejection test passes |
| SCHM-05 | 235-01-PLAN.md | token_limits 내 instant_max <= notify_max <= delay_max 순서가 검증됨 | SATISFIED | `instantMax > notifyMax` check at line 149; ordering violation tests pass |
| SCHM-06 | 235-01-PLAN.md | token_limits 키가 native/native:{chain}/CAIP-19 형식만 허용됨 | SATISFIED | `isValidTokenLimitKey()` with VALID_CHAIN_TYPES Set; key format rejection tests pass |

All 6 requirements confirmed satisfied in REQUIREMENTS.md (marked `[x]`).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/daemon/src/pipeline/database-policy-engine.ts` | 1315-1317 | Non-null assertions `rules.instant_max!` etc. in `evaluateNativeTier()` | Info | Documented scope boundary — Phase 236 adds proper undefined guards. Non-null assertions are intentional and safe because `evaluateNativeTier` is only called when raw fields are present. Not a blocker for Phase 235 goal. |

No TODO/FIXME/placeholder comments found in any Phase 235 modified files.
No stub implementations found.

### Human Verification Required

None. All observable truths are verifiable programmatically via test execution and code inspection.

### Test Results

- All 46 tests in `policy-superrefine.test.ts` pass (including 17 new Phase 235 token_limits tests)
- `pnpm --filter @waiaas/core exec tsc --noEmit` passes with zero errors
- `pnpm --filter @waiaas/daemon exec tsc --noEmit` passes with zero errors

### Gaps Summary

No gaps. All must-haves are verified. The phase goal is fully achieved:

1. `TokenLimitSchema` is defined and exports `TokenLimitSchema` and `TokenLimit` from `@waiaas/core`
2. `SpendingLimitRulesSchema` raw fields are optional; `token_limits` z.record field is added
3. `superRefine` enforces: at least one limit source (SCHM-04), ordering within token_limits (SCHM-05), CAIP-19/native key format (SCHM-06)
4. Daemon `validateSpendingLimitRules()` accepts USD-only and token_limits-only policies
5. Daemon-local `SpendingLimitRules` interface aligns with Zod-inferred type (raw fields optional, token_limits added)
6. All 6 SCHM requirements satisfied; zero regressions in existing test suite

The only documented technical debt is the non-null assertions in `evaluateNativeTier()` — explicitly scoped to Phase 236, not a gap for Phase 235.

---

_Verified: 2026-02-22T18:14:30Z_
_Verifier: Claude (gsd-verifier)_
