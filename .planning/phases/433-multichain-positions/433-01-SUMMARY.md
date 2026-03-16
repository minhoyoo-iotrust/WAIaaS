---
phase: 433-multichain-positions
plan: 01
subsystem: actions/lido-staking
tags: [multichain, positions, lido, promise-allsettled]
dependency_graph:
  requires: [PositionQueryContext]
  provides: [LIDO_NETWORK_CONFIG, LIDO_TESTNET_NETWORK_CONFIG, multichain-lido-positions]
  affects: [position-tracker, admin-defi-dashboard]
tech_stack:
  added: []
  patterns: [Promise.allSettled-per-network, per-network-contract-config]
key_files:
  created: []
  modified:
    - packages/actions/src/providers/lido-staking/lido-contract.ts
    - packages/actions/src/providers/lido-staking/index.ts
    - packages/actions/src/__tests__/lido-staking.test.ts
decisions:
  - "LIDO_NETWORK_CONFIG uses Record<string, LidoNetworkContracts> for O(1) lookup"
  - "stethAddress empty string for L2 networks (wstETH only)"
  - "stEthPerToken fallback to 1:1 for L2 wstETH contracts"
  - "Removed this.rpcUrl field -- getPositions uses ctx.rpcUrls exclusively"
metrics:
  duration: 8min
  completed: 2026-03-16
---

# Phase 433 Plan 01: Lido Multichain Contract Mapping + 5-Network Parallel Positions Summary

Lido getPositions queries stETH/wstETH balances across 5 EVM mainnet networks via Promise.allSettled, with per-network CAIP-19 assetIds and testnet Holesky support.

## Changes

### lido-contract.ts
- Added `LidoNetworkContracts` interface and `LIDO_NETWORK_CONFIG` (5 mainnet: Ethereum, Base, Arbitrum, Optimism, Polygon)
- Added `LIDO_TESTNET_NETWORK_CONFIG` (Holesky mapped to ethereum-sepolia)
- stethAddress empty string for L2 networks (only wstETH bridged)

### index.ts
- Refactored `getPositions()` to iterate ctx.networks filtered by config map
- Added `queryNetworkPositions()` private method per network
- Added `ethCallUint256WithRpc()` accepting rpcUrl parameter
- Removed `this.rpcUrl` field (ctx.rpcUrls replaces it)

### lido-staking.test.ts
- 5 new multichain tests: 2-network query, RPC failure resilience, testnet Holesky, unsupported network filtering, network field correctness
- Updated existing makeCtx to include rpcUrls

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused this.rpcUrl field**
- **Found during:** Typecheck
- **Issue:** `this.rpcUrl` was unused after refactoring to ctx.rpcUrls
- **Fix:** Removed field declaration from class
- **Commit:** 1af4f586

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Lido multichain contract mapping + getPositions | 7d362189 | lido-contract.ts, index.ts, lido-staking.test.ts |
