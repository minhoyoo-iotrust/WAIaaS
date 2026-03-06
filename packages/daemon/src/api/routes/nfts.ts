/**
 * NFT query routes: GET /v1/wallet/nfts, GET /v1/wallets/:id/nfts,
 * GET /v1/wallet/nfts/:tokenIdentifier, GET /v1/wallets/:id/nfts/:tokenIdentifier.
 *
 * List: paginated NFT list with optional groupBy=collection.
 * Metadata: individual NFT detail with IPFS gateway conversion + DB caching.
 *
 * sessionAuth required for /wallet/* paths (applied at server level).
 * masterAuth required for /wallets/:id/* paths (applied at server level).
 *
 * @since v31.0 Phase 335
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError, validateNetworkEnvironment } from '@waiaas/core';
import type { ChainType, NftItem, NftCollection } from '@waiaas/core';
import type { NftIndexerClient } from '../../infrastructure/nft/nft-indexer-client.js';
import type { NftMetadataCacheService } from '../../services/nft-metadata-cache.js';
import { wallets } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveWalletId } from '../helpers/resolve-wallet-id.js';
import {
  NftListResponseSchema,
  NftListGroupedResponseSchema,
  NftMetadataResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface NftRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  nftIndexerClient: NftIndexerClient;
  /** Added in Plan 335-02 for metadata caching. */
  nftMetadataCacheService?: NftMetadataCacheService;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group flat NFT items by collection address. */
