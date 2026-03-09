---
phase: 363-onchain-e2e-scenarios
plan: "02"
subsystem: e2e-tests
tags: [e2e, onchain, incoming-tx, staking, hyperliquid]
dependency_graph:
  requires: [363-01]
  provides: [incoming-e2e, staking-e2e, hyperliquid-e2e]
  affects: []
tech_stack:
  added: []
  patterns: [graceful-skip-on-4xx, conditional-test-chaining, ApiDirectResult-validation]
key_files:
  created:
    - packages/e2e-tests/src/scenarios/onchain-incoming.ts
    - packages/e2e-tests/src/__tests__/onchain-incoming.e2e.test.ts
    - packages/e2e-tests/src/scenarios/onchain-staking.ts
    - packages/e2e-tests/src/__tests__/onchain-staking.e2e.test.ts
    - packages/e2e-tests/src/scenarios/onchain-hyperliquid.ts
    - packages/e2e-tests/src/__tests__/onchain-hyperliquid.e2e.test.ts
  modified: []
decisions:
  - Incoming TX detection uses graceful return (not assert failure) when monitor not subscribed
  - Lido unstake depends on stake success via shared stakeSucceeded flag
  - Hyperliquid tests gated by WAIAAS_E2E_HYPERLIQUID_ENABLED env (default skip)
metrics:
  duration: 3min
  completed: "2026-03-09"
---

# Phase 363 Plan 02: Incoming TX + Lido Staking + Hyperliquid E2E Summary

Incoming TX detection with IncomingTxMonitor fallback, Lido stake/unstake with conditional chaining, and Hyperliquid Spot/Perp via ApiDirectResult pattern with env gate.

## What was done

### Task 1: Incoming TX detection E2E
- Registered `incoming-tx-detection` scenario (Sepolia)
- Self-transfer ETH, poll confirmation, check `/v1/wallet/incoming` for txHash
- Graceful skip if monitor not subscribed (#164 known issue)

### Task 2: Lido Staking + Hyperliquid E2E
- Registered `lido-stake`, `lido-unstake` scenarios (Holesky)
- Stake 0.001 ETH, poll tx status; unstake only runs if stake succeeded
- Registered `hyperliquid-spot-order`, `hyperliquid-perp-order` scenarios
- Hyperliquid gated by `WAIAAS_E2E_HYPERLIQUID_ENABLED=true`
- ApiDirectResult pattern validation (no pipeline txId)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | a920a1bf | Incoming TX detection E2E |
| 2 | 7006d9ee | Lido staking + Hyperliquid E2E |

## Deviations from Plan

None - plan executed exactly as written.
