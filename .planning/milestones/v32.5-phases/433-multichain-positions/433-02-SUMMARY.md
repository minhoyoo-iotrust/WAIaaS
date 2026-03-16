---
phase: 433-multichain-positions
plan: 02
subsystem: actions/aave-v3
tags: [multichain, positions, aave, promise-allsettled]
dependency_graph:
  requires: [PositionQueryContext, AAVE_V3_ADDRESSES]
  provides: [multichain-aave-positions, raw-fetch-rpc-pattern]
  affects: [position-tracker, admin-defi-dashboard]
tech_stack:
  added: []
  patterns: [raw-fetch-rpc-call, Promise.allSettled-per-network]
key_files:
  created: []
  modified:
    - packages/actions/src/providers/aave-v3/index.ts
    - packages/actions/src/__tests__/aave-v3-positions.test.ts
decisions:
  - "getPositions uses raw fetch with ctx.rpcUrls instead of this.rpcCaller"
  - "ILendingProvider methods (getPosition, getHealthFactor) keep using this.rpcCaller"
  - "Testnet returns [] since AAVE_V3_ADDRESSES has no testnet entries"
metrics:
  duration: 6min
  completed: 2026-03-16
---

# Phase 433 Plan 02: Aave V3 Multi-network getPositions + Promise.allSettled Summary

Aave V3 getPositions queries supply/borrow positions across 5 EVM mainnet networks via Promise.allSettled with raw fetch RPC, keeping ILendingProvider methods unchanged.

## Changes

### index.ts
- Refactored `getPositions()` to filter ctx.networks by AAVE_V3_ADDRESSES
- Added `queryNetworkAavePositions()` per-network query method
- Added `rpcCall()` raw JSON-RPC eth_call helper via fetch
- Per-network CAIP-19 assetIds using `eip155:{chainId}`

### aave-v3-positions.test.ts
- Migrated all 12 existing tests from IRpcCaller mock to fetch mock
- Added 5 multichain tests: 2-network query, RPC failure resilience, unsupported network filtering, testnet empty, network field correctness

## Deviations from Plan

None - plan executed exactly as written.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Aave V3 multinetwork getPositions | 46e06333 | index.ts, aave-v3-positions.test.ts |
