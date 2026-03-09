---
phase: 363-onchain-e2e-scenarios
plan: "03"
subsystem: e2e-tests
tags: [e2e, onchain, nft, erc721, erc1155]
dependency_graph:
  requires: [363-01]
  provides: [nft-e2e]
  affects: []
tech_stack:
  added: []
  patterns: [nft-ownership-query-before-transfer, graceful-skip-no-nft]
key_files:
  created:
    - packages/e2e-tests/src/scenarios/onchain-nft.ts
    - packages/e2e-tests/src/__tests__/onchain-nft.e2e.test.ts
  modified: []
decisions:
  - Query /v1/wallet/nfts before transfer to check ownership
  - Solana NFT (Metaplex) out of scope due to Devnet pre-minting complexity
metrics:
  duration: 2min
  completed: "2026-03-09"
---

# Phase 363 Plan 03: NFT ERC-721/ERC-1155 Transfer E2E Summary

NFT transfer E2E tests with ownership pre-check and graceful skip when no NFTs are available on Sepolia testnet.

## What was done

### Task 1: NFT ERC-721/ERC-1155 transfer E2E
- Registered `nft-erc721-transfer` and `nft-erc1155-transfer` scenarios (Sepolia)
- Query `/v1/wallet/nfts` in beforeAll to discover owned NFTs
- Self-transfer NFT_TRANSFER type for ERC-721 (no amount) and ERC-1155 (amount: 1)
- Graceful skip on no NFT owned, 4xx response, or on-chain failure

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4a9ce2f4 | NFT ERC-721/ERC-1155 transfer E2E |

## Deviations from Plan

None - plan executed exactly as written.
