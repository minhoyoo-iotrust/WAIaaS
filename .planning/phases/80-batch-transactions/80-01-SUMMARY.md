---
phase: 80-batch-transactions
plan: 01
subsystem: chain-adapter, policy-engine
tags: [solana, batch, ata, spending-limit, policy, tdd]

# Dependency graph
requires:
  - phase: 76-solana-token-transfer
    provides: "buildTokenTransfer, Token-2022 detection, ATA auto-creation pattern"
  - phase: 77-evm-adapter
    provides: "buildBatch BATCH_NOT_SUPPORTED stub on EVM"
  - phase: 78-solana-contract-call
    provides: "buildContractCall, AccountRole mapping pattern"
  - phase: 79-approve-management
    provides: "buildApprove, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT, APPROVE_TIER_OVERRIDE policies"
provides:
  - "SolanaAdapter.buildBatch: 2-20 InstructionRequest to single atomic Solana tx"
  - "DatabasePolicyEngine.evaluateBatch: 2-stage policy (Phase A individual + Phase B aggregate)"
  - "ChainErrorCode: BATCH_NOT_SUPPORTED + BATCH_SIZE_EXCEEDED (27 codes total)"
affects:
  - "Phase 81 pipeline integration: evaluateBatch called in Stage 3, buildBatch in Stage 5"
  - "Phase 81 Stage 6: parent-child INSERT using metadata.instructionCount/instructionTypes"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "convertBatchInstruction: per-instruction conversion dispatcher"
    - "classifyInstruction: field-based union type discrimination"
    - "evaluateInstructionPolicies: per-instruction Phase A policy evaluation"
    - "2-stage batch policy: Phase A individual deny + Phase B aggregate tier"

key-files:
  created:
    - "packages/adapters/solana/src/__tests__/solana-batch.test.ts"
  modified:
    - "packages/adapters/solana/src/adapter.ts"
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/__tests__/database-policy-engine.test.ts"
    - "packages/core/src/errors/chain-error.ts"
    - "packages/core/src/__tests__/chain-error.test.ts"

key-decisions:
  - "BATCH_NOT_SUPPORTED + BATCH_SIZE_EXCEEDED added to ChainErrorCode (27 total, PERMANENT 19)"
  - "classifyInstruction uses field-based discrimination (spender->APPROVE, token->TOKEN_TRANSFER, programId->CONTRACT_CALL, else->TRANSFER)"
  - "Phase B aggregate counts TRANSFER.amount only (TOKEN_TRANSFER/APPROVE/CONTRACT_CALL = 0 native amount)"
  - "APPROVE in batch triggers max(amount tier, APPROVE_TIER_OVERRIDE tier) -- default APPROVAL"
  - "evaluateBatch violations include index + type + reason for each denied instruction"

patterns-established:
  - "Batch instruction classification: field presence discriminator (no `type` field on union)"
  - "2-stage batch policy: Phase A per-instruction -> Phase B aggregate + tier override"
  - "All-or-Nothing batch denial: single violation rejects entire batch"

# Metrics
duration: 18min
completed: 2026-02-12
---

# Phase 80 Plan 01: SolanaAdapter.buildBatch + evaluateBatch Summary

**SolanaAdapter.buildBatch assembles 2-20 mixed instructions into atomic Solana tx with ATA auto-creation; DatabasePolicyEngine.evaluateBatch performs 2-stage All-or-Nothing policy evaluation with aggregate SPENDING_LIMIT**

## Performance

