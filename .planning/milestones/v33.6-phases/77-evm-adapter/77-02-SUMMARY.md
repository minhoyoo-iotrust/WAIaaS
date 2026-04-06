---
phase: 77-evm-adapter
plan: 02
subsystem: chain-adapter
tags: [viem, evm, ethereum, erc20, eip1559, gas-estimation, nonce, approve, multicall]

# Dependency graph
requires:
  - phase: 77-evm-adapter
    plan: 01
    provides: EvmAdapter skeleton with 6 real + 14 stubs, ERC20_ABI, viem 2.x
  - phase: 76-infra-pipeline-foundation
    provides: IChainAdapter 20-method interface, ChainError 25 codes
provides:
  - "EvmAdapter 17/20 methods with real viem implementations"
  - "EIP-1559 buildTransaction with nonce, gas 1.2x margin, memo as hex data"
  - "signTransaction via privateKeyToAccount + account.signTransaction"
  - "estimateFee with 1.2x gas safety margin for native + ERC-20 transfers"
  - "getTokenInfo via viem multicall for ERC-20 decimals/symbol/name"
  - "buildApprove for ERC-20 approve calldata"
  - "ChainError mapping for INSUFFICIENT_BALANCE, NONCE_TOO_LOW, RPC errors"
  - "34 comprehensive unit tests with viem mocking"
affects: [Phase 78 token transfer pipeline, Phase 79 contract/approve pipeline, Phase 80 sweepAll, Phase 81 Stage 5 integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [EIP-1559 tx build/serialize/sign/submit, viem multicall for ERC-20 metadata, ChainError mapping from viem error messages, gas safety margin 1.2x]

key-files:
  created: []
  modified:
    - packages/adapters/evm/src/adapter.ts
    - packages/adapters/evm/src/__tests__/evm-adapter.test.ts

key-decisions:
  - "Gas safety margin: (estimatedGas * 120n) / 100n for all gas estimates (buildTransaction, estimateFee, buildApprove)"
  - "ChainError mapping via error message pattern matching (viem does not always throw typed errors)"
  - "mapError private helper centralizes error mapping: INSUFFICIENT_BALANCE, NONCE_TOO_LOW, RPC_CONNECTION_ERROR, RPC_TIMEOUT"
  - "EVM chainId defaults to 1 (mainnet) when client.chain is undefined"
  - "getAssets returns native ETH only (Phase 78 will add ERC-20 via ALLOWED_TOKENS multicall)"
  - "getTokenInfo uses multicall with defaults (18 decimals, empty strings) for partial failures"
  - "buildApprove includes tokenAddress, spender, approveAmount in tx metadata for audit"

patterns-established:
  - "EIP-1559 tx pattern: getTransactionCount + estimateFeesPerGas + estimateGas -> serializeTransaction"
  - "Sign pattern: privateKeyToAccount -> parseTransaction -> account.signTransaction -> hexToBytes"
  - "Submit pattern: toHex(signedTx) -> client.sendRawTransaction"
  - "Error mapping: catch viem errors -> inspect message -> ChainError or WAIaaSError"
  - "Test mock pattern: vi.mock('viem') with mockClient object for all PublicClient methods"

# Metrics
duration: 6min
completed: 2026-02-12
---

# Phase 77 Plan 02: EVM Adapter Implementation Summary

**EvmAdapter 17/20 real methods -- EIP-1559 build/simulate/sign/submit pipeline, 1.2x gas margin, viem multicall ERC-20 metadata, approve calldata, ChainError mapping, 34 tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-11T18:15:26Z
- **Completed:** 2026-02-11T18:21:29Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Implemented 11 new methods in EvmAdapter with real viem RPC calls (buildTransaction, simulateTransaction, signTransaction, submitTransaction, waitForConfirmation, estimateFee, getTransactionFee, getAssets, getTokenInfo, buildApprove, mapError helper)
- EIP-1559 transaction build pipeline: nonce + estimateFeesPerGas + estimateGas with 1.2x safety margin -> serializeTransaction
- ChainError mapping from viem error messages: INSUFFICIENT_BALANCE, NONCE_TOO_LOW, NONCE_ALREADY_USED, RPC_CONNECTION_ERROR, RPC_TIMEOUT
- 34 comprehensive unit tests with vi.mock('viem') covering all implemented methods

## Task Commits

Each task was committed atomically:

1. **Task 1: EVM native transfer pipeline + estimateFee + nonce + getTransactionFee** - `847f4f4` (feat)
2. **Task 2: EvmAdapter comprehensive tests with viem mock** - `66b3c8f` (test)

## Files Created/Modified
- `packages/adapters/evm/src/adapter.ts` - EvmAdapter with 17/20 real implementations (11 new + 6 from Plan 01)
- `packages/adapters/evm/src/__tests__/evm-adapter.test.ts` - 34 tests (21 new + 13 from Plan 01)

## Decisions Made
- Gas safety margin uses `(estimatedGas * 120n) / 100n` bigint arithmetic consistently across buildTransaction, estimateFee, and buildApprove.
- ChainError mapping is centralized in a private `mapError()` helper that inspects error message strings. Viem does not always throw typed errors, so pattern matching on lowercased messages is the reliable approach.
- EVM chainId defaults to 1 (mainnet) when `client.chain` is undefined (e.g., when Chain config is not provided to constructor).
- getAssets returns only native ETH balance. ERC-20 token expansion is explicitly deferred to Phase 78 where ALLOWED_TOKENS policy integration provides the token list for multicall.
- getTokenInfo uses viem multicall to batch decimals/symbol/name in a single RPC call. Partial failures return defaults (18 decimals, empty strings) rather than throwing.
- buildApprove stores tokenAddress, spender, and approveAmount in transaction metadata for downstream audit logging.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict null checks in test file**
- **Found during:** Task 2 (Build verification)
- **Issue:** TypeScript `strictNullChecks` flagged `mock.calls[0][0]` and `assets[0]` as possibly undefined, and ApproveParams does not have `to` field
- **Fix:** Added non-null assertions (`!`), type annotations on mock call args, removed extraneous `to` field from test data
- **Files modified:** packages/adapters/evm/src/__tests__/evm-adapter.test.ts
- **Verification:** `pnpm --filter @waiaas/adapter-evm build` passes, all 34 tests pass
- **Committed in:** 66b3c8f (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial TS strict mode fixes. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EvmAdapter has 17/20 methods with real implementations, ready for downstream integration
- 3 remaining stubs: buildTokenTransfer (Phase 78), buildContractCall (Phase 79), sweepAll (Phase 80)
- EIP-1559 transaction pattern established for reuse in buildTokenTransfer and buildContractCall
- ChainError mapping pattern ready for extension with new error patterns
- Test mock pattern (vi.mock + mockClient) established for extending tests in Phase 78+

---
*Phase: 77-evm-adapter*
*Completed: 2026-02-12*

## Self-Check: PASSED
