---
phase: 236-policy-engine-token-tier
verified: 2026-02-22T09:50:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 236: Policy Engine Token Tier Verification Report

**Phase Goal:** 정책 엔진이 CAIP-19 키 기반으로 토큰별 사람 읽기 단위 한도를 평가하고, 기존 raw/USD 평가와 올바르게 합산한다
**Verified:** 2026-02-22T09:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TransactionParam interface includes tokenDecimals field in all 3 locations | VERIFIED | `database-policy-engine.ts:163`, `stages.ts:190`, `sign-only.ts:98` — grep confirms `tokenDecimals?: number` in all 3 |
| 2 | buildTransactionParam passes tokenDecimals for TOKEN_TRANSFER and APPROVE types | VERIFIED | `stages.ts:208` (`TOKEN_TRANSFER`) and `stages.ts:233` (`APPROVE`) pass `tokenDecimals: r.token.decimals` |
| 3 | mapOperationToParam does not break for sign-only pipeline | VERIFIED | `sign-only.ts` sets `assetId: undefined` explicitly; `tokenDecimals` intentionally absent (ParsedOperation lacks decimals) |
| 4 | evaluateSpendingLimit accepts tokenContext parameter and passes it to evaluateTokenTier | VERIFIED | `database-policy-engine.ts:1323-1334` — 4-arg signature confirmed; `evaluateTokenTier` called at line 1344 when tokenContext + token_limits present |
| 5 | evaluateTokenTier matches CAIP-19 keys in correct priority order (exact -> native:chain -> native -> raw fallback) | VERIFIED | Lines 1406-1423: exact assetId (TOKEN_TRANSFER/APPROVE), then `native:{chain}` (TRANSFER), then `native` shorthand when policyNetwork set; returns null for raw fallback |
| 6 | TOKEN_TRANSFER with matching token_limits key evaluated in human-readable units via decimal conversion | VERIFIED | `parseDecimalToBigInt` at lines 1431-1433 converts human-readable limits to raw BigInt; test 1 and 2 pass (500 USDC vs 1000 limit INSTANT; 2000 USDC NOTIFY) |
| 7 | TRANSFER with native:chain or native key evaluated using NATIVE_DECIMALS | VERIFIED | `NATIVE_DECIMALS` constant at lines 99-102 (`solana: 9, ethereum: 18`); used at lines 1417, 1422; tests 3 and 4 pass |
| 8 | No token_limits match falls back to raw fields; no raw fields skips native tier entirely | VERIFIED | Lines 1347-1353: null from evaluateTokenTier -> calls evaluateNativeTier; evaluateNativeTier at lines 1446-1449 returns INSTANT when all raw fields undefined; tests 5 and 11 pass |
| 9 | Final per-tx tier is maxTier(USD tier, token tier) | VERIFIED | Lines 1356-1361: `maxTier(tokenTier, usdTier)`; test 7 confirms NOTIFY from token wins over INSTANT from USD |
| 10 | CONTRACT_CALL and BATCH skip token_limits evaluation | VERIFIED | `evaluateTokenTier` lines 1398-1401: early return null for CONTRACT_CALL and BATCH; `evaluateBatch` line 396: tokenContext intentionally omitted (4th arg absent); tests 10 passes |
| 11 | APPROVE + APPROVE_TIER_OVERRIDE skips evaluateSpendingLimit entirely | VERIFIED | Lines 283-285: APPROVE_TIER_OVERRIDE returns early with comment "skips SPENDING_LIMIT (including token_limits)"; lines 581-583: same in evaluateAndReserve; test 9 passes |
| 12 | evaluateNativeTier returns INSTANT when raw fields are undefined (proper guards) | VERIFIED | Lines 1446-1449: explicit undefined check on all 3 raw fields; returns INSTANT when all absent; test 11 passes |
| 13 | All 3 evaluateSpendingLimit callsites pass tokenContext correctly | VERIFIED | `evaluate()` line 292: tokenContext from buildTokenContext; `evaluateBatch()` line 396: tokenContext omitted (intentional); `evaluateAndReserve()` line 608: tokenContext from buildTokenContext |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/daemon/src/pipeline/database-policy-engine.ts` | TransactionParam with tokenDecimals, evaluateTokenTier, evaluateSpendingLimit with tokenContext, NATIVE_DECIMALS, parseDecimalToBigInt, buildTokenContext | VERIFIED | All functions present and substantive; wired at 3 callsites |
| `packages/daemon/src/pipeline/stages.ts` | TransactionParam with tokenDecimals + buildTransactionParam passing decimals | VERIFIED | `tokenDecimals?: number` at line 190; TOKEN_TRANSFER at 208, APPROVE at 233 |
| `packages/daemon/src/pipeline/sign-only.ts` | TransactionParam with tokenDecimals field synced | VERIFIED | `tokenDecimals?: number` at line 98; `assetId?: string` synced at line 92; `assetId: undefined` in mapOperationToParam TOKEN_TRANSFER case |
| `packages/daemon/src/__tests__/database-policy-engine.test.ts` | 11 new token_limits test cases covering all scenarios | VERIFIED | 11 tests in `describe('DatabasePolicyEngine - evaluateSpendingLimit with token_limits')` at lines 2074-2482; all 88 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `stages.ts buildTransactionParam` | `database-policy-engine.ts TransactionParam` | tokenDecimals field sync | WIRED | `stages.ts:208,233` set `tokenDecimals: r.token.decimals`; consumed at `database-policy-engine.ts:1504` via `buildTokenContext` |
| `sign-only.ts TransactionParam` | `database-policy-engine.ts TransactionParam` | Interface field parity | WIRED | Both have `tokenDecimals?: number` and `assetId?: string` |
| `evaluate()` | `evaluateSpendingLimit` | tokenContext from TransactionParam | WIRED | Line 291-292: `buildTokenContext(transaction, spendingPolicy)` then passed as 4th arg |
| `evaluateBatch()` | `evaluateSpendingLimit` | undefined tokenContext (BATCH skip) | WIRED | Line 396: 4th arg omitted; comment documents intentional omission |
| `evaluateAndReserve()` | `evaluateSpendingLimit` | tokenContext from TransactionParam | WIRED | Lines 607-613: `buildTokenContext(transaction, spendingPolicy)` then passed as 4th arg |
| `evaluateSpendingLimit` | `evaluateTokenTier` | tokenContext parameter forwarding | WIRED | Line 1344: `this.evaluateTokenTier(BigInt(amount), rules, tokenContext)` |
| `evaluateTokenTier` | `NATIVE_DECIMALS` | decimal lookup for TRANSFER native tokens | WIRED | Lines 1417, 1422: `NATIVE_DECIMALS[tokenContext.chain]` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ENGN-01 | 236-01 | TransactionParam에 tokenDecimals 필드가 추가되고 3곳 인터페이스가 동기화됨 | SATISFIED | `tokenDecimals?: number` confirmed in all 3 files |
| ENGN-02 | 236-01 | buildTransactionParam()이 TOKEN_TRANSFER/APPROVE에서 tokenDecimals를 전달함 | SATISFIED | `stages.ts:208,233` pass `r.token.decimals` |
| ENGN-03 | 236-02, 236-03 | evaluateSpendingLimit()에 tokenContext 파라미터가 추가됨 | SATISFIED | 4-arg signature at line 1323; wired at all 3 callsites |
| ENGN-04 | 236-02 | evaluateTokenTier() 함수가 CAIP-19 키 매칭 순서로 평가함 | SATISFIED | Lines 1406-1423 implement priority: exact -> native:{chain} -> native -> null |
| ENGN-05 | 236-02 | 토큰별 한도 매칭 시 raw amount를 decimal 변환하여 사람 읽기 단위로 비교함 | SATISFIED | `parseDecimalToBigInt` at lines 1431-1433; precision-safe fixed-point comparison |
| ENGN-06 | 236-02 | token_limits 매칭 없을 때 기존 raw 필드로 폴백함 | SATISFIED | Lines 1347-1349: null from evaluateTokenTier -> `evaluateNativeTier` fallback; test 5 passes |
| ENGN-07 | 236-02 | raw 필드도 없을 때 네이티브 티어 평가를 스킵하고 USD만으로 판정함 | SATISFIED | `evaluateNativeTier` returns INSTANT when all raw fields undefined; tests 6, 11 confirm no crash |
| ENGN-08 | 236-02, 236-03 | per-tx 최종 티어가 maxTier(USD 티어, 토큰별 티어)로 결정됨 | SATISFIED | Line 1360: `maxTier(tokenTier, usdTier)`; test 7 confirms more conservative tier wins |
| ENGN-09 | 236-02, 236-03 | APPROVE + APPROVE_TIER_OVERRIDE 존재 시 token_limits가 무시됨 | SATISFIED | Lines 283-285 and 581-583: APPROVE_TIER_OVERRIDE returns early before SPENDING_LIMIT; test 9 passes |
| ENGN-10 | 236-02, 236-03 | CONTRACT_CALL/BATCH에서 token_limits가 적용되지 않음 | SATISFIED | evaluateTokenTier returns null for CONTRACT_CALL/BATCH; evaluateBatch omits tokenContext; test 10 passes |

No orphaned requirements for Phase 236. ADMN-* and CMPT-* requirements are correctly assigned to future phases (237, 238).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

No TODO, FIXME, placeholder comments, or empty implementations found in modified files.

### Human Verification Required

None. All behaviors verifiable programmatically:
- Decimal conversion logic verified via BigInt arithmetic in tests
- CAIP-19 key matching priority verified via unit tests (tests 1-11)
- maxTier aggregation verified via test 7 (evaluateAndReserve with usdAmount)
- No UI, real-time, or external service dependencies in this phase

### Test Results

```
Test Files  1 passed (1)
      Tests  88 passed (88)
   Start at  18:46:30
   Duration  1.08s
```

All 11 new token_limits tests pass. All 77 pre-existing tests continue to pass (zero regressions).

### Typecheck Results

```
Tasks:    4 successful, 4 total
Cached:    4 cached, 4 total
```

No type errors in `@waiaas/daemon`.

### Commits Verified

| Commit | Description |
|--------|-------------|
| `062ca6a3` | feat(236-01): add tokenDecimals to TransactionParam + wire through buildTransactionParam |
| `c2676d76` | test(236-02): add failing tests for evaluateTokenTier + token_limits evaluation |
| `2736239b` | feat(236-02): implement evaluateTokenTier + token_limits evaluation in policy engine |
| `4f788861` | feat(236-03): wire tokenContext through all evaluateSpendingLimit callsites |

All 4 commits confirmed in git history.

### Gaps Summary

No gaps. All 10 ENGN requirements satisfied, all 13 must-have truths verified, all key links wired, 88 tests green, typecheck clean.

---

_Verified: 2026-02-22T09:50:00Z_
_Verifier: Claude (gsd-verifier)_