- **Duration:** 18 min
- **Started:** 2026-02-12T02:51:55Z
- **Completed:** 2026-02-12T03:09:37Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- SolanaAdapter.buildBatch replaces Phase 80 stub: converts 2-20 InstructionRequest items (TRANSFER + TOKEN_TRANSFER + CONTRACT_CALL + APPROVE) into a single atomic Solana v0 transaction
- TOKEN_TRANSFER in batch auto-creates destination ATA via createAssociatedTokenIdempotent instruction when needed
- DatabasePolicyEngine.evaluateBatch: Phase A evaluates each instruction against its type-specific policies (WHITELIST, ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT) with All-or-Nothing denial
- Phase B sums TRANSFER amounts for aggregate SPENDING_LIMIT tier, then resolves max(amount tier, APPROVE_TIER_OVERRIDE) when APPROVE present
- 19 new TDD tests (9 buildBatch + 10 evaluateBatch), all 1095 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: SolanaAdapter.buildBatch implementation + tests (TDD)** - `36bbde0` (feat)
2. **Task 2: DatabasePolicyEngine.evaluateBatch 2-stage policy + tests (TDD)** - `26ceda9` (feat)
3. **Fix: chain-error test counts for 27 error codes** - `cb8e6f3` (fix)

## Files Created/Modified
- `packages/adapters/solana/src/adapter.ts` - buildBatch + convertBatchInstruction + classifyInstruction
- `packages/adapters/solana/src/__tests__/solana-batch.test.ts` - 9 TDD tests for buildBatch
- `packages/daemon/src/pipeline/database-policy-engine.ts` - evaluateBatch + evaluateInstructionPolicies
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` - 10 TDD tests for evaluateBatch
- `packages/core/src/errors/chain-error.ts` - Added BATCH_NOT_SUPPORTED + BATCH_SIZE_EXCEEDED to ChainErrorCode
- `packages/core/src/__tests__/chain-error.test.ts` - Updated code count assertions (25->27)

## Decisions Made
- **BATCH_NOT_SUPPORTED + BATCH_SIZE_EXCEEDED added to ChainErrorCode**: These were in error-codes.ts (HTTP level) but not in ChainErrorCode (chain adapter level). Added to enable proper chain-level error handling in buildBatch.
- **classifyInstruction field-based discrimination**: BatchParams.instructions are union types without a `type` discriminator. Detection order: spender->APPROVE, token->TOKEN_TRANSFER, programId->CONTRACT_CALL, else->TRANSFER.
- **Phase B aggregate counts TRANSFER.amount only**: TOKEN_TRANSFER/APPROVE have no native token amount. Solana has no native value attachment in CPI (unlike EVM).
- **APPROVE in batch triggers max(amount tier, approve tier)**: Prevents APPROVE from being hidden in a low-amount batch to bypass tier escalation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added BATCH_NOT_SUPPORTED + BATCH_SIZE_EXCEEDED to ChainErrorCode**
- **Found during:** Task 1 (buildBatch implementation)
- **Issue:** `BATCH_SIZE_EXCEEDED` error code existed in error-codes.ts (HTTP-level) but not in ChainErrorCode type, causing TS compile error
- **Fix:** Added both BATCH_NOT_SUPPORTED and BATCH_SIZE_EXCEEDED to ChainErrorCode union type and CHAIN_ERROR_CATEGORIES record (PERMANENT category)
- **Files modified:** packages/core/src/errors/chain-error.ts
- **Verification:** Build passes, no type errors
- **Committed in:** 36bbde0 (Task 1 commit)

**2. [Rule 1 - Bug] Updated chain-error test assertions for 27 error codes**
- **Found during:** Verification (full test suite)
- **Issue:** chain-error.test.ts asserted exactly 25 error codes, but 2 new codes added (27 total)
- **Fix:** Updated PERMANENT_CODES array and count assertions (25->27, PERMANENT 17->19)
- **Files modified:** packages/core/src/__tests__/chain-error.test.ts
- **Verification:** All chain-error tests pass
- **Committed in:** cb8e6f3 (separate fix commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for type correctness and test accuracy. No scope creep.

## Issues Encountered
None -- plan executed cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- buildBatch returns metadata.instructionCount/instructionTypes/ataCreations for Phase 81 pipeline integration
- evaluateBatch ready to be called from Stage 3 of the 6-stage pipeline in Phase 81
- DB transactions table already has parentId/batchIndex columns (Phase 48) -- Phase 81 wires Stage 6 INSERT
- EVM adapter.buildBatch still throws BATCH_NOT_SUPPORTED (no change, verified by existing test)

## Self-Check: PASSED

---
*Phase: 80-batch-transactions*
*Completed: 2026-02-12*
