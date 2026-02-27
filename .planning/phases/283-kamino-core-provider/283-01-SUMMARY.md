---
plan: 283-01
status: complete
started: 2026-02-28T02:00:00Z
completed: 2026-02-28T02:02:00Z
---

## Summary

Created the foundational KaminoLendingProvider scaffold with all 4 files in `packages/actions/src/providers/kamino/`.

## What Was Built

- **config.ts**: KaminoConfig type, KAMINO_PROGRAM_ID, KAMINO_MAIN_MARKET, KAMINO_DEFAULTS, resolveMarketAddress helper
- **schemas.ts**: 4 Zod SSoT input schemas (KaminoSupplyInputSchema, KaminoBorrowInputSchema, KaminoRepayInputSchema, KaminoWithdrawInputSchema) with 'max' support for repay/withdraw
- **kamino-sdk-wrapper.ts**: IKaminoSdkWrapper interface (6 methods), MockKaminoSdkWrapper (deterministic test data), KaminoSdkWrapper (real SDK stub with graceful fallback)
- **index.ts**: KaminoLendingProvider implementing ILendingProvider + IPositionProvider with 4 actions (supply/borrow/repay/withdraw), resolve() dispatching, HF safety checks, parseTokenAmount, instructionsToRequests converter, query method stubs

## Commits

1. `feat(283-01): add Kamino K-Lend provider scaffold with SDK wrapper`

## Key Decisions

- Used 'mainnet' (not 'solana-mainnet') for network field to match NetworkTypeEnum
- Default 6 decimals for SPL token amount parsing (USDC standard)
- MockKaminoSdkWrapper uses action index prefix byte for recognizable test data
- Real KaminoSdkWrapper uses INVALID_INSTRUCTION error code (PROVIDER_NOT_CONFIGURED doesn't exist)

## Key Files

### key-files.created
- packages/actions/src/providers/kamino/config.ts
- packages/actions/src/providers/kamino/schemas.ts
- packages/actions/src/providers/kamino/kamino-sdk-wrapper.ts
- packages/actions/src/providers/kamino/index.ts

## Self-Check: PASSED
