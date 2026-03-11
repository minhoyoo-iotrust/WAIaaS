---
phase: 372-마켓-조회-포지션-정산
plan: "02"
title: "PolymarketCtfProvider"
one_liner: "5 on-chain CTF actions (split/merge/redeem/approve) with ABI encoding and neg risk routing"
subsystem: polymarket
tags: [ctf, on-chain, conditional-tokens, neg-risk, viem-abi]
dependency_graph:
  requires: [PM_CONTRACTS, NegRiskRouter, PolymarketApproveHelper, ChainError]
  provides: [PolymarketCtfProvider, PmRedeemSchema, PmSplitSchema, PmMergeSchema, PmApproveCollateralSchema, PmApproveCtfSchema]
  affects: [infrastructure.ts (factory creates ctfProvider)]
tech_stack:
  added: []
  patterns: [viem encodeFunctionData, parseAbi human-readable, ContractCallRequest pipeline]
key_files:
  created:
    - packages/actions/src/providers/polymarket/ctf-schemas.ts
    - packages/actions/src/providers/polymarket/ctf-provider.ts
    - packages/actions/src/providers/polymarket/__tests__/ctf-provider.test.ts
  modified:
    - packages/actions/src/providers/polymarket/index.ts
    - packages/actions/src/providers/polymarket/infrastructure.ts
decisions:
  - "PARENT_COLLECTION_ID is bytes32 zero (root collection) for all Polymarket CTF operations"
  - "Approve collateral encodes ERC-20 approve() as CONTRACT_CALL (not APPROVE pipeline type) for consistency"
metrics:
  duration: ~5min
  completed: 2026-03-11
---

# Phase 372 Plan 02: PolymarketCtfProvider Summary

5 on-chain CTF actions (split/merge/redeem/approve) with ABI encoding and neg risk routing.

## What Was Built

### 1. CTF Zod Input Schemas (ctf-schemas.ts)
- `PmRedeemSchema`: conditionId, indexSets (default [1,2]), isNegRisk
- `PmSplitSchema`: conditionId, amount (human readable), partition
- `PmMergeSchema`: conditionId, amount, partition
- `PmApproveCollateralSchema`: isNegRisk, optional amount
- `PmApproveCtfSchema`: isNegRisk

### 2. PolymarketCtfProvider (ctf-provider.ts)
- `metadata.requiresSigningKey = false` (standard on-chain pipeline)
- 5 actions:
  - `pm_redeem_positions`: Binary -> CONDITIONAL_TOKENS, Neg Risk -> NEG_RISK_ADAPTER
  - `pm_split_position`: USDC -> outcome tokens via CONDITIONAL_TOKENS
  - `pm_merge_positions`: outcome tokens -> USDC via CONDITIONAL_TOKENS
  - `pm_approve_collateral`: ERC-20 approve to correct Exchange
  - `pm_approve_ctf`: ERC-1155 setApprovalForAll to correct Exchange
- All ABI encoding via viem `encodeFunctionData` with `parseAbi`
- `getSpendingAmount`: split returns USDC amount (6 decimals), others return 0

### 3. Infrastructure Factory Update
- ctfProvider added to PolymarketInfrastructure interface
- Factory creates stateless CtfProvider instance

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| ctf-provider.test.ts | 15 | PASS |
| **Total** | **15** | **PASS** |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 1c620e3a | CTF schemas + CtfProvider with 5 actions |
| 2 | eca8b382 | Wire into index exports and factory |

## Deviations from Plan

None - plan executed exactly as written.
