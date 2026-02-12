---
phase: 77-evm-adapter
plan: 01
subsystem: chain-adapter
tags: [viem, evm, ethereum, erc20, IChainAdapter]

# Dependency graph
requires:
  - phase: 76-infra-pipeline-foundation
    provides: IChainAdapter 20-method interface + chain-adapter.types.ts
provides:
  - "@waiaas/adapter-evm package scaffolded with viem 2.x"
  - "EvmAdapter class implementing IChainAdapter 20-method contract"
  - "ERC20_ABI constant with 8 standard ERC-20 function signatures"
  - "13 unit tests covering interface compliance, connection, stubs"
affects: [77-02 native transfer + gas + nonce + ERC-20, Phase 78 token ops, Phase 79 contract ops]

# Tech tracking
tech-stack:
  added: [viem 2.x]
  patterns: [EvmAdapter mirrors SolanaAdapter structure, createPublicClient for RPC]

key-files:
  created:
    - packages/adapters/evm/package.json
    - packages/adapters/evm/tsconfig.json
    - packages/adapters/evm/vitest.config.ts
    - packages/adapters/evm/src/index.ts
    - packages/adapters/evm/src/adapter.ts
    - packages/adapters/evm/src/abi/erc20.ts
    - packages/adapters/evm/src/__tests__/evm-adapter.test.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "Removed _rpcUrl field from EvmAdapter (noUnusedLocals strict mode) -- can be re-added when needed"
  - "ERC20_ABI uses `as const` for viem type inference on abi parameters"
  - "6 real implementations (connect/disconnect/isConnected/getHealth/getBalance/getCurrentNonce) + 14 stubs"
  - "buildBatch throws WAIaaSError BATCH_NOT_SUPPORTED (EVM has no native atomic batch)"

patterns-established:
  - "EvmAdapter pattern: createPublicClient + http transport + optional Chain config"
  - "EVM address cast: `addr as \\`0x${string}\\`` for viem type safety"
  - "Stub methods throw Error('Not implemented: {method} will be implemented in Phase XX')"

# Metrics
duration: 4min
completed: 2026-02-12
---

# Phase 77 Plan 01: EVM Adapter Scaffolding Summary

**@waiaas/adapter-evm package with viem 2.x, IChainAdapter 20-method skeleton (6 real + 14 stubs), ERC20_ABI, 13 unit tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-11T18:08:51Z
- **Completed:** 2026-02-11T18:12:15Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- @waiaas/adapter-evm package scaffolded in monorepo with viem ^2.21.0 dependency
- EvmAdapter implements all 20 IChainAdapter methods (6 real RPC implementations + 14 stubs for future phases)
- ERC20_ABI constant with 8 standard functions (transfer, approve, balanceOf, allowance, decimals, symbol, name, totalSupply)
- 13 unit tests covering interface compliance, connection state, stub errors, BATCH_NOT_SUPPORTED

## Task Commits

Each task was committed atomically:

1. **Task 1: @waiaas/adapter-evm scaffolding + ERC20 ABI + EvmAdapter 20-method skeleton** - `e928b8b` (feat)
2. **Task 2: EvmAdapter basic method tests + getCurrentNonce test** - `3cc194e` (test)

## Files Created/Modified
- `packages/adapters/evm/package.json` - Package manifest with viem 2.x dependency
- `packages/adapters/evm/tsconfig.json` - TypeScript config extending monorepo base
- `packages/adapters/evm/vitest.config.ts` - Vitest config with globals + passWithNoTests
- `packages/adapters/evm/src/adapter.ts` - EvmAdapter class implementing IChainAdapter (6 real + 14 stubs)
- `packages/adapters/evm/src/abi/erc20.ts` - ERC-20 standard ABI constant (8 functions)
- `packages/adapters/evm/src/index.ts` - Barrel export (EvmAdapter + ERC20_ABI)
- `packages/adapters/evm/src/__tests__/evm-adapter.test.ts` - 13 unit tests
- `pnpm-lock.yaml` - Updated with viem 2.x dependencies

## Decisions Made
- Removed `_rpcUrl` private field from EvmAdapter to satisfy TypeScript `noUnusedLocals` strict mode. Field was stored but never read in the current skeleton. Can be re-added when connect metadata is needed.
- ERC20_ABI uses `as const` assertion to enable viem's type-level ABI inference for contract read/write operations.
- 6 methods have real viem RPC implementations (connect, disconnect, isConnected, getHealth, getBalance, getCurrentNonce). 14 remaining are stubs for Phase 77-02 and later.
- buildBatch throws WAIaaSError with code BATCH_NOT_SUPPORTED since EVM does not support native atomic batch transactions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `_rpcUrl` field causing TS6133 build error**
- **Found during:** Task 1 (Build verification)
- **Issue:** `_rpcUrl` was declared but never read, violating `noUnusedLocals: true` in tsconfig.base.json
- **Fix:** Removed `_rpcUrl` field and related assignments in connect/disconnect
- **Files modified:** packages/adapters/evm/src/adapter.ts
- **Verification:** `pnpm turbo build` passes (8/8 packages)
- **Committed in:** e928b8b (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial field removal for strict TS compliance. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- EvmAdapter skeleton ready for Plan 77-02 to implement native transfer + gas estimation + nonce management + ERC-20/approve
- 14 stub methods marked with target Phase references for implementation tracking
- ERC20_ABI ready for viem contract read/write operations in Plan 77-02
- viem PublicClient pattern established for extending with WalletClient in signing phase

---
*Phase: 77-evm-adapter*
*Completed: 2026-02-12*

## Self-Check: PASSED
