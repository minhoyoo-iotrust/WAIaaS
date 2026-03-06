---
phase: 335-nft-query-api
plan: "02"
subsystem: daemon/services, daemon/api
tags: [nft, metadata, ipfs, arweave, caching, db-cache]
dependency_graph:
  requires: [NftIndexerClient, nft_metadata_cache table, NftMetadataSchema, nftRoutes]
  provides: [NftMetadataCacheService, metadata GET endpoint]
  affects: [nfts.ts, openapi-schemas.ts]
tech_stack:
  added: []
  patterns: [db-cache-with-ttl, ipfs-gateway-conversion, tokenIdentifier-parsing]
key_files:
  created:
    - packages/daemon/src/services/nft-metadata-cache.ts
    - packages/daemon/src/__tests__/nft-metadata-cache.test.ts
    - packages/daemon/src/__tests__/nft-routes-metadata.test.ts
  modified:
    - packages/daemon/src/api/routes/nfts.ts
decisions:
  - NftMetadataCacheService is optional dep in NftRouteDeps (graceful degradation)
  - tokenIdentifier uses lastIndexOf colon for EVM (supports checksum addresses)
  - Solana treats entire identifier as both contractAddress and tokenId
  - IPFS double-prefix edge case handled (ipfs://ipfs/QmXxx)
metrics:
  duration: 5 min
  completed: "2026-03-06"
---

# Phase 335 Plan 02: NFT metadata query Summary

NftMetadataCacheService with 24h DB caching, IPFS/Arweave gateway URL conversion, and individual NFT metadata REST endpoint.

## What Was Done

### Task 1: NftMetadataCacheService (TDD)

**RED:** 7 failing tests for cache hit/miss/expired, IPFS/Arweave conversion, attributes preservation, clearExpired.

**GREEN:** Implemented `NftMetadataCacheService`:
- `getMetadata()`: check nft_metadata_cache -> if valid return parsed JSON; if miss/expired -> fetch from indexer -> convert URLs -> upsert cache with 24h TTL
- `convertIpfsUrls()`: ipfs:// -> https://ipfs.io/ipfs/, ar:// -> https://arweave.net/
- `clearExpired()`: DELETE WHERE expiresAt < now
- Uses drizzle upsert with onConflictDoUpdate on unique (contractAddress, tokenId, chain, network)

**Commit:** 72214799

### Task 2: NFT metadata endpoint (TDD)

**RED:** 6 failing tests for metadata response, EVM/Solana tokenIdentifier parsing, IPFS conversion, NFT_NOT_FOUND error.

**GREEN:** Added to `nfts.ts`:
- Session: `GET /v1/wallet/nfts/{tokenIdentifier}?network=`
- Master: `GET /v1/wallets/{id}/nfts/{tokenIdentifier}?network=`
- `parseTokenIdentifier()`: colon-split for EVM, direct use for Solana
- `handleNftMetadata()`: wallet lookup -> network validation -> cache service -> JSON response
- Updated `NftRouteDeps` with optional `nftMetadataCacheService`

**Commit:** d4bc0d9a

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- All 20 tests pass: `pnpm vitest run packages/daemon/src/__tests__/nft-metadata-cache.test.ts packages/daemon/src/__tests__/nft-routes-metadata.test.ts packages/daemon/src/__tests__/nft-routes-list.test.ts`
- Typecheck passes for all Phase 335 files (pre-existing errors in nft-approvals.ts from Phase 336 are out of scope)
- NftMetadataCacheService exports correctly
