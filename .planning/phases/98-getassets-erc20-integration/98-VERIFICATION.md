---
phase: 98-getassets-erc20-integration
verified: 2026-02-13T22:04:47Z
status: passed
score: 3/3 truths verified
re_verification: false
---

# Phase 98: getAssets ERC-20 연동 Verification Report

**Phase Goal**: EVM 지갑의 getAssets()가 토큰 레지스트리와 ALLOWED_TOKENS에 등록된 ERC-20 토큰 잔액을 자동으로 반환한다

**Verified**: 2026-02-13T22:04:47Z

**Status**: passed

**Re-verification**: No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                             | Status     | Evidence                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | EVM 지갑의 GET /v1/wallets/:id/assets 응답에 네이티브 ETH와 함께 레지스트리 + ALLOWED_TOKENS 합집합에 해당하는 ERC-20 토큰 잔액이 포함된다 | ✓ VERIFIED | Integration tests pass; wallet.ts lines 195-233 wire tokens before getAssets(); server.ts line 235 injects service |
| 2   | 토큰 레지스트리와 ALLOWED_TOKENS 모두 미설정인 EVM 지갑은 네이티브 ETH만 반환하며 에러가 발생하지 않는다                          | ✓ VERIFIED | Test "returns only native ETH when no registry or policy tokens" passes (line 833-850)                        |
| 3   | Solana 지갑의 기존 getAssets() 동작에 회귀가 없다                                                                                        | ✓ VERIFIED | Duck-typing guard ('setAllowedTokens' in adapter) line 195; SolanaAdapter has no setAllowedTokens method      |

**Score**: 3/3 truths verified

### Required Artifacts

| Artifact                                                                      | Expected                                           | Status     | Details                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `packages/daemon/src/api/routes/wallet.ts`                                    | ERC-20 token list wiring before getAssets() call   | ✓ VERIFIED | Lines 195-233: Token registry + ALLOWED_TOKENS merge with dedup, setAllowedTokens() called       |
| `packages/daemon/src/api/server.ts`                                           | TokenRegistryService injected into walletRoutes deps | ✓ VERIFIED | Line 226: Shared instance created; Line 235: Passed to walletRoutes; Line 311: Reused for registry routes |
| `packages/daemon/src/__tests__/token-registry.test.ts`                        | Integration tests for getAssets ERC-20 wiring      | ✓ VERIFIED | Suite 3 (lines 546-850): 4 tests covering registry, policy, dedup, empty state                   |

**All artifacts**: Exist (Level 1), Substantive (Level 2), Wired (Level 3)

### Key Link Verification

| From                                          | To                                                                        | Via                                                     | Status     | Details                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `packages/daemon/src/api/routes/wallet.ts`    | `packages/daemon/src/infrastructure/token-registry/token-registry-service.ts` | getAdapterTokenList(network)                            | ✓ WIRED    | Line 201: `await deps.tokenRegistryService.getAdapterTokenList(wallet.network)`         |
| `packages/daemon/src/api/routes/wallet.ts`    | `packages/daemon/src/pipeline/database-policy-engine.ts`                  | ALLOWED_TOKENS policy query from policies table        | ✓ WIRED    | Lines 212-219: Query policies table with type='ALLOWED_TOKENS', enabled=true             |
| `packages/daemon/src/api/routes/wallet.ts`    | `packages/adapters/evm/src/adapter.ts`                                    | setAllowedTokens() call before getAssets()             | ✓ WIRED    | Line 232: setAllowedTokens() called; Line 235: getAssets() called immediately after      |

**All key links**: WIRED with proper call + response handling

### Requirements Coverage

Phase 98 implements requirements ASSETS-01, ASSETS-02:

| Requirement | Description                                                                        | Status       | Supporting Truths |
| ----------- | ---------------------------------------------------------------------------------- | ------------ | ----------------- |
| ASSETS-01   | EVM getAssets returns registry + ALLOWED_TOKENS union of ERC-20 token balances   | ✓ SATISFIED  | Truth 1, Truth 2  |
| ASSETS-02   | Empty registry/policy state returns native ETH only without errors                | ✓ SATISFIED  | Truth 2           |

