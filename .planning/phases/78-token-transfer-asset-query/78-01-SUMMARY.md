---
phase: 78-token-transfer-asset-query
plan: 01
subsystem: chain-adapter, policy
tags: [solana, spl-token, token-2022, ata, transferChecked, allowed-tokens, policy-engine]

# Dependency graph
requires:
  - phase: 76-infra-pipeline-foundation
    provides: IChainAdapter 20-method interface, SolanaAdapter stub methods, pipeline DB schema
  - phase: 77-evm-adapter
    provides: EvmAdapter pattern for token operations, ChainError 25-code system
provides:
  - SolanaAdapter real implementations for buildTokenTransfer, getTokenInfo, estimateFee, getTransactionFee
  - SolanaAdapter getAssets expanded to query Token-2022 accounts
  - DatabasePolicyEngine ALLOWED_TOKENS evaluation (default deny for TOKEN_TRANSFER)
  - tokenAddress optional field on evaluate()/evaluateAndReserve() transaction parameter
affects:
  - Phase 79 (contract call) uses same pattern for buildContractCall/buildApprove
  - Phase 80 (batch) uses same ATA/instruction pattern for buildBatch
  - Phase 81 (pipeline integration) wires tokenAddress from Stage 3 into DatabasePolicyEngine.evaluate()

# Tech tracking
tech-stack:
  added: ["@solana-program/token 0.10.0"]
  patterns:
    - "findAssociatedTokenPda + getCreateAssociatedTokenIdempotentInstruction for ATA creation"
    - "getTransferCheckedInstruction with programAddress config for Token/Token-2022 branching"
    - "evaluateAllowedTokens between WHITELIST and SPENDING_LIMIT in policy evaluation chain"

key-files:
  created:
    - "packages/adapters/solana/src/__tests__/solana-token-transfer.test.ts"
  modified:
    - "packages/adapters/solana/src/adapter.ts"
    - "packages/adapters/solana/package.json"
    - "packages/adapters/solana/src/__tests__/solana-adapter.test.ts"
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/__tests__/database-policy-engine.test.ts"
    - "pnpm-lock.yaml"

key-decisions:
  - "@solana-program/token single package provides both ATA and transferChecked instructions (no separate ATA package needed)"
  - "Token-2022 detection via mint account owner field (SPL_TOKEN_PROGRAM_ID vs TOKEN_2022_PROGRAM_ID)"
  - "ATA_RENT_LAMPORTS = 2_039_280n constant for fee estimation (rent-exempt minimum)"
  - "getAssets sorts: native first, then by balance descending"
  - "ALLOWED_TOKENS default deny: TOKEN_TRANSFER denied when no ALLOWED_TOKENS policy exists (requires at least one other policy to be loaded)"
  - "tokenAddress? optional field backward compatible -- existing callers unaffected"
  - "appendTransactionMessageInstruction cast via `as unknown as typeof txMessage` to bypass Solana Kit v6 __transactionSize brand stripping"

patterns-established:
  - "Token program auto-branching: query mint owner -> SPL Token or Token-2022 -> pass programAddress to instruction builder"
  - "Policy evaluation chain: WHITELIST -> ALLOWED_TOKENS -> SPENDING_LIMIT (deny-first at each step)"

# Metrics
duration: 13min
completed: 2026-02-12
---

# Phase 78 Plan 01: SPL Token Transfer + ALLOWED_TOKENS Policy Summary

**SolanaAdapter SPL/Token-2022 transfer with ATA auto-creation via @solana-program/token + ALLOWED_TOKENS default-deny policy in DatabasePolicyEngine**

## Performance

