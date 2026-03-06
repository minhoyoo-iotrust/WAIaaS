---
phase: 334-indexer-chain-adapter
plan: 02
subsystem: infra
tags: [nft, indexer, helius, solana, metaplex, retry, cache, settings]

requires:
  - phase: 334-indexer-chain-adapter
    provides: INftIndexer interface, AlchemyNftIndexer
provides:
  - HeliusNftIndexer for Solana Metaplex NFT queries via Helius DAS API
  - NftIndexerClient with retry, caching, and settings integration
  - NFT indexer API key settings (actions.alchemy_nft_api_key, actions.helius_das_api_key)
affects: [335, 337]

tech-stack:
  added: []
  patterns: [Helius DAS JSON-RPC, exponential backoff retry, in-memory cache with TTL]

key-files:
  created:
    - packages/daemon/src/infrastructure/nft/helius-nft-indexer.ts
    - packages/daemon/src/infrastructure/nft/nft-indexer-client.ts
    - packages/daemon/src/__tests__/helius-nft-indexer.test.ts
    - packages/daemon/src/__tests__/nft-indexer-client.test.ts
  modified:
    - packages/daemon/src/infrastructure/nft/index.ts
    - packages/daemon/src/infrastructure/settings/setting-keys.ts

key-decisions:
  - "Helius DAS uses JSON-RPC POST format (getAssetsByOwner, getAsset, getAssetsByGroup)"
  - "NftIndexerClient caches listNfts and getNftsByCollection but NOT getNftMetadata (DB cache in Phase 335)"
  - "Retry: max 3 attempts, exponential backoff 1s/2s/4s, Retry-After header respected"

patterns-established:
  - "NftIndexerClient: chain-based indexer resolution (solana->Helius, ethereum->Alchemy)"
  - "Settings-backed API key retrieval with INDEXER_NOT_CONFIGURED error on missing key"

requirements-completed: [INDX-03, INDX-04, INDX-05, INDX-06, INDX-07]

duration: 5min
completed: 2026-03-06
---

# Phase 334 Plan 02: HeliusNftIndexer + NftIndexerClient Summary

**Helius DAS API Solana indexer with NftIndexerClient providing retry, caching, and encrypted API key settings**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T02:35:00Z
- **Completed:** 2026-03-06T02:40:00Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments
- Implemented HeliusNftIndexer for Solana Metaplex NFT queries via JSON-RPC
- Created NftIndexerClient with chain-based indexer resolution, exponential backoff retry, and in-memory caching
- Registered 3 new settings keys (alchemy_nft_api_key, helius_das_api_key, nft_indexer_cache_ttl_sec)
- API keys stored as encrypted credentials (isCredential: true)

## Task Commits

1. **Task 1: HeliusNftIndexer + NftIndexerClient + settings** - `e062b933` (feat)

## Files Created/Modified
- `packages/daemon/src/infrastructure/nft/helius-nft-indexer.ts` - Helius DAS API implementation
- `packages/daemon/src/infrastructure/nft/nft-indexer-client.ts` - Unified indexer client with retry/cache
- `packages/daemon/src/infrastructure/settings/setting-keys.ts` - 3 new NFT indexer settings
- `packages/daemon/src/__tests__/helius-nft-indexer.test.ts` - 7 Helius tests
- `packages/daemon/src/__tests__/nft-indexer-client.test.ts` - 10 NftIndexerClient tests

## Decisions Made
- Helius DAS uses page-based pagination (encoded as cursor string)
- getNftMetadata not cached in NftIndexerClient (DB cache in Phase 335)
- Retry only on INDEXER_API_ERROR with retryable HTTP status codes (429, 500, 502, 503)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - API keys are configured via Admin Settings UI (Phase 337).

## Next Phase Readiness
- NftIndexerClient ready for REST API integration (Phase 335)
- Settings keys ready for Admin UI indexer configuration (Phase 337)

---
*Phase: 334-indexer-chain-adapter*
*Completed: 2026-03-06*
