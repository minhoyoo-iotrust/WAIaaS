---
phase: 334-indexer-chain-adapter
plan: 03
subsystem: infra
tags: [nft, chain-adapter, evm, solana, erc-721, erc-1155, metaplex, erc-165, abi]

requires:
  - phase: 333-nft-foundation
    provides: NftStandard enum, NftTokenInfoSchema
provides:
  - IChainAdapter extended with 3 NFT methods (25 total)
  - NftTransferParams and NftApproveParams types
  - EvmAdapter NFT implementation (ERC-721/ERC-1155 safeTransferFrom, approve, setApprovalForAll)
  - SolanaAdapter NFT implementation (SPL transferChecked, delegate for Metaplex)
  - ERC-165 supportsInterface auto-detection of NFT standard
  - ERC-721, ERC-1155, ERC-165 ABI files
affects: [336, 337]

tech-stack:
  added: []
  patterns: [ERC-165 interface detection, NFT transfer via SPL token (decimals=0)]

key-files:
  created:
    - packages/adapters/evm/src/abi/erc721.ts
    - packages/adapters/evm/src/abi/erc1155.ts
    - packages/adapters/evm/src/abi/erc165.ts
    - packages/adapters/evm/src/__tests__/nft-adapter.test.ts
    - packages/adapters/solana/src/__tests__/nft-adapter.test.ts
    - packages/core/src/__tests__/nft-chain-adapter-types.test.ts
  modified:
    - packages/core/src/interfaces/IChainAdapter.ts
    - packages/core/src/interfaces/chain-adapter.types.ts
    - packages/core/src/interfaces/index.ts
    - packages/core/src/index.ts
    - packages/adapters/evm/src/adapter.ts
    - packages/adapters/solana/src/adapter.ts

key-decisions:
  - "ERC-1155 single token approval is not supported (throws UNSUPPORTED_NFT_STANDARD)"
  - "Solana collection-wide approval not supported (no setApprovalForAll equivalent)"
  - "Metaplex NFT transfer reuses SPL token transfer with decimals=0"
  - "ERC-165 supportsInterface used for auto-detection via detectNftStandard public method"

patterns-established:
  - "NFT transfer follows same pattern as token transfer: build -> sign -> submit"
  - "Gas safety margin (120n/100n) applied to all EVM NFT transactions"

requirements-completed: [CHADP-01, CHADP-02, CHADP-03, CHADP-04]

duration: 6min
completed: 2026-03-06
---

# Phase 334 Plan 03: IChainAdapter NFT Methods + EVM/Solana Implementation Summary

**IChainAdapter extended to 25 methods with ERC-721/ERC-1155 safeTransferFrom, ERC-165 standard detection, and Metaplex SPL transfer**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T02:28:00Z
- **Completed:** 2026-03-06T02:34:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Extended IChainAdapter with buildNftTransferTx, transferNft, approveNft (25 methods total)
- Defined NftTransferParams and NftApproveParams types
- EvmAdapter: ERC-721 safeTransferFrom(from,to,tokenId), ERC-1155 safeTransferFrom(from,to,id,amount,data)
- EvmAdapter: approve (single tokenId) and setApprovalForAll (collection-wide)
- EvmAdapter: ERC-165 supportsInterface detection of NFT standard
- SolanaAdapter: SPL transferChecked for Metaplex (decimals=0, amount=1)
- SolanaAdapter: SPL delegate for Metaplex approval
- Created 3 ABI files (ERC-721, ERC-1155, ERC-165)

## Task Commits

1. **Task 1: IChainAdapter NFT types + EVM ABI files** - `4f299760` (feat)
2. **Task 2: EvmAdapter + SolanaAdapter NFT implementations** - `c3bd5d13` (feat)

## Files Created/Modified
- `packages/core/src/interfaces/chain-adapter.types.ts` - NftTransferParams, NftApproveParams
- `packages/core/src/interfaces/IChainAdapter.ts` - 3 new NFT methods (25 total)
- `packages/adapters/evm/src/abi/erc721.ts` - ERC-721 ABI (safeTransferFrom, approve, setApprovalForAll, getApproved, ownerOf)
- `packages/adapters/evm/src/abi/erc1155.ts` - ERC-1155 ABI (safeTransferFrom, setApprovalForAll, isApprovedForAll, balanceOf)
- `packages/adapters/evm/src/abi/erc165.ts` - ERC-165 ABI + ERC_INTERFACE_IDS constants
- `packages/adapters/evm/src/adapter.ts` - NFT method implementations + detectNftStandard
- `packages/adapters/solana/src/adapter.ts` - Metaplex NFT transfer and approve implementations
- `packages/adapters/evm/src/__tests__/nft-adapter.test.ts` - 8 EVM NFT tests
- `packages/adapters/solana/src/__tests__/nft-adapter.test.ts` - 4 Solana NFT tests
- `packages/core/src/__tests__/nft-chain-adapter-types.test.ts` - 3 type tests

## Decisions Made
- ERC-1155 does not support single token approval (only setApprovalForAll)
- Solana rejects collection-wide approval (no equivalent)
- detectNftStandard is a public method on EvmAdapter for direct use

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Solana tests initially used invalid base58 addresses, fixed by using real Solana system program addresses

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chain adapter NFT methods ready for pipeline integration (Phase 336)
- buildNftTransferTx output compatible with existing sign/submit flow

---
*Phase: 334-indexer-chain-adapter*
*Completed: 2026-03-06*
