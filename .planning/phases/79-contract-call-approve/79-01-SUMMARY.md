---
phase: 79-contract-call-approve
plan: 01
subsystem: api
tags: [viem, solana-kit, contract-call, policy-engine, whitelist, eip-1559, AccountRole]

# Dependency graph
requires:
  - phase: 77-evm-adapter
    provides: "EvmAdapter scaffold with buildTransaction/buildApprove EIP-1559 pipeline"
  - phase: 78-token-transfer-asset-query
    provides: "SolanaAdapter buildTokenTransfer pipe pattern, ALLOWED_TOKENS policy evaluation"
provides:
  - "EvmAdapter.buildContractCall: EIP-1559 tx with calldata + 1.2x gas margin + selector/contractAddress metadata"
  - "SolanaAdapter.buildContractCall: programId + AccountRole mapping + base64/Uint8Array instructionData"
  - "DatabasePolicyEngine evaluateContractWhitelist: default deny for CONTRACT_CALL (no policy = CONTRACT_CALL_DISABLED)"
  - "DatabasePolicyEngine evaluateMethodWhitelist: optional method-level restriction for CONTRACT_CALL"
affects:
  - "79-02 (buildApprove + APPROVED_SPENDERS policy)"
  - "80 (batch operations, sweepAll)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CONTRACT_WHITELIST default deny: CONTRACT_CALL without policy = denied"
    - "METHOD_WHITELIST optional: no policy = no method restriction"
    - "AccountRole enum mapping for Solana instruction accounts"
    - "base64/Uint8Array dual handling for instructionData from REST API vs programmatic calls"

key-files:
  created:
    - "packages/adapters/solana/src/__tests__/solana-contract-call.test.ts"
  modified:
    - "packages/adapters/evm/src/adapter.ts"
    - "packages/adapters/evm/src/__tests__/evm-adapter.test.ts"
    - "packages/adapters/solana/src/adapter.ts"
    - "packages/daemon/src/pipeline/database-policy-engine.ts"
    - "packages/daemon/src/__tests__/database-policy-engine.test.ts"

key-decisions:
  - "EVM calldata validation: require 0x prefix + at least 8 hex chars (4-byte selector) -- throws INVALID_INSTRUCTION"
  - "Solana instructionData dual handling: Uint8Array pass-through or base64 string decode from REST API"
  - "CONTRACT_WHITELIST uses contractAddress field (or toAddress fallback) for contract identification"
  - "METHOD_WHITELIST is optional: no policy = all methods allowed on whitelisted contracts"
  - "Case-insensitive comparison for addresses and selectors (EVM hex compatibility)"

patterns-established:
  - "contractCallTx() test helper for CONTRACT_CALL policy test scenarios"
  - "AccountRole mapping: isSigner/isWritable bitmask -> WRITABLE_SIGNER/READONLY_SIGNER/WRITABLE/READONLY"

# Metrics
duration: 7min
completed: 2026-02-12
---

# Phase 79 Plan 01: Contract Call + Contract Whitelist Policy Summary

**buildContractCall on EVM (EIP-1559 calldata) and Solana (programId + AccountRole), CONTRACT_WHITELIST default deny + METHOD_WHITELIST optional method restriction in DatabasePolicyEngine**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-12T02:02:41Z
- **Completed:** 2026-02-12T02:09:34Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- EvmAdapter.buildContractCall: full EIP-1559 pipeline with calldata validation, 1.2x gas margin, selector/contractAddress metadata
- SolanaAdapter.buildContractCall: programId + AccountRole mapping + pipe pattern + base64/Uint8Array dual handling
- CONTRACT_WHITELIST policy: default deny (no policy = CONTRACT_CALL_DISABLED), opt-in whitelist with case-insensitive matching
- METHOD_WHITELIST policy: optional method-level restriction with per-contract selector lists
- 19 new tests across 3 test files (5 EVM + 6 Solana + 8 policy engine)

## Task Commits

Each task was committed atomically:

1. **Task 1: buildContractCall on EVM + Solana adapters + adapter tests** - `25fc0d3` (feat)
2. **Task 2: CONTRACT_WHITELIST + METHOD_WHITELIST policy evaluation** - `dba3dec` (feat)

## Files Created/Modified
- `packages/adapters/evm/src/adapter.ts` - EvmAdapter.buildContractCall real implementation (replaced stub)
- `packages/adapters/evm/src/__tests__/evm-adapter.test.ts` - 5 new buildContractCall tests
- `packages/adapters/solana/src/adapter.ts` - SolanaAdapter.buildContractCall real implementation (replaced stub) + AccountRole import
- `packages/adapters/solana/src/__tests__/solana-contract-call.test.ts` - New test file with 6 tests
- `packages/daemon/src/pipeline/database-policy-engine.ts` - evaluateContractWhitelist + evaluateMethodWhitelist methods + TransactionParam extensions
- `packages/daemon/src/__tests__/database-policy-engine.test.ts` - 8 new CONTRACT_WHITELIST + METHOD_WHITELIST tests

## Decisions Made
- EVM calldata validation requires 0x prefix + at least 8 hex chars (4-byte selector minimum) -- throws ChainError INVALID_INSTRUCTION
- Solana instructionData handled as Uint8Array (programmatic) or base64 string (REST API) with instanceof check
- CONTRACT_WHITELIST uses transaction.contractAddress with transaction.toAddress as fallback for address lookup
- METHOD_WHITELIST is optional -- no policy means all methods allowed on whitelisted contracts; no entry for a specific contract means no restriction for that contract
- Case-insensitive comparison for both addresses and selectors throughout (EVM hex address compatibility)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- buildContractCall complete on both adapters, ready for Phase 79-02 (buildApprove + APPROVED_SPENDERS)
- CONTRACT_WHITELIST + METHOD_WHITELIST evaluation paths in place for both evaluate() and evaluateAndReserve()
- All existing tests pass without regression (55 EVM + 50 Solana + 528 daemon = 633 total)

## Self-Check: PASSED

---
*Phase: 79-contract-call-approve*
*Completed: 2026-02-12*