### Anti-Patterns Found

No anti-patterns detected.

Scanned files:
- `packages/daemon/src/api/routes/wallet.ts` (lines 195-235)
- `packages/daemon/src/api/server.ts` (lines 226-311)
- `packages/daemon/src/__tests__/token-registry.test.ts` (Suite 3)

No TODO/FIXME/PLACEHOLDER comments, no empty implementations, no console.log-only handlers.

### Human Verification Required

None. All verification completed programmatically through:
1. Unit/integration tests (21 tests in token-registry.test.ts, all pass)
2. Full daemon test suite (703 tests pass, no regressions)
3. Code inspection confirms proper wiring

### Implementation Quality

**Patterns Established**:
- Duck-typing pattern: `'setAllowedTokens' in adapter` to detect EVM adapter without tight coupling
- Case-insensitive address deduplication: `Set<lowercase>` for ERC-20 address comparison
- Registry tokens prioritized over policy tokens (registry has full metadata: symbol, name, decimals)
- Shared service instance between multiple routes (server.ts line 226)

**Test Coverage**:
- Test 1: Registry tokens wired to getAssets (line 704-739)
- Test 2: ALLOWED_TOKENS policy tokens wired (line 744-778)
- Test 3: Deduplication works (registry + policy with same address) (line 783-828)
- Test 4: Empty state returns native-only (line 833-850)

**Commit Quality**:
- Atomic commits: 37d44a3 (feat), 9ebe9c3 (test), 932b082 (docs)
- Proper git hygiene with task-level commits
- All commits verified in git log

**No Regressions**:
- Full daemon test suite: 703/703 tests pass
- Solana adapter unaffected (no setAllowedTokens method)
- Duck-typing guard prevents execution for non-EVM adapters

### Success Criteria Verification

From ROADMAP.md Phase 98 Success Criteria:

1. ✓ **EVM 지갑의 GET /v1/wallets/:id/assets 응답에 네이티브 ETH와 함께 레지스트리 + ALLOWED_TOKENS 합집합에 해당하는 ERC-20 토큰 잔액이 포함된다**
   - Evidence: Integration test "EVM getAssets returns registry tokens when token registry has entries" passes
   - Evidence: Integration test "EVM getAssets returns ALLOWED_TOKENS policy tokens" passes
   - Evidence: wallet.ts lines 195-233 merge both sources with case-insensitive deduplication

2. ✓ **토큰 레지스트리와 ALLOWED_TOKENS 모두 미설정인 EVM 지갑은 네이티브 ETH만 반환하며 에러가 발생하지 않는다**
   - Evidence: Integration test "EVM getAssets returns only native ETH when no registry or policy tokens" passes
   - Evidence: Test asserts exactly 1 asset (native ETH) with status 200

3. ✓ **Solana 지갑의 기존 getAssets() 동작에 회귀가 없다**
   - Evidence: Duck-typing guard `'setAllowedTokens' in adapter` (line 195) prevents execution for Solana
   - Evidence: SolanaAdapter has no setAllowedTokens method (verified via grep)
   - Evidence: No test failures in daemon suite (703/703 pass)

---

## Summary

Phase 98 goal **ACHIEVED**. All must-haves verified:

**Truths**: 3/3 verified
**Artifacts**: 3/3 pass all three levels (exists, substantive, wired)
**Key Links**: 3/3 wired with proper call-response handling
**Requirements**: 2/2 satisfied (ASSETS-01, ASSETS-02)
**Tests**: 21/21 pass in token-registry.test.ts, 703/703 pass in full daemon suite
**Anti-Patterns**: None found
**Regressions**: None detected

BUG-014 resolved. EVM wallets now return ERC-20 token balances from token registry + ALLOWED_TOKENS policy union. Solana wallets unaffected. Ready to proceed to next phase.

---

_Verified: 2026-02-13T22:04:47Z_  
_Verifier: Claude (gsd-verifier)_
