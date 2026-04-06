---
phase: 22-token-extension
verified: 2026-02-07T14:45:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 22: 토큰 확장 설계 Verification Report

**Phase Goal:** 에이전트가 네이티브 토큰뿐 아니라 SPL/ERC-20 토큰을 전송하고, 보유 자산을 조회하며, 에이전트별 허용 토큰 정책이 적용되는 상태를 설계한다

**Verified:** 2026-02-07T14:45:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TransferRequest에 token 필드가 정의되어 있고, undefined일 때 네이티브 전송으로 하위 호환된다 | ✓ VERIFIED | docs/56: 섹션 2.2 TransferRequest.token?: TokenInfo 정의, 섹션 2.3에서 하위 호환 명시 |
| 2 | SolanaAdapter와 EvmAdapter에서 SPL/ERC-20 토큰 전송 트랜잭션 빌드 로직이 바이트 수준까지 명세되어 있다 | ✓ VERIFIED | docs/56: 섹션 3.2 buildSplTokenTransfer (450줄), 섹션 4.3 buildErc20Transfer (220줄), TypeScript 의사코드 포함 |
| 3 | getAssets()가 에이전트 보유 토큰 목록(민트/잔액/소수점)을 반환하는 인터페이스와 RPC 구현이 설계되어 있다 | ✓ VERIFIED | docs/57: 섹션 3 IChainAdapter.getAssets() 14번째 메서드, 섹션 4 Solana (getTokenAccountsByOwner), 섹션 5 EVM (ALLOWED_TOKENS 기반) |
| 4 | ALLOWED_TOKENS 정책 규칙이 에이전트별 토큰 화이트리스트를 검증하고, 미등록 토큰 전송을 거부하는 로직이 명세되어 있다 | ✓ VERIFIED | docs/56: 섹션 6.3 AllowedTokensRuleSchema (Zod), 섹션 6.4 evaluateAllowedTokens() 8단계 로직, 기본 거부 전략 |
| 5 | SPL ATA 생성 비용과 ERC-20 gas 추정을 포함한 토큰 전송 수수료 추정 로직이 설계되어 있다 | ✓ VERIFIED | docs/57: 섹션 7 FeeEstimate.ataCreationCost (동적 조회), estimateGas + estimateFeesPerGas 기반 ERC-20 추정 |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docs/56-token-transfer-extension-spec.md` | CHAIN-EXT-01 토큰 전송 확장 스펙 | ✓ VERIFIED | 1824줄, 9섹션, TOKEN-01/TOKEN-02 커버 |
| `docs/57-asset-query-fee-estimation-spec.md` | CHAIN-EXT-02 자산 조회 + 수수료 추정 스펙 | ✓ VERIFIED | 1476줄, 9섹션, TOKEN-03/TOKEN-04/TOKEN-05 커버 |

**Artifact Verification Details:**

**docs/56-token-transfer-extension-spec.md:**
- **Level 1 (Exists):** ✓ EXISTS (71KB, 1824 lines)
- **Level 2 (Substantive):** ✓ SUBSTANTIVE
  - Line count: 1824 lines (far exceeds 15-line minimum)
  - No stub patterns (TODO/FIXME/placeholder: 0)
  - Complete TypeScript interfaces and Zod schemas
  - Sections 2-7 complete with detailed specifications
- **Level 3 (Wired):** ✓ WIRED
  - References to 27-chain-adapter-interface.md (TransferRequest extension)
  - References to 31-solana-adapter-detail.md (buildSplTokenTransfer)
  - References to 33-time-lock-approval-mechanism.md (ALLOWED_TOKENS policy)
  - References to 45-enum-unified-mapping.md (PolicyType enum)
  - Section 9 documents 32 changes to 8 existing docs (Phase 25 integration points)

**docs/57-asset-query-fee-estimation-spec.md:**
- **Level 1 (Exists):** ✓ EXISTS (52KB, 1476 lines)
- **Level 2 (Substantive):** ✓ SUBSTANTIVE
  - Line count: 1476 lines (far exceeds 15-line minimum)
  - No stub patterns (TODO/FIXME/placeholder: 0)
  - Complete AssetInfo interface, getAssets() implementation specs
  - FeeEstimate structure with ataCreationCost field
  - 44 test scenarios defined (4 levels + 8 security)
- **Level 3 (Wired):** ✓ WIRED
  - References to 27-chain-adapter-interface.md (getAssets 14th method)
  - References to 37-rest-api-complete-spec.md (GET /v1/wallet/assets)
  - References to 41/42/43-test-architecture docs (test scenarios)
  - References to 56-token-transfer-extension-spec.md (ALLOWED_TOKENS)
  - Section 9 documents 7 changes to existing docs

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| docs/56 | 27-chain-adapter-interface.md | TransferRequest.token field | ✓ WIRED | Section 9 specifies exact changes (Section 2.3 modification) |
| docs/56 | 33-time-lock-approval-mechanism.md | ALLOWED_TOKENS PolicyType | ✓ WIRED | Section 6 defines PolicyType extension, Section 9 lists 4 changes to doc 33 |
| docs/56 | 31-solana-adapter-detail.md | buildSplTokenTransfer spec | ✓ WIRED | Section 3.2 promotes preliminary design to formal spec |
| docs/57 | 27-chain-adapter-interface.md | getAssets() 14th method | ✓ WIRED | Section 3 defines interface, Section 9 specifies IChainAdapter changes |
| docs/57 | 37-rest-api-complete-spec.md | GET /v1/wallet/assets endpoint | ✓ WIRED | Section 6 defines endpoint, Section 9 lists endpoint addition |
| docs/56 + docs/57 | Phase 25 integration | 39 total changes to 8 docs | ✓ WIRED | Both Section 9s provide actionable change lists for Phase 25 |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| TOKEN-01: TransferRequest.token 확장 | ✓ SATISFIED | docs/56 Section 2: TransferRequest.token?: TokenInfo, undefined = native |
| TOKEN-02: ALLOWED_TOKENS 정책 | ✓ SATISFIED | docs/56 Section 6: AllowedTokensRuleSchema, evaluateAllowedTokens(), default deny |
| TOKEN-03: getAssets() 인터페이스 | ✓ SATISFIED | docs/57 Section 3-5: 14th method, AssetInfo, Solana/EVM implementations |
| TOKEN-04: 수수료 추정 확장 | ✓ SATISFIED | docs/57 Section 7: FeeEstimate.ataCreationCost, ERC-20 estimateGas |
| TOKEN-05: 테스트 시나리오 | ✓ SATISFIED | docs/57 Section 8: 4 test levels, 8 security scenarios, 3 mock boundaries |

### Anti-Patterns Found

No blocker or warning anti-patterns detected.

**Scanned files:**
- docs/56-token-transfer-extension-spec.md
- docs/57-asset-query-fee-estimation-spec.md

**Findings:** None. Both documents are complete design specifications with:
- No TODO/FIXME/placeholder comments
- No empty implementations
- No console.log-only code
- Comprehensive TypeScript interfaces and Zod schemas
- Detailed pseudocode for all build logic

### Human Verification Required

None. All success criteria are design-level specifications that can be verified by document inspection. No runtime behavior or visual elements to test.

---

## Detailed Verification

### Success Criterion 1: TransferRequest.token field with backward compatibility

**Expected:** TransferRequest에 token 필드가 정의되어 있고, undefined일 때 네이티브 전송으로 하위 호환된다

**Verification:**

```bash
# Check token field definition
grep -A 10 "interface TransferRequest" docs/56-token-transfer-extension-spec.md
```

**Found:**
- Line 113-121: Extended TransferRequest interface with `token?: TokenInfo`
- Line 140: `token?: TokenInfo` field (optional)
- Section 2.3: Zod schema with `token: TokenInfoSchema.optional()`
- Section 2.4: Service layer conversion logic clearly handles `token === undefined` → native transfer
- Section 3.4/4.4: Build logic branches on `if (request.token)` → token transfer, else → native

**Status:** ✓ VERIFIED - token field is optional (undefined = native), backward compatible

### Success Criterion 2: SPL/ERC-20 build logic at byte level

**Expected:** SolanaAdapter와 EvmAdapter에서 SPL/ERC-20 토큰 전송 트랜잭션 빌드 로직이 바이트 수준까지 명세되어 있다

**Verification:**

**Solana SPL (docs/56 Section 3):**
- Line 358-720: Complete buildSplTokenTransfer() specification (362 lines)
- Token Program vs Token-2022 detection via mint account owner (line 414-433)
- Token-2022 TLV extension parsing (line 434-497)
- findAssociatedTokenPda() with correct tokenProgram parameter (line 499-518)
- getTransferCheckedInstruction() with decimals verification (line 522-557)
- ATA creation instruction when recipient ATA doesn't exist (line 560-574)
- Compute Unit adjustment for SPL transfer (~450 CU) (line 576-597)
- Error mapping (7 SPL-specific errors) (line 599-720)

**EVM ERC-20 (docs/56 Section 4):**
- Line 754-1069: Complete buildErc20Transfer() specification (315 lines)
- ERC-20 ABI definition (transfer, balanceOf, decimals, symbol) (line 819-838)
- simulateContract() pre-validation for non-standard tokens (line 851-894)
- encodeFunctionData() for transfer(address,uint256) (line 896-916)
- prepareTransactionRequest() with to=contract, value=0n, data=calldata (line 918-939)
- estimateGas() for ERC-20 transfer (~65,000 gas) (line 941-969)
- Error mapping (6 ERC-20-specific errors) (line 971-1069)

**Status:** ✓ VERIFIED - Byte-level pseudocode includes instruction construction, account resolution, TLV parsing, calldata encoding

### Success Criterion 3: getAssets() interface and RPC implementation

**Expected:** getAssets()가 에이전트 보유 토큰 목록(민트/잔액/소수점)을 반환하는 인터페이스와 RPC 구현이 설계되어 있다

**Verification:**

**Interface (docs/57 Section 3):**
- Line 61-108: AssetInfo interface with 7 fields (tokenAddress, symbol, name, decimals, balance, logoUri?, type)
- Line 171: `getAssets(address: string): Promise<AssetInfo[]>` method signature
- Line 192: Declared as 14th method of IChainAdapter
- Line 138-167: Return order: native first, then tokens by balance descending

**Solana Implementation (docs/57 Section 4):**
- Line 217-462: Complete Solana getAssets() implementation design (245 lines)
- Line 338-372: getTokenAccountsByOwner for Token Program
- Line 373-407: getTokenAccountsByOwner for Token-2022 Program
- Line 258-307: 3-tier metadata fallback (known_tokens → Metaplex → UNKNOWN)
- Line 315-462: Full pseudocode with balance filtering (amount > 0)

**EVM Implementation (docs/57 Section 5):**
- Line 463-714: Complete EVM getAssets() implementation design (251 lines)
- Line 467-480: ALLOWED_TOKENS-based conservative discovery (Self-Hosted principle)
- Line 619-674: multicall() optimization for N token balances in 1 RPC call
- Line 580-618: ITokenDiscovery interface with AllowedTokensDiscovery base implementation
- Line 676-702: Extension point for AlchemyDiscovery, MoralisDiscovery plugins

**Status:** ✓ VERIFIED - Interface defined, Solana uses getTokenAccountsByOwner (Token Program + Token-2022), EVM uses ALLOWED_TOKENS + multicall

### Success Criterion 4: ALLOWED_TOKENS policy with whitelist verification and denial

**Expected:** ALLOWED_TOKENS 정책 규칙이 에이전트별 토큰 화이트리스트를 검증하고, 미등록 토큰 전송을 거부하는 로직이 명세되어 있다

**Verification:**

**Policy Schema (docs/56 Section 6):**
- Line 1268-1284: PolicyType enum extended from 4 to 5 (ALLOWED_TOKENS added)
- Line 1293-1340: AllowedTokensRuleSchema Zod definition
  - allowed_tokens: array of { address, symbol, decimals, chain }
  - allow_native: boolean (default: true)
  - unknown_token_action: 'DENY' | 'WARN' (default: 'DENY')
- Line 1282-1292: ALLOWED_TOKENS vs WHITELIST distinction (orthogonal policies)

**Validation Logic (docs/56 Section 6.4-6.6):**
- Line 1361-1487: evaluateAllowedTokens() 8-step logic:
  1. Check if token transfer (request.token !== undefined)
  2. Query agent's ALLOWED_TOKENS policy
  3. If no policy: deny token transfer (native only) - **DEFAULT DENY**
  4. If policy exists: match allowed_tokens by address + chain
  5. If unregistered: apply unknown_token_action (DENY or WARN)
  6. DENY → POLICY_VIOLATION error
  7. WARN → allow + send notification
- Line 1382-1445: Complete TypeScript pseudocode with database query and evaluation
- Line 1446-1487: Integration into DatabasePolicyEngine.evaluate() (Stage 3)

**Status:** ✓ VERIFIED - AllowedTokensRuleSchema defined, evaluateAllowedTokens() has 8-step logic with default deny, unregistered token rejection

### Success Criterion 5: Fee estimation with ATA creation cost and ERC-20 gas

**Expected:** SPL ATA 생성 비용과 ERC-20 gas 추정을 포함한 토큰 전송 수수료 추정 로직이 설계되어 있다

**Verification:**

**FeeEstimate Structure (docs/57 Section 7):**
- Line 927-958: FeeEstimate interface extended with:
  - baseFee: bigint (signature fee)
  - priorityFee: bigint (getRecentPrioritizationFees median)
  - total: bigint (baseFee + priorityFee + ataCreationCost)
  - ataCreationCost?: bigint (SPL only, when recipient ATA doesn't exist)
  - feeCurrency: 'SOL' | 'ETH' (fees paid in native token)

**Solana SPL Fee Logic (docs/57 Section 7.2):**
- Line 970-1057: Complete SPL fee estimation algorithm (87 lines)
- Line 992-1011: Dynamic ATA creation cost:
  - Check recipient ATA existence with getAccountInfo()
  - If not exists: call getMinimumBalanceForRentExemption(165)
  - Result: ~2,039,280 lamports (dynamic, not hardcoded)
- Line 1002-1019: Compute Unit for SPL transfer (~450 CU, within 200K limit, no extra cost)
- Line 1021: total = baseFee + priorityFee + (ataCreationCost ?? 0n)
- Line 1023-1038: SOL balance check before estimation (fee currency validation)

**EVM ERC-20 Gas Logic (docs/57 Section 7.3):**
- Line 1077-1120: Complete ERC-20 fee estimation algorithm (43 lines)
- Line 1085-1092: estimateGas() for ERC-20 transfer (~65,000 gas vs 21,000 native)
- Line 1094-1101: estimateFeesPerGas() for EIP-1559 (maxFeePerGas, maxPriorityFeePerGas)
- Line 1103-1109: total = gasLimit * maxFeePerGas (in wei)
- Line 1110: No ataCreationCost for EVM (concept doesn't exist)
- Line 1112-1118: ETH balance check before estimation

**Comparison Table (docs/57 Section 7.4):**
- Line 1123-1138: Fee comparison table (native vs token for Solana/EVM)
  - Solana SPL: 5,000 lam base + 0 or ~2M lam ATA
  - EVM ERC-20: ~65K gas vs ~21K gas native

**Status:** ✓ VERIFIED - FeeEstimate has ataCreationCost field, Solana uses getMinimumBalanceForRentExemption (dynamic), EVM uses estimateGas + estimateFeesPerGas

---

## Requirements Traceability

All 5 requirements mapped to Phase 22 are satisfied:

| Requirement | Deliverable | Section | Verification |
|-------------|-------------|---------|--------------|
| TOKEN-01: TransferRequest.token 확장 | docs/56 | Section 2 | ✓ token?: TokenInfo field, undefined = native |
| TOKEN-02: ALLOWED_TOKENS 정책 | docs/56 | Section 6 | ✓ AllowedTokensRuleSchema, evaluateAllowedTokens() |
| TOKEN-03: getAssets() 인터페이스 | docs/57 | Section 3-5 | ✓ 14th method, Solana/EVM implementations |
| TOKEN-04: 수수료 추정 확장 | docs/57 | Section 7 | ✓ FeeEstimate.ataCreationCost, ERC-20 estimateGas |
| TOKEN-05: 테스트 시나리오 | docs/57 | Section 8 | ✓ 4 levels + 8 security + 3 mocks |

**Phase 25 Integration Readiness:**
- docs/56 Section 9: 32 changes to 8 existing docs (27, 25, 31, 33, 32, 37, 38, 45)
- docs/57 Section 9: 7 changes to existing docs (27, 31, 36, 37, 41, 42, 43)
- Total: 39 actionable change items for Phase 25 document integration

---

## Summary

**Phase 22 goal ACHIEVED.** Both deliverables (CHAIN-EXT-01, CHAIN-EXT-02) exist as substantive design documents totaling 3,300 lines. All 5 success criteria verified:

1. ✓ TransferRequest.token field defined with backward compatibility (undefined → native)
2. ✓ SPL/ERC-20 build logic specified at byte level (Token-2022 branching, simulateContract + encodeFunctionData)
3. ✓ getAssets() interface with Solana (getTokenAccountsByOwner Token Program + Token-2022) and EVM (ALLOWED_TOKENS + multicall) implementations
4. ✓ ALLOWED_TOKENS policy with AllowedTokensRuleSchema, evaluateAllowedTokens() 8-step logic, default deny
5. ✓ Fee estimation extended with SPL ATA creation cost (dynamic) and ERC-20 gas estimation (estimateGas + estimateFeesPerGas)

All 5 requirements (TOKEN-01 through TOKEN-05) satisfied. Phase ready for Phase 23 (Transaction Type Extension).

---

_Verified: 2026-02-07T14:45:00Z_
_Verifier: Claude (gsd-verifier)_
