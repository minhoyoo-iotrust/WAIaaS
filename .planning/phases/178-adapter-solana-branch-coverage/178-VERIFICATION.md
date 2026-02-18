---
phase: 178-adapter-solana-branch-coverage
verified: 2026-02-18T12:15:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
human_verification: []
---

# Phase 178: adapter-solana Branch Coverage Verification Report

**Phase Goal:** @waiaas/adapter-solana의 브랜치 커버리지가 75% 이상으로 충분히 도달하여 임계값 복원이 가능한 상태가 된다
**Verified:** 2026-02-18T12:15:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | convertBatchInstruction() 4-type dispatch branches (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE) each tested with normal and error paths | VERIFIED | `solana-batch-branches.test.ts` — 15 tests (1 skipped), covers TOKEN_TRANSFER mint-not-found/invalid-owner/Token-2022/ATA-exists, CONTRACT_CALL missing-programId/data/accounts/base64/4-roles, APPROVE mint-not-found/invalid-owner/Token-2022, buildBatch outer catch re-throw |
| 2 | signExternalTransaction() base64 decode failure, key length detection (32/64-byte), outer catch branches tested with accurate error messages | VERIFIED | `solana-sign-external-branches.test.ts` — 7 tests covering 32-byte key path, decode failure via 0xFF bytes, malformed base64 fallthrough to Step 2, outer catch wrapping non-ChainError. Buffer.from leniency documented as dead code. |
| 3 | tx-parser.ts parsing failure, unknown instruction, null coalescing fallback edge cases tested without exceptions | VERIFIED | `solana-tx-parser-branches.test.ts` — 14 tests covering parseSystemInstruction (short data, non-transfer index, method undefined), parseTokenInstruction (empty data, SPL_APPROVE type 4, short TransferChecked, other types), Token-2022 dispatch, CONTRACT_CALL method variants, accountIndices null coalescing |
| 4 | Error instanceof branches, getAssets sort logic, estimateFee token/native branching tested; branch coverage exceeds 75% | VERIFIED | `solana-misc-branches.test.ts` — 14 tests. Coverage report confirms: adapter.ts 84.85%, tx-parser.ts 86.36%, all files 85.06% |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/adapters/solana/src/__tests__/solana-batch-branches.test.ts` | Branch-focused tests for convertBatchInstruction 4-type dispatch + buildBatch error handling | VERIFIED | 625 lines, 15 tests (1 skipped — dead code documented), real mock implementations |
| `packages/adapters/solana/src/__tests__/solana-sign-external-branches.test.ts` | Branch-focused tests for signExternalTransaction edge cases | VERIFIED | 228 lines, 7 tests, uses real Ed25519 keypair generation |
| `packages/adapters/solana/src/__tests__/solana-tx-parser-branches.test.ts` | Branch-focused tests for tx-parser.ts edge cases | VERIFIED | 414 lines, 14 tests, builds real Solana transactions with raw binary instructions |
| `packages/adapters/solana/src/__tests__/solana-misc-branches.test.ts` | Tests for Error instanceof branches, getAssets sort edge cases, estimateFee error paths | VERIFIED | 549 lines, 14 tests, vi.hoisted + vi.mock pattern with real Ed25519 fixture generation |

All 4 artifacts: EXIST (confirmed by `ls`), SUBSTANTIVE (real test logic, no stubs/placeholders), WIRED (adapter methods and parseSolanaTransaction called directly).

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `solana-batch-branches.test.ts` | `packages/adapters/solana/src/adapter.ts` | `adapter.buildBatch()` called 14x | WIRED | Lines 169, 197, 245, 302, 346, 373, 400, 428, 458, 485, 512, 540, 589, 615 |
| `solana-sign-external-branches.test.ts` | `packages/adapters/solana/src/adapter.ts` | `adapter.signExternalTransaction()` called 7x | WIRED | Lines 119, 130, 131, 150, 164, 196, 216 |
| `solana-tx-parser-branches.test.ts` | `packages/adapters/solana/src/tx-parser.ts` | `parseSolanaTransaction()` imported directly + `adapter.parseTransaction()` | WIRED | Direct import at line 35; called at lines 124, 148, 168, 190, 214, 234, 254, 286, 302, 323, 341, 360, 381, 407-408 |
| `solana-misc-branches.test.ts` | `packages/adapters/solana/src/adapter.ts` | `adapter.getAssets`, `adapter.estimateFee`, `adapter.getBalance`, `adapter.buildTransaction`, `adapter.simulateTransaction`, `adapter.submitTransaction`, `adapter.signTransaction`, `adapter.getTokenInfo` | WIRED | Multiple call sites per method; all 8 adapter methods exercised |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SOL-01 | 178-01-PLAN.md | convertBatchInstruction() 4가지 instruction 타입 분기 테스트 추가 (~12 브랜치) | SATISFIED | `solana-batch-branches.test.ts` — 14 passing tests cover all 4 instruction type error paths and buildBatch outer catch |
| SOL-02 | 178-01-PLAN.md | signExternalTransaction() Base64 디코딩 실패, 키 길이 판별, 서명자 검증 분기 테스트 추가 (~8 브랜치) | SATISFIED | `solana-sign-external-branches.test.ts` — 7 tests cover 32-byte key, decode failure, outer catch wrapping, dead code documented |
| SOL-03 | 178-02-PLAN.md | tx-parser.ts 파싱 실패, unknown 명령어, null coalescing fallback 분기 테스트 추가 (~15 브랜치) | SATISFIED | `solana-tx-parser-branches.test.ts` — 14 tests cover all instruction type parsing branches including null coalescing |
| SOL-04 | 178-02-PLAN.md | Error instanceof 분기 + 기타(getAssets 정렬, estimateFee 토큰/네이티브) 테스트 추가 (~43 브랜치) | SATISFIED | `solana-misc-branches.test.ts` — 14 tests cover Error instanceof, getAssets sort comparator, estimateFee error paths, signTransaction 32-byte key, getTokenInfo data handling |

**Note on REQUIREMENTS.md traceability table:** The traceability table in `.planning/REQUIREMENTS.md` still shows SOL-01 through SOL-04 as "Pending" (checkbox unchecked). This is a documentation gap — the implementation is complete and verified. The status in REQUIREMENTS.md should be updated to "Complete" for the record, but this does not affect goal achievement.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `solana-batch-branches.test.ts` | 563-568 | `it.skip` — dead code documentation | INFO | Intentional: documents that the "Unknown instruction type" throw is unreachable dead code because `classifyInstruction` is exhaustive. Correct practice. |

No blockers or warnings found. The `it.skip` is the deliberate dead-code documentation pattern established by this phase.

---

### Coverage Results

```
--------------|---------|----------|---------|---------|------------------------
File          | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------|---------|----------|---------|---------|------------------------
All files     |   96.98 |    85.06 |    97.5 |   96.98 |
 adapter.ts   |   97.04 |    84.85 |   97.14 |   97.04 | ...1233-1234,1252-1255
 tx-parser.ts |   96.46 |    86.36 |     100 |   96.46 | 51-54
