/**
 * Wallet query routes: GET /v1/wallet/address, GET /v1/wallet/balance,
 * GET /v1/wallet/assets.
 *
 * v1.2: Protected by sessionAuth middleware (Authorization: Bearer wai_sess_<token>),
 *       applied at server level in createApp().
 * Wallet identification via JWT payload walletId (set by sessionAuth on context).
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { ChainType, NetworkType } from '@waiaas/core';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import { wallets } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import {
  WalletAddressResponseSchema,
  WalletBalanceResponseSchema,
  WalletAssetsResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

export interface WalletRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapterPool: AdapterPool | null;
  config: DaemonConfig | null;
}

/**
 * Resolve wallet by ID from database. Throws 404 if not found.
 */
async function resolveWalletById(
  db: BetterSQLite3Database<typeof schema>,
  walletId: string,
) {
  const wallet = await db.select().from(wallets).where(eq(wallets.id, walletId)).get();

  if (!wallet) {
    throw new WAIaaSError('WALLET_NOT_FOUND', {
      message: `Wallet '${walletId}' not found`,
    });
  }

  return wallet;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const walletAddressRoute = createRoute({
  method: 'get',
  path: '/wallet/address',
  tags: ['Wallet'],
  summary: 'Get wallet address',
  responses: {
    200: {
      description: 'Wallet address',
      content: { 'application/json': { schema: WalletAddressResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const walletBalanceRoute = createRoute({
  method: 'get',
  path: '/wallet/balance',
  tags: ['Wallet'],
  summary: 'Get wallet balance',
  responses: {
    200: {
      description: 'Wallet balance',
      content: { 'application/json': { schema: WalletBalanceResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'CHAIN_ERROR']),
  },
});

const walletAssetsRoute = createRoute({
  method: 'get',
  path: '/wallet/assets',
  tags: ['Wallet'],
  summary: 'Get wallet assets',
  responses: {
    200: {
      description: 'All assets (native + tokens) held by wallet',
      content: { 'application/json': { schema: WalletAssetsResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'CHAIN_ERROR']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create wallet route sub-router.
 *
 * GET /wallet/address -> returns wallet's public key
 * GET /wallet/balance -> calls adapter.getBalance() and returns lamports
 * GET /wallet/assets  -> calls adapter.getAssets() and returns all token balances
 */
export function walletRoutes(deps: WalletRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(walletAddressRoute, async (c) => {
    // Get walletId from sessionAuth context (set by middleware at server level)
    const walletId = c.get('walletId' as never) as string;
    const wallet = await resolveWalletById(deps.db, walletId);

    return c.json(
      {
        walletId: wallet.id,
        chain: wallet.chain,
        network: wallet.network,
        address: wallet.publicKey,
      },
      200,
    );
  });

  router.openapi(walletBalanceRoute, async (c) => {
    const walletId = c.get('walletId' as never) as string;
    const wallet = await resolveWalletById(deps.db, walletId);

    if (!deps.adapterPool || !deps.config) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: 'Chain adapter not available',
      });
    }

    const rpcUrl = resolveRpcUrl(
      deps.config.rpc as unknown as Record<string, string>,
      wallet.chain,
      wallet.network,
    );
    const adapter = await deps.adapterPool.resolve(
      wallet.chain as ChainType,
      wallet.network as NetworkType,
      rpcUrl,
    );

    const balanceInfo = await adapter.getBalance(wallet.publicKey);

    return c.json(
      {
        walletId: wallet.id,
        chain: wallet.chain,
        network: wallet.network,
        address: wallet.publicKey,
        balance: balanceInfo.balance.toString(),
        decimals: balanceInfo.decimals,
        symbol: balanceInfo.symbol,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /wallet/assets
  // ---------------------------------------------------------------------------

  router.openapi(walletAssetsRoute, async (c) => {
    const walletId = c.get('walletId' as never) as string;
    const wallet = await resolveWalletById(deps.db, walletId);

    if (!deps.adapterPool || !deps.config) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: 'Chain adapter not available',
      });
    }

    const rpcUrl = resolveRpcUrl(
      deps.config.rpc as unknown as Record<string, string>,
      wallet.chain,
      wallet.network,
    );
    const adapter = await deps.adapterPool.resolve(
      wallet.chain as ChainType,
      wallet.network as NetworkType,
      rpcUrl,
    );

    const assets = await adapter.getAssets(wallet.publicKey);

    return c.json(
      {
        walletId: wallet.id,
        chain: wallet.chain,
        network: wallet.network,
        assets: assets.map((a) => ({
          mint: a.mint,
          symbol: a.symbol,
          name: a.name,
          balance: a.balance.toString(),
          decimals: a.decimals,
          isNative: a.isNative,
          usdValue: a.usdValue,
        })),
      },
      200,
    );
  });

  return router;
}
