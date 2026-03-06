---
phase: 335-nft-query-api
plan: "01"
subsystem: daemon/api
tags: [nft, rest-api, pagination, collection-grouping]
dependency_graph:
  requires: [NftIndexerClient, INftIndexer, NftItemSchema, resolveWalletId]
  provides: [nftRoutes, NftRouteDeps, NftListResponseSchema, NftListGroupedResponseSchema, NftMetadataResponseSchema]
  affects: [openapi-schemas.ts, routes/index.ts]
tech_stack:
  added: []
  patterns: [createRoute+OpenAPIHono, cursor-pagination, collection-grouping]
key_files:
  created:
    - packages/daemon/src/api/routes/nfts.ts
    - packages/daemon/src/__tests__/nft-routes-list.test.ts
  modified:
    - packages/daemon/src/api/routes/openapi-schemas.ts
    - packages/daemon/src/api/routes/index.ts
    - packages/daemon/src/infrastructure/nft/alchemy-nft-indexer.ts
    - packages/daemon/src/infrastructure/nft/helius-nft-indexer.ts
decisions:
  - NFT list and metadata routes share NftRouteDeps with nftIndexerClient
  - groupBy=collection groups in-memory by contractAddress after fetching from indexer
  - OpenAPI schemas redefined with @hono/zod-openapi z (not imported from core)
metrics:
  duration: 6 min
  completed: "2026-03-06"
---

# Phase 335 Plan 01: NFT list REST routes Summary

NFT list endpoints with cursor pagination, collection grouping, session+master auth patterns, and OpenAPI schemas.

## What Was Done

### Task 1: NFT list REST routes (TDD)

**RED:** Created 7 failing tests covering session/master NFT list, pagination, groupBy, required network, and INDEXER_NOT_CONFIGURED error.

**GREEN:** Implemented:
- `nfts.ts` route file with `NftRouteDeps` interface and `nftRoutes()` factory
- Session route: `GET /v1/wallet/nfts` with resolveWalletId for session access
- Master route: `GET /v1/wallets/{id}/nfts` with direct wallet lookup
- Shared `handleNftList()` function for both paths
- `groupByCollection()` helper for in-memory collection grouping
- OpenAPI schemas: `NftListResponseSchema`, `NftListGroupedResponseSchema`, `NftMetadataResponseSchema`
- Barrel export in `routes/index.ts`

**Commit:** e6c4ff88

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed type errors in Alchemy/Helius NFT indexer implementations**
- **Found during:** Task 1 typecheck verification
- **Issue:** `_fetch()` and `_rpc()` return `Record<string, unknown>`, causing type errors when accessing response properties
- **Fix:** Added typed response interfaces (`AlchemyListResponse`, `AlchemyMetadataResponse`, `AlchemyCollectionResponse`), cast results, used `typeof` narrowing for metadata properties
- **Files modified:** alchemy-nft-indexer.ts, helius-nft-indexer.ts
- **Commit:** bae11a2a

**2. [Rule 1 - Bug] OpenAPI schema import approach changed**
- **Issue:** `NftItemSchema.openapi()` fails because core schemas use plain `zod`, not `@hono/zod-openapi`
- **Fix:** Redefined NFT OpenAPI schemas inline using `@hono/zod-openapi`'s `z` instead of importing from core

## Verification

- All 7 tests pass: `pnpm vitest run packages/daemon/src/__tests__/nft-routes-list.test.ts`
- Typecheck passes: `pnpm turbo run typecheck --filter=@waiaas/daemon`
- Route exports `nftRoutes` and `NftRouteDeps` from barrel