- **Duration:** 13 min
- **Started:** 2026-02-12T00:02:51Z
- **Completed:** 2026-02-12T00:15:14Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- SolanaAdapter buildTokenTransfer with automatic Token Program/Token-2022 branching based on mint account owner
- ATA creation via getCreateAssociatedTokenIdempotentInstruction when destination ATA doesn't exist
- getTokenInfo extracts decimals from raw mint data at offset 44 (SPL Token mint layout)
- estimateFee includes ATA rent cost (2,039,280 lamports) for token transfers needing ATA creation
- getAssets expanded to query both SPL Token Program and Token-2022 program accounts
- ALLOWED_TOKENS policy evaluation: default deny for TOKEN_TRANSFER, case-insensitive address matching
- 28 new tests (21 adapter-solana + 7 daemon policy engine)

## Task Commits

Each task was committed atomically:

1. **Task 1: SolanaAdapter buildTokenTransfer + getTokenInfo + estimateFee + getTransactionFee + getAssets Token-2022** - `fcffd1c` (feat)
2. **Task 2: ALLOWED_TOKENS policy evaluation in DatabasePolicyEngine** - `d3736ea` (feat)

## Files Created/Modified
- `packages/adapters/solana/src/adapter.ts` - Real implementations for 5 stub methods (buildTokenTransfer, getTokenInfo, estimateFee, getTransactionFee, getAssets Token-2022)
- `packages/adapters/solana/src/__tests__/solana-token-transfer.test.ts` - 21 tests for token transfer, getTokenInfo, estimateFee, getTransactionFee, getAssets Token-2022
- `packages/adapters/solana/src/__tests__/solana-adapter.test.ts` - Updated getAssets mocks for Token-2022 dual-query + sort order
- `packages/adapters/solana/package.json` - Added @solana-program/token dependency
- `packages/daemon/src/pipeline/database-policy-engine.ts` - evaluateAllowedTokens method + tokenAddress? parameter
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` - 7 ALLOWED_TOKENS policy tests

## Decisions Made
- Used `@solana-program/token` single package (includes both token instructions and ATA instructions) instead of separate packages
- Token-2022 detection by querying mint account and checking owner field programmatically
- `ATA_RENT_LAMPORTS = 2_039_280n` hardcoded constant for fee estimation
- getAssets sorting: native first, then balance descending (changed from insertion order)
- ALLOWED_TOKENS evaluation placed between WHITELIST (Step 4) and SPENDING_LIMIT (Step 5) in the evaluation chain
- `appendTransactionMessageInstruction` requires `as unknown as typeof txMessage` cast due to Solana Kit v6 `__transactionSize` brand removal on instruction append

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing getAssets test expectations for Token-2022 dual-query**
- **Found during:** Task 1 (getAssets Token-2022 expansion)
- **Issue:** Existing tests mocked `getTokenAccountsByOwner` with `mockSend` which returns same data for both SPL and Token-2022 calls, doubling results
- **Fix:** Updated 2 existing tests to use `mockReturnValueOnce` pattern for sequential calls, and fixed sort order expectations (balance descending)
- **Files modified:** `packages/adapters/solana/src/__tests__/solana-adapter.test.ts`
- **Verification:** All 23 existing adapter tests pass
- **Committed in:** `fcffd1c`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary test update due to getAssets behavior change. No scope creep.

## Issues Encountered
- Solana Kit v6 TypeScript branding (`__transactionSize`) stripped by `appendTransactionMessageInstruction`, requiring `as unknown as typeof txMessage` cast for iterative instruction appending. This is a known limitation of the Solana Kit v6 type system when not using the single-pipe pattern.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SolanaAdapter token transfer methods ready for pipeline integration (Phase 81 Stage 5)
- ALLOWED_TOKENS policy evaluation ready -- Phase 81 will wire tokenAddress from pipeline Stage 3 into evaluate()
- Solana contract call methods (buildContractCall, buildApprove) remain as stubs for Phase 79
- buildBatch and sweepAll remain as stubs for Phase 80

## Self-Check: PASSED

---
*Phase: 78-token-transfer-asset-query*
*Completed: 2026-02-12*
