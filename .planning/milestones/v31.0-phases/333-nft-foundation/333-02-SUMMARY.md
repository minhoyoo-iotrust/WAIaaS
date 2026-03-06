---
phase: 333-nft-foundation
plan: 02
subsystem: database
tags: [sqlite, drizzle, caip19, nft, migration, erc721, erc1155, metaplex]

requires:
  - phase: none
    provides: first phase of v31.0
provides:
  - DB v44 migration (nft_metadata_cache table)
  - Drizzle ORM schema for nft_metadata_cache (table 24)
  - nftAssetId() CAIP-19 helper for erc721/erc1155/metaplex namespaces
  - isNftAsset() namespace checker
affects: [334-indexer-chain-adapter, 335-nft-query-api, 336-nft-transfer-pipeline]

tech-stack:
  added: []
  patterns:
    - "NFT CAIP-19 namespaces: erc721/erc1155 (EVM address-tokenId), metaplex (Solana mintAddress)"
    - "nft_metadata_cache: TTL-based cache eviction via expires_at index"

key-files:
  created:
    - packages/core/src/__tests__/nft-caip19.test.ts
    - packages/daemon/src/__tests__/migration-v44.test.ts
  modified:
    - packages/core/src/caip/asset-helpers.ts
    - packages/core/src/caip/index.ts
    - packages/daemon/src/infrastructure/database/migrate.ts
    - packages/daemon/src/infrastructure/database/schema.ts

key-decisions:
  - "EVM NFT CAIP-19 uses address-tokenId in assetReference (hyphen separator)"
  - "Metaplex uses mint address directly (unique per NFT, no tokenId needed)"
  - "EVM addresses lowercased in CAIP-19, Solana base58 addresses preserve case"
  - "nft_metadata_cache unique on (contract_address, token_id, chain, network)"

patterns-established:
  - "nftAssetId(network, address, tokenId, standard) for NFT CAIP-19 generation"
  - "isNftAsset(caip19) checks erc721/erc1155/metaplex namespaces"

requirements-completed: [DBMG-01, DBMG-02, CAIP-01, CAIP-02, CAIP-03, CAIP-04]

duration: 10min
completed: 2026-03-06
---

# Phase 333 Plan 02: DB v44 + CAIP-19 NFT Helpers Summary

**nft_metadata_cache table (DB v44) with TTL-based eviction + nftAssetId() CAIP-19 helper for erc721/erc1155/metaplex NFT namespaces**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-06T02:05:00Z
- **Completed:** 2026-03-06T02:14:00Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- nftAssetId() generates correct CAIP-19 URIs for ERC-721, ERC-1155, and Metaplex NFTs
- DB v44 migration creates nft_metadata_cache table with unique index and TTL eviction index
- Drizzle ORM schema defined for nft_metadata_cache (24th table)
- isNftAsset() correctly identifies NFT namespaces vs fungible tokens
- 16 unit tests (9 CAIP-19 + 7 migration)

## Task Commits

1. **Task 1: nftAssetId() CAIP-19 helper + NFT namespaces** - `fc4f5e8d` (feat)
2. **Task 2: DB v44 migration (nft_metadata_cache) + Drizzle schema** - `5202e9f9` (feat)

## Files Created/Modified
- `packages/core/src/__tests__/nft-caip19.test.ts` - 9 tests for nftAssetId/isNftAsset
- `packages/core/src/caip/asset-helpers.ts` - nftAssetId() and isNftAsset() functions
- `packages/core/src/caip/index.ts` - Re-exports for nftAssetId/isNftAsset
- `packages/daemon/src/__tests__/migration-v44.test.ts` - 7 tests for v44 migration
- `packages/daemon/src/infrastructure/database/migrate.ts` - v44 migration + DDL + indexes
- `packages/daemon/src/infrastructure/database/schema.ts` - nftMetadataCache Drizzle schema

## Decisions Made
- EVM NFT CAIP-19: `eip155:1/erc721:0xaddr-tokenId` (hyphen-separated address+tokenId)
- Metaplex CAIP-19: `solana:.../metaplex:mintAddress` (each NFT is unique mint, no tokenId)
- EVM addresses lowercased per EIP-55 normalization, Solana base58 preserved

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated LATEST_SCHEMA_VERSION assertions in 10 existing migration tests**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Existing migration tests hardcoded LATEST_SCHEMA_VERSION=43 and max_version=43
- **Fix:** Updated all to 44; bumped migration-runner test versions from 44/45/46 to 45/46/47 to avoid conflict with real v44
- **Files modified:** 10 test files
- **Committed in:** 5202e9f9

---

**Total deviations:** 1 auto-fixed (version assertion updates)
**Impact on plan:** Necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- nft_metadata_cache table ready for Phase 335 (NFT Query API metadata caching)
- nftAssetId() available for Phase 334 (Indexer) and Phase 336 (Pipeline) CAIP-19 generation
- ALLOWED_TOKENS policy can match NFT CAIP-19 asset IDs

---
*Phase: 333-nft-foundation*
*Completed: 2026-03-06*