function groupByCollection(items: NftItem[]): {
  collections: Array<{ collection: NftCollection; nfts: NftItem[] }>;
} {
  const grouped = new Map<string, { collection: NftCollection; nfts: NftItem[] }>();

  for (const item of items) {
    const key = item.contractAddress;
    const existing = grouped.get(key);
    if (existing) {
      existing.nfts.push(item);
      existing.collection.totalCount++;
    } else {
      grouped.set(key, {
        collection: {
          name: item.collection?.name ?? 'Unknown',
          slug: item.collection?.slug,
          contractAddress: item.contractAddress,
          totalCount: 1,
        },
        nfts: [item],
      });
    }
  }

  return { collections: Array.from(grouped.values()) };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const nftListQuerySchema = z.object({
  network: z.string().openapi({ example: 'ethereum-mainnet' }),
  pageSize: z.coerce.number().int().min(1).max(100).default(50).optional(),
  pageKey: z.string().optional(),
  groupBy: z.enum(['collection']).optional(),
  walletId: z.string().uuid().optional(),
});

const sessionNftListRoute = createRoute({
  method: 'get',
  path: '/wallet/nfts',
  tags: ['NFT'],
  summary: 'List NFTs in wallet',
  request: {
    query: nftListQuerySchema,
  },
  responses: {
    200: {
      description: 'NFT list (flat or grouped by collection)',
      content: {
        'application/json': {
          schema: z.union([NftListResponseSchema, NftListGroupedResponseSchema]),
        },
      },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED', 'INDEXER_NOT_CONFIGURED', 'WALLET_NOT_FOUND']),
  },
});

const masterNftListRoute = createRoute({
  method: 'get',
  path: '/wallets/{id}/nfts',
  tags: ['Wallets'],
  summary: 'List NFTs for a specific wallet (admin)',
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
    query: nftListQuerySchema.omit({ walletId: true }),
  },
  responses: {
    200: {
      description: 'NFT list (flat or grouped by collection)',
      content: {
        'application/json': {
          schema: z.union([NftListResponseSchema, NftListGroupedResponseSchema]),
        },
      },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED', 'INDEXER_NOT_CONFIGURED', 'WALLET_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Metadata route definitions
// ---------------------------------------------------------------------------

const nftMetadataQuerySchema = z.object({
  network: z.string().openapi({ example: 'ethereum-mainnet' }),
  walletId: z.string().uuid().optional(),
});

const sessionNftMetadataRoute = createRoute({
  method: 'get',
  path: '/wallet/nfts/{tokenIdentifier}',
  tags: ['NFT'],
  summary: 'Get NFT metadata',
  request: {
    params: z.object({
      tokenIdentifier: z.string().openapi({
        description: 'EVM: contractAddress:tokenId, Solana: mintAddress',
        example: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D:42',
      }),
    }),
    query: nftMetadataQuerySchema,
  },
  responses: {
    200: {
      description: 'NFT metadata with attributes',
      content: { 'application/json': { schema: NftMetadataResponseSchema } },
    },
    ...buildErrorResponses(['NFT_NOT_FOUND', 'INDEXER_NOT_CONFIGURED', 'WALLET_NOT_FOUND', 'NFT_METADATA_FETCH_FAILED']),
  },
});

const masterNftMetadataRoute = createRoute({
  method: 'get',
  path: '/wallets/{id}/nfts/{tokenIdentifier}',
  tags: ['Wallets'],
  summary: 'Get NFT metadata for a specific wallet (admin)',
  request: {
    params: z.object({
      id: z.string().uuid(),
      tokenIdentifier: z.string(),
    }),
    query: z.object({
      network: z.string().openapi({ example: 'ethereum-mainnet' }),
    }),
  },
  responses: {
    200: {
      description: 'NFT metadata with attributes',
      content: { 'application/json': { schema: NftMetadataResponseSchema } },
    },
    ...buildErrorResponses(['NFT_NOT_FOUND', 'INDEXER_NOT_CONFIGURED', 'WALLET_NOT_FOUND', 'NFT_METADATA_FETCH_FAILED']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create NFT route sub-router.
 *
 * Session: GET /wallet/nfts, GET /wallet/nfts/:tokenIdentifier
 * Master:  GET /wallets/:id/nfts, GET /wallets/:id/nfts/:tokenIdentifier
 */
export function nftRoutes(deps: NftRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // ---------------------------------------------------------------------------
  // GET /wallet/nfts (session list)
  // ---------------------------------------------------------------------------

  router.openapi(sessionNftListRoute, async (c) => {
    const query = c.req.valid('query');
    const walletId = resolveWalletId(c, deps.db, query.walletId);
    return handleNftList(c, deps, walletId, query);
  });

  // ---------------------------------------------------------------------------
  // GET /wallet/nfts/:tokenIdentifier (session metadata)
  // ---------------------------------------------------------------------------

  router.openapi(sessionNftMetadataRoute, async (c) => {
    const { tokenIdentifier } = c.req.valid('param');
    const query = c.req.valid('query');
    const walletId = resolveWalletId(c, deps.db, query.walletId);
    return handleNftMetadata(c, deps, walletId, tokenIdentifier, query.network);
  });

  // ---------------------------------------------------------------------------
  // GET /wallets/:id/nfts (master list)
  // ---------------------------------------------------------------------------

  router.openapi(masterNftListRoute, async (c) => {
    const { id: walletId } = c.req.valid('param');
    const query = c.req.valid('query');
    return handleNftList(c, deps, walletId, query);
  });

  // ---------------------------------------------------------------------------
  // GET /wallets/:id/nfts/:tokenIdentifier (master metadata)
  // ---------------------------------------------------------------------------

  router.openapi(masterNftMetadataRoute, async (c) => {
    const { id: walletId, tokenIdentifier } = c.req.valid('param');
    const query = c.req.valid('query');
    return handleNftMetadata(c, deps, walletId, tokenIdentifier, query.network);
  });

  return router;
}

// ---------------------------------------------------------------------------
// Shared handler logic
// ---------------------------------------------------------------------------

async function handleNftList(
  c: any,
  deps: NftRouteDeps,
  walletId: string,
  query: { network: string; pageSize?: number; pageKey?: string; groupBy?: 'collection' },
) {
  // Look up wallet from DB
  const wallet = deps.db.select().from(wallets).where(eq(wallets.id, walletId)).get();
  if (!wallet) {
    throw new WAIaaSError('WALLET_NOT_FOUND', { message: `Wallet '${walletId}' not found` });
  }

  const chain = wallet.chain as ChainType;
  const environment = wallet.environment as 'mainnet' | 'testnet';
  const { network, pageSize = 50, pageKey, groupBy } = query;

  // Validate network matches wallet's environment
  validateNetworkEnvironment(chain, environment, network as any);

  // Fetch NFT list from indexer
  const result = await deps.nftIndexerClient.listNfts(chain, {
    owner: wallet.publicKey,
    network,
    pageSize,
    pageKey,
  });

  // Group by collection if requested
  if (groupBy === 'collection') {
    const grouped = groupByCollection(result.items);
    return c.json({ ...grouped, pageKey: result.pageKey }, 200);
  }

  return c.json(
    {
      items: result.items,
      pageKey: result.pageKey,
      totalCount: result.totalCount,
    },
    200,
  );
}

// ---------------------------------------------------------------------------
// Shared metadata handler
// ---------------------------------------------------------------------------

/**
 * Parse tokenIdentifier into contractAddress + tokenId.
 *
 * EVM format: contractAddress:tokenId (e.g., 0xBC4CA...:42)
 * Solana format: mintAddress (no colon, used as both contract and tokenId)
 */
function parseTokenIdentifier(
  tokenIdentifier: string,
  chain: ChainType,
): { contractAddress: string; tokenId: string } {
  if (chain === 'solana' || !tokenIdentifier.includes(':')) {
    // Solana Metaplex: mint address is both contract and token ID
    return { contractAddress: tokenIdentifier, tokenId: tokenIdentifier };
  }

  // EVM: contractAddress:tokenId
  const colonIndex = tokenIdentifier.lastIndexOf(':');
  return {
    contractAddress: tokenIdentifier.slice(0, colonIndex),
    tokenId: tokenIdentifier.slice(colonIndex + 1),
  };
}

async function handleNftMetadata(
  c: any,
  deps: NftRouteDeps,
  walletId: string,
  tokenIdentifier: string,
  network: string,
) {
  // Look up wallet from DB
  const wallet = deps.db.select().from(wallets).where(eq(wallets.id, walletId)).get();
  if (!wallet) {
    throw new WAIaaSError('WALLET_NOT_FOUND', { message: `Wallet '${walletId}' not found` });
  }

  const chain = wallet.chain as ChainType;
  const environment = wallet.environment as 'mainnet' | 'testnet';

  // Validate network matches wallet's environment
  validateNetworkEnvironment(chain, environment, network as any);

  // Parse token identifier
  const { contractAddress, tokenId } = parseTokenIdentifier(tokenIdentifier, chain);

  // Fetch metadata via cache service (if available) or directly via indexer
  let metadata;
  if (deps.nftMetadataCacheService) {
    metadata = await deps.nftMetadataCacheService.getMetadata(chain, network, contractAddress, tokenId);
  } else {
    metadata = await deps.nftIndexerClient.getNftMetadata(chain, network, contractAddress, tokenId);
  }

  return c.json(metadata, 200);
}
