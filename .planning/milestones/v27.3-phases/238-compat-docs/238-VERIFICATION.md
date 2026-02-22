---
phase: 238-compat-docs
verified: 2026-02-22T19:31:00Z
status: passed
score: 6/6 must-haves verified
must_haves:
  truths:
    - "Raw-only policy (no token_limits, no USD) returns the same tier as before v27.3 changes"
    - "USD-only policy (no raw, no token_limits) returns correct tier based on USD thresholds"
    - "Raw + token_limits coexistence: token_limits takes priority for matching tokens, raw for non-matching"
    - "daily_limit_usd and monthly_limit_usd evaluation is completely independent of token_limits"
    - "BATCH evaluation is unaffected (tokenContext is undefined for batch, raw/USD only)"
    - "policies.skill.md documents token_limits field with CAIP-19 key format, matching priority, and examples"
  artifacts:
    - path: "packages/daemon/src/__tests__/database-policy-engine.test.ts"
      provides: "Backward compatibility test suite for token_limits"
      contains: "Backward Compatibility"
    - path: "skills/policies.skill.md"
      provides: "token_limits documentation for AI agents"
      contains: "token_limits"
  key_links:
    - from: "packages/daemon/src/__tests__/database-policy-engine.test.ts"
      to: "packages/daemon/src/pipeline/database-policy-engine.ts"
      via: "DatabasePolicyEngine evaluate/evaluateAndReserve/evaluateBatch"
      pattern: "engine\\.evaluate"
---

# Phase 238: Compat + Docs Verification Report

**Phase Goal:** Ensure existing policies behave identically to pre-v27.3, that token_limits correctly takes priority when present, that cumulative USD limits are unaffected, and that policies.skill.md documents token_limits for AI agents.
**Verified:** 2026-02-22T19:31:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Raw-only policy (no token_limits, no USD) returns the same tier as before v27.3 changes | VERIFIED | CMPT-01a/b/c/d tests pass: INSTANT for 0.5 SOL, NOTIFY for 5 SOL, DELAY for 30 SOL, APPROVAL for 60 SOL -- identical to pre-v27.3 behavior |
| 2 | USD-only policy (no raw, no token_limits) returns correct tier based on USD thresholds | VERIFIED | Pre-existing USD SPENDING_LIMIT tests (tests 1-10 in "USD SPENDING_LIMIT" describe block) all pass, 97/97 total |
| 3 | Raw + token_limits coexistence: token_limits takes priority for matching tokens, raw for non-matching | VERIFIED | CMPT-02a: 500 USDC gets NOTIFY via token_limits (not INSTANT via raw). CMPT-02b: non-matching token gets NOTIFY via raw fallback. CMPT-02c: native TRANSFER with no native key falls back to raw INSTANT. |
| 4 | daily_limit_usd and monthly_limit_usd evaluation is completely independent of token_limits | VERIFIED | CMPT-03a: daily_limit_usd=100 with cumulative $90 + $20 new = $110 triggers APPROVAL with reason cumulative_daily, despite token_limits being present |
| 5 | BATCH evaluation is unaffected (tokenContext is undefined for batch, raw/USD only) | VERIFIED | CMPT-03b: BATCH of 2 TRANSFERs summing to 5 SOL returns NOTIFY via raw, even though token_limits has very restrictive native:solana limits |
| 6 | policies.skill.md documents token_limits field with CAIP-19 key format, matching priority, and examples | VERIFIED | Line 166-168: token_limits in rules schema. Line 184: field table row. Lines 190-207: Token-specific limits subsection with key format, matching priority, fallback, scope, USD interaction. Lines 610-621: curl workflow example. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/__tests__/database-policy-engine.test.ts` | Backward compatibility test suite with "Backward Compatibility" describe block | VERIFIED | Lines 2488-2766: "DatabasePolicyEngine - Backward Compatibility (CMPT-01/02/03)" describe block with 9 tests (CMPT-01a-d, CMPT-02a-c, CMPT-03a-b). All 97 tests pass (88 existing + 9 new). |
| `skills/policies.skill.md` | token_limits documentation for AI agents | VERIFIED | Version bumped to 2.6.0-rc (line 6). token_limits appears in: rules schema (line 166), field table (line 184), Token-specific limits subsection (lines 190-207), and workflow example (lines 610-621). CAIP-19 documented at lines 184, 192, 197, 199. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `database-policy-engine.test.ts` | `database-policy-engine.ts` | `DatabasePolicyEngine evaluate/evaluateAndReserve/evaluateBatch` | WIRED | Import at line 15. CMPT tests call `engine.evaluate` (lines 2507, 2525, 2543, 2562, 2601, 2645, 2678), `engineWithSqlite.evaluateAndReserve` (line 2724), and `engine.evaluateBatch` (line 2758). All are actual production engine methods, not mocks. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CMPT-01 | 238-01 | Raw-only policies unchanged | SATISFIED | 4 tests (CMPT-01a-d) verify INSTANT/NOTIFY/DELAY/APPROVAL tiers for raw-only policy |
| CMPT-02 | 238-01 | token_limits takes priority over raw | SATISFIED | 3 tests (CMPT-02a-c) verify priority, fallback to raw, and native fallback |
| CMPT-03 | 238-01 | Cumulative USD limits unaffected | SATISFIED | 2 tests: CMPT-03a daily_limit_usd with evaluateAndReserve, CMPT-03b BATCH ignores token_limits |
| CMPT-04 | 238-01 | policies.skill.md documents token_limits | SATISFIED | Full documentation: key format (3 types), matching priority, value format, fallback behavior, scope, USD interaction, curl example |

No orphaned requirements found. All 4 CMPT requirements mapped to phase 238 in REQUIREMENTS.md are addressed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | - | - | - | No TODO/FIXME/PLACEHOLDER/console.log patterns found in either modified file |

### Human Verification Required

No human verification needed. All deliverables (tests and documentation) are fully verifiable programmatically:
- Tests execute and pass (97/97)
- Documentation content verified via grep for required sections
- No visual/UI/real-time components involved

### Gaps Summary

No gaps found. All 6 must-have truths are verified with concrete evidence:

1. **Backward compatibility**: 9 new CMPT tests prove raw-only, priority, and cumulative independence behaviors.
2. **Zero regressions**: All 88 pre-existing tests continue to pass alongside the 9 new tests (97 total).
3. **Documentation**: policies.skill.md has comprehensive token_limits documentation covering CAIP-19 key format, matching priority, fallback, scope, and examples.
4. **No production changes**: Only test and documentation files were modified (confirmed via `git diff --name-only`).
5. **Commits verified**: `4c4b06a2` (tests) and `b682b2c9` (docs) both exist and are valid.

---

_Verified: 2026-02-22T19:31:00Z_
_Verifier: Claude (gsd-verifier)_
