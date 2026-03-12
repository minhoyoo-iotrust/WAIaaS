---
phase: 393-staking-positions
plan: 01
subsystem: actions/lido-staking
tags: [position-provider, staking, lido, stETH, wstETH]
dependency_graph:
  requires: [IPositionProvider, formatCaip19, contract-encoding]
  provides: [LidoStakingActionProvider.getPositions, lido ABI helpers]
  affects: [PositionTracker STAKING sync]
tech_stack:
  added: []
  patterns: [duck-type IPositionProvider, raw fetch eth_call, bigint wei formatting]
key_files:
  created: []
  modified:
    - packages/actions/src/providers/lido-staking/lido-contract.ts
    - packages/actions/src/providers/lido-staking/index.ts
    - packages/actions/src/providers/lido-staking/config.ts
    - packages/actions/src/__tests__/lido-staking.test.ts
decisions:
  - D1: Use raw fetch() for eth_call (no viem dependency, consistent with other providers)
  - D2: Duck-type IPositionProvider (no formal implements, per D5 project decision)
  - D3: wstETH underlyingAmount calculated via stEthPerToken on-chain call
metrics:
  duration: ~3 min
  completed: 2026-03-12
---

# Phase 393 Plan 01: Lido IPositionProvider Summary

Lido stETH/wstETH STAKING position provider with on-chain balance queries and stEthPerToken exchange rate conversion.

## What Was Done

### Task 1: ABI Encoding Helpers
- Added `encodeBalanceOfCalldata()` (selector 0x70a08231 + padded address)
- Added `encodeStEthPerTokenCalldata()` (selector 0x035faf82)
- Added `decodeUint256Result()` (hex -> bigint)
- Added WSTETH_MAINNET and WSTETH_HOLESKY contract address constants
- Commit: 47ee89c4

### Task 2: IPositionProvider Implementation + Tests
- Added `getPositions(walletId)` to LidoStakingActionProvider
  - Reads stETH balanceOf via eth_call
  - Reads wstETH balanceOf via eth_call
  - Reads stEthPerToken exchange rate for wstETH -> stETH conversion
  - Returns CAIP-19 assetId formatted positions
  - wstETH metadata includes underlyingAmount (stETH equivalent)
- Added `getProviderName()` returns 'lido_staking'
- Added `getSupportedCategories()` returns ['STAKING']
- Added rpcUrl config field for EVM RPC endpoint
- 12 new tests (5 encoding + 7 position provider) all passing
- Commit: 29d42b2e

## Verification Results
- All 24 tests pass (12 existing + 12 new)
- TypeScript: no errors
- ESLint: 0 errors (34 pre-existing warnings)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
- All 4 key files found
- Both commits verified (47ee89c4, 29d42b2e)