--------------|---------|----------|---------|---------|------------------------
```

- **Overall branch coverage: 85.06%** (target: 75%)
- Remaining uncovered lines in `adapter.ts`: lines 1233-1234 (sweepAll — unimplemented), 1252-1255 (Step 1 base64 decode try/catch — dead code, Buffer.from is lenient)
- Remaining uncovered lines in `tx-parser.ts`: lines 51-54 (defensive `compiledMessage.staticAccounts ?? []` and `compiledMessage.instructions ?? []` — unreachable with real decoders)

---

### Test Run Results

```
Test Files  12 passed | 2 skipped (14)
     Tests  166 passed | 9 skipped (175)
  Start at  12:14:03
  Duration  4.29s
```

- **175 total tests** (166 passing + 9 skipped by design)
- **0 failures, 0 regressions**
- New tests: 50 across 4 files (21 in Plan 01 + 28 in Plan 02 — 1 skipped in each)

---

### Commit Verification

| Commit | Description | Verified |
|--------|-------------|---------|
| `cd4ef81` | test(178-01): add convertBatchInstruction branch-coverage tests | Found in git log |
| `516225f` | test(178-01): add signExternalTransaction branch-coverage tests | Found in git log |
| `6f59894` | test(178-02): add tx-parser branch-coverage tests | Found in git log |
| `ea7b21f` | test(178-02): add adapter.ts misc branch-coverage tests | Found in git log |

---

### Human Verification Required

None — all verification items are programmatically verifiable. Coverage numbers, test pass/fail, file existence, and wiring are all confirmed by automated checks.

---

## Gaps Summary

No gaps. All success criteria are met:

1. **convertBatchInstruction 4-type dispatch** — all 4 types (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE) tested with both normal and error paths in `solana-batch-branches.test.ts`
2. **signExternalTransaction edge cases** — 32-byte key path, decode failure, outer catch wrapping tested; Base64 Step 1 catch documented as dead code in `solana-sign-external-branches.test.ts`
3. **tx-parser.ts edge cases** — all instruction parsing branches, null coalescing fallbacks tested in `solana-tx-parser-branches.test.ts`
4. **Error instanceof branches, getAssets sort, estimateFee paths** — all tested in `solana-misc-branches.test.ts`
5. **Branch coverage 85.06%** — well above the 75% target, enabling threshold restoration in Phase 181

The phase goal is fully achieved. @waiaas/adapter-solana is ready for the Phase 181 threshold restoration (65% → 75% in `vitest.config.ts`).

---

_Verified: 2026-02-18T12:15:00Z_
_Verifier: Claude (gsd-verifier)_
