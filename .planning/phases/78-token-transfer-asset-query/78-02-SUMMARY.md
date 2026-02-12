---
phase: 78-token-transfer-asset-query
plan: 02
subsystem: chain-adapter
tags: [evm, erc-20, token-transfer, multicall, getAssets, viem]

# Dependency graph
requires:
  - phase: 77-evm-adapter
    provides: EvmAdapter 17-method implementation with viem mocking pattern, ERC20_ABI, ChainError mapping
  - phase: 78-01
    provides: SolanaAdapter token transfer pattern, ALLOWED_TOKENS policy evaluation
provides:
  - EvmAdapter buildTokenTransfer real implementation (EIP-1559 + ERC-20 transfer calldata)
  - EvmAdapter getAssets ERC-20 multicall expansion via setAllowedTokens()
  - 16 new tests for token transfer and getAssets multicall
affects:
  - Phase 79 (contract call) uses same EIP-1559 calldata pattern for buildContractCall
  - Phase 81 (pipeline integration) wires daemon ALLOWED_TOKENS policy into setAllowedTokens() before getAssets()

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "encodeFunctionData with ERC20_ABI for ERC-20 transfer calldata"
    - "client.multicall for batched ERC-20 balanceOf queries (single RPC call)"
    - "setAllowedTokens() adapter-level config for ERC-20 query list (no IChainAdapter interface change)"

key-files:
  created:
    - "packages/adapters/evm/src/__tests__/evm-token-transfer.test.ts"
  modified:
    - "packages/adapters/evm/src/adapter.ts"
    - "packages/adapters/evm/src/__tests__/evm-adapter.test.ts"

key-decisions:
  - "setAllowedTokens() approach keeps IChainAdapter interface unchanged (adapter-level config, not interface method)"
  - "getAssets sorts: native first, then tokens by balance descending, alphabetical tie-break"
  - "Zero-balance tokens filtered from getAssets results (only positive balances returned)"
  - "Failed multicall results silently skipped (token contract may not exist or may revert)"
  - "buildTokenTransfer metadata includes tokenAddress/recipient/tokenAmount for audit trail"
  - "Both tasks committed as single atomic commit due to noUnusedLocals TypeScript strictness requiring getAssets to reference _allowedTokens"

patterns-established:
  - "ERC-20 token transfer: encode transfer calldata -> tx target is token contract, value=0n -> 1.2x gas margin"
  - "ERC-20 balance query: setAllowedTokens -> multicall balanceOf -> filter zero/failed -> sort by balance"

# Metrics
duration: 5min
completed: 2026-02-12
---

# Phase 78 Plan 02: EVM ERC-20 Token Transfer + getAssets Multicall Summary

**EvmAdapter buildTokenTransfer with ERC-20 transfer calldata + getAssets ERC-20 multicall expansion via setAllowedTokens() using viem encodeFunctionData and client.multicall**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-12T00:17:37Z
- **Completed:** 2026-02-12T00:22:48Z
- **Tasks:** 2 (committed as 1 atomic unit)
- **Files modified:** 3

## Accomplishments
- EvmAdapter buildTokenTransfer: EIP-1559 transaction with ERC-20 transfer(address,uint256) calldata via encodeFunctionData
- Transaction targets token contract address (not recipient), value=0n, 1.2x gas safety margin
- Metadata includes tokenAddress, recipient, tokenAmount for audit trail
- EvmAdapter getAssets expanded to query ERC-20 balances via multicall when allowedTokens configured
- setAllowedTokens() allows daemon to configure token list without changing IChainAdapter interface
- Zero balances filtered, failed multicall results silently skipped
- Sorting: native first, then tokens by balance descending with alphabetical tie-break
- 16 new tests (9 buildTokenTransfer + 7 getAssets multicall)
- Updated existing stub test: buildTokenTransfer replaced with buildContractCall stub test

## Task Commits

Each task was committed atomically:

1. **Task 1+2: buildTokenTransfer ERC-20 + getAssets multicall expansion** - `a1b0e80` (feat)

## Files Created/Modified
- `packages/adapters/evm/src/adapter.ts` - buildTokenTransfer real implementation, getAssets ERC-20 multicall, setAllowedTokens(), _allowedTokens field
- `packages/adapters/evm/src/__tests__/evm-token-transfer.test.ts` - 16 tests for token transfer and getAssets multicall
- `packages/adapters/evm/src/__tests__/evm-adapter.test.ts` - Updated stub test (buildTokenTransfer -> buildContractCall)

## Decisions Made
- `setAllowedTokens()` approach chosen over modifying `getAssets(address, tokens?)` signature -- keeps IChainAdapter interface unchanged
- getAssets sorting: native first, tokens by balance descending, alphabetical symbol tie-break for equal balances
- Zero-balance tokens excluded from results (only positive balances returned)
- Failed multicall results silently skipped (graceful handling for missing/broken token contracts)
- buildTokenTransfer metadata includes tokenAddress/recipient/tokenAmount for comprehensive audit trail
- Single commit for both tasks due to TypeScript noUnusedLocals strictness

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Combined Task 1 and Task 2 into single commit**
- **Found during:** Task 1 (buildTokenTransfer implementation)
- **Issue:** TypeScript `noUnusedLocals` strict mode requires `_allowedTokens` field to be referenced. Adding the field for Task 2's `setAllowedTokens()` without implementing the getAssets expansion causes build failure.
- **Fix:** Implemented both buildTokenTransfer and getAssets expansion together, committed as single atomic unit.
- **Files modified:** `packages/adapters/evm/src/adapter.ts`
- **Commit:** `a1b0e80`

**2. [Rule 1 - Bug] Updated existing buildTokenTransfer stub test**
- **Found during:** Task 1
- **Issue:** Existing test expected buildTokenTransfer to throw "Not implemented", but we replaced the stub with real implementation.
- **Fix:** Replaced test with buildContractCall stub test (which still throws "Not implemented").
- **Files modified:** `packages/adapters/evm/src/__tests__/evm-adapter.test.ts`
- **Commit:** `a1b0e80`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** No scope creep. Both tasks fully completed.

## Issues Encountered
- None beyond the TypeScript strictness requiring combined implementation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EvmAdapter buildTokenTransfer ready for pipeline integration (Phase 81 Stage 5)
- EvmAdapter getAssets + setAllowedTokens ready -- Phase 81 will wire ALLOWED_TOKENS policy from DB into setAllowedTokens() before getAssets()
- buildContractCall remains as stub for Phase 79
- sweepAll remains as stub for Phase 80

## Self-Check: PASSED
