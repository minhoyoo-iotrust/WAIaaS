---
phase: 336-nft-transfer-approval-pipeline
plan: 01
subsystem: pipeline
tags: [nft, erc721, erc1155, metaplex, smart-account, userop, pipeline]

requires:
  - phase: 333-nft-foundation
    provides: NftTransferRequestSchema 6th type, NftTokenInfoSchema, ApproveRequestSchema nft field
  - phase: 334-indexer-chain-adapter
    provides: IChainAdapter.buildNftTransferTx, IChainAdapter.transferNft, IChainAdapter.approveNft
provides:
  - NFT_TRANSFER case in buildTransactionParam, buildByType, formatNotificationAmount
  - NFT_TRANSFER case in buildUserOpCalls for Smart Account (ERC-721/ERC-1155)
  - ERC721_USEROP_ABI and ERC1155_USEROP_ABI constants for NFT calldata encoding
affects: [336-02-approval-policy, 337-interface-integration]

tech-stack:
  added: []
  patterns: [NFT_TRANSFER pipeline dispatch via adapter.buildNftTransferTx, Smart Account NFT via safeTransferFrom encoding]

key-files:
  created:
    - packages/daemon/src/__tests__/nft-pipeline.test.ts
    - packages/daemon/src/__tests__/nft-smart-account-pipeline.test.ts
  modified:
    - packages/daemon/src/pipeline/stages.ts

key-decisions:
  - "buildUserOpCalls extended with optional walletAddress param for NFT safeTransferFrom from field"
  - "METAPLEX + Smart Account throws CHAIN_ERROR (Solana not supported in ERC-4337)"

patterns-established:
  - "NFT_TRANSFER pipeline dispatch: buildTransactionParam -> buildByType -> adapter.buildNftTransferTx"
  - "Smart Account NFT: ERC-721 uses 3-param safeTransferFrom, ERC-1155 uses 5-param safeTransferFrom"

requirements-completed: [NFTT-02, NFTT-03, NFTT-04, NFTT-05, NFTT-06]

duration: 5min
completed: 2026-03-06
---

# Phase 336 Plan 01: NFT_TRANSFER Pipeline Integration Summary

**NFT_TRANSFER 6-stage pipeline dispatch with ERC-721/ERC-1155/Metaplex support and Smart Account UserOp encoding**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T02:52:11Z
- **Completed:** 2026-03-06T02:58:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- NFT_TRANSFER dispatches through all 6 pipeline stages via adapter.buildNftTransferTx
- Smart Account (ERC-4337) encodes ERC-721/ERC-1155 safeTransferFrom as UserOperation calls
- METAPLEX + Smart Account correctly throws CHAIN_ERROR
- All 36 tests pass (10 new + 26 existing regression)

## Task Commits

1. **Task 1: NFT_TRANSFER case in pipeline switch functions** - `47ff7790` (feat)
2. **Task 2: buildUserOpCalls NFT_TRANSFER for Smart Account** - `fc086000` (feat)

## Files Created/Modified
- `packages/daemon/src/pipeline/stages.ts` - Added NFT_TRANSFER case to buildTransactionParam, buildByType, formatNotificationAmount, buildUserOpCalls; ERC721/ERC1155 ABI constants
- `packages/daemon/src/__tests__/nft-pipeline.test.ts` - 6 tests for pipeline NFT_TRANSFER dispatch
- `packages/daemon/src/__tests__/nft-smart-account-pipeline.test.ts` - 4 tests for Smart Account UserOp NFT encoding

## Decisions Made
- buildUserOpCalls signature extended with optional `walletAddress` param (backward compatible) to pass smart account address as `from` in safeTransferFrom
- METAPLEX + Smart Account combination throws CHAIN_ERROR since Solana is not supported in ERC-4337

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing type errors in alchemy-nft-indexer.ts and helius-nft-indexer.ts (from Phase 334) -- out of scope, not caused by this plan's changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- NFT_TRANSFER pipeline fully integrated, ready for Plan 02 (approval routing + policy)
- buildUserOpCalls walletAddress param available for APPROVE+nft NFT approval in Plan 02

---
*Phase: 336-nft-transfer-approval-pipeline*
*Completed: 2026-03-06*
