---
phase: 79-contract-call-approve
plan: 02
subsystem: api
tags: [solana-kit, spl-approve, policy-engine, approved-spenders, approve-amount-limit, approve-tier-override]

# Dependency graph
requires:
  - phase: 77-evm-adapter
    provides: "EvmAdapter.buildApprove already implemented (EIP-1559 ERC-20 approve)"
  - phase: 78-token-transfer-asset-query
    provides: "SolanaAdapter buildTokenTransfer pipe pattern, ALLOWED_TOKENS policy evaluation"
  - phase: 79-contract-call-approve (plan 01)
    provides: "CONTRACT_WHITELIST + METHOD_WHITELIST policy evaluation, TransactionParam extensions"
provides:
  - "SolanaAdapter.buildApprove: SPL ApproveChecked with delegate + amount + decimals + token program detection"
  - "DatabasePolicyEngine evaluateApprovedSpenders: default deny for APPROVE (no policy = APPROVE_DISABLED)"
  - "DatabasePolicyEngine evaluateApproveAmountLimit: unlimited block + maxAmount cap"
  - "DatabasePolicyEngine evaluateApproveTierOverride: forced tier for APPROVE, defaults to APPROVAL, skips SPENDING_LIMIT"
affects:
  - "80 (batch operations, sweepAll)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "APPROVED_SPENDERS default deny: APPROVE without policy = denied (APPROVE_DISABLED)"
    - "APPROVE_AMOUNT_LIMIT: UNLIMITED_THRESHOLD = MAX_UINT256 / 2, default blockUnlimited=true"
    - "APPROVE_TIER_OVERRIDE: FINAL result for APPROVE type, skips SPENDING_LIMIT entirely"
    - "Three-step approve evaluation chain: spender whitelist -> amount limit -> tier override"

key-files:
  created:
    - "packages/adapters/solana/src/__tests__/solana-approve.test.ts"
  modified:
    - "packages/adapters/solana/src/adapter.ts"
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/__tests__/database-policy-engine.test.ts"

key-decisions:
  - "APPROVED_SPENDERS default deny: no policy = APPROVE_DISABLED (same pattern as CONTRACT_WHITELIST)"
  - "UNLIMITED_THRESHOLD = (2^256 - 1) / 2 -- covers both EVM MAX_UINT256 and Solana MAX_U64"
  - "APPROVE_TIER_OVERRIDE default to APPROVAL tier (Owner approval required for token approvals)"
  - "APPROVE_TIER_OVERRIDE is FINAL result, skips SPENDING_LIMIT for APPROVE transactions"
  - "Case-insensitive spender address comparison (EVM hex address compatibility)"

patterns-established:
  - "approveTx() test helper for APPROVE policy test scenarios"
  - "Three-step approve evaluation: APPROVED_SPENDERS -> APPROVE_AMOUNT_LIMIT -> APPROVE_TIER_OVERRIDE"

# Metrics
duration: 6min
completed: 2026-02-12
---

# Phase 79 Plan 02: Solana buildApprove + APPROVED_SPENDERS / APPROVE_AMOUNT_LIMIT / APPROVE_TIER_OVERRIDE Policy Summary

**SolanaAdapter.buildApprove with SPL ApproveChecked instruction, 3 new approve policy evaluations (spender whitelist, amount limit, tier override) in DatabasePolicyEngine**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-12T02:11:57Z
- **Completed:** 2026-02-12T02:18:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- SolanaAdapter.buildApprove: real SPL ApproveChecked implementation with delegate + amount + decimals, Token-2022 detection
- APPROVED_SPENDERS policy: default deny for APPROVE (no policy = APPROVE_DISABLED), case-insensitive spender matching
- APPROVE_AMOUNT_LIMIT policy: unlimited approve blocking (UNLIMITED_THRESHOLD = MAX_UINT256/2), configurable maxAmount cap
- APPROVE_TIER_OVERRIDE policy: forced tier for APPROVE transactions (defaults to APPROVAL), skips SPENDING_LIMIT
- 18 new tests across 2 test files (5 Solana approve + 13 policy engine)

## Task Commits

Each task was committed atomically:

1. **Task 1: SolanaAdapter.buildApprove with SPL ApproveChecked + tests** - `fd4f9c6` (feat)
2. **Task 2: APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT + APPROVE_TIER_OVERRIDE policy evaluation** - `60250c6` (feat)

## Files Created/Modified
- `packages/adapters/solana/src/adapter.ts` - SolanaAdapter.buildApprove real implementation (replaced stub)
- `packages/adapters/solana/src/__tests__/solana-approve.test.ts` - New test file with 5 buildApprove tests
- `packages/daemon/src/pipeline/database-policy-engine.ts` - evaluateApprovedSpenders + evaluateApproveAmountLimit + evaluateApproveTierOverride methods + TransactionParam extensions
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` - 13 new APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT + APPROVE_TIER_OVERRIDE tests

## Decisions Made
- APPROVED_SPENDERS default deny: no policy = APPROVE_DISABLED (same pattern as CONTRACT_WHITELIST for CONTRACT_CALL)
- UNLIMITED_THRESHOLD = (2^256 - 1) / 2 -- single threshold covers both EVM MAX_UINT256 and Solana MAX_U64 unlimited amounts
- APPROVE_TIER_OVERRIDE defaults to APPROVAL tier when no policy configured (Owner approval required for token approvals)
- APPROVE_TIER_OVERRIDE result is FINAL -- skips SPENDING_LIMIT entirely for APPROVE transactions (independent tier logic)
- Case-insensitive spender address comparison throughout (EVM hex address compatibility)
- Both evaluate() and evaluateAndReserve() paths updated with all 3 new approve evaluation steps (4e/4f/4g)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- buildApprove complete on both adapters (Solana: SPL ApproveChecked, EVM: already in Phase 77)
- All 8 policy types fully implemented in DatabasePolicyEngine evaluation chain
- Ready for Phase 80 (batch operations, sweepAll)
- All existing tests pass without regression (55 EVM + 55 Solana + 541 daemon = 651 total)

## Self-Check: PASSED

---
*Phase: 79-contract-call-approve*
*Completed: 2026-02-12*
