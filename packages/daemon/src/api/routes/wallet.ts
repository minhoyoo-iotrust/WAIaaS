/**
 * Wallet query routes: GET /v1/wallet/address, GET /v1/wallet/balance,
 * GET /v1/wallet/assets, PUT /v1/wallet/default-network.
 *
 * v1.2: Protected by sessionAuth middleware (Authorization: Bearer wai_sess_<token>),
 *       applied at server level in createApp().
 * Wallet identification via JWT payload walletId (set by sessionAuth on context).
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError, validateNetworkEnvironment } from '@waiaas/core';
import type { ChainType, NetworkType, EnvironmentType } from '@waiaas/core';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import { wallets, policies } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import {
  WalletAddressResponseSchema,
  WalletBalanceResponseSchema,
  WalletAssetsResponseSchema,
  UpdateDefaultNetworkRequestSchema,
  UpdateDefaultNetworkResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';
import type { TokenRegistryService } from '../../infrastructure/token-registry/index.js';

export interface WalletRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapterPool: AdapterPool | null;
  config: DaemonConfig | null;
  tokenRegistryService: TokenRegistryService | null;
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
  request: {
    query: z.object({
      network: z.string().optional(),
    }),
  },
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
  request: {
    query: z.object({
      network: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'All assets (native + tokens) held by wallet',
      content: { 'application/json': { schema: WalletAssetsResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'CHAIN_ERROR']),
  },
});

const walletDefaultNetworkRoute = createRoute({
  method: 'put',
  path: '/wallet/default-network',
  tags: ['Wallet'],
  summary: 'Change wallet default network (session-scoped)',
  request: {
    body: {
      content: {
        'application/json': { schema: UpdateDefaultNetworkRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Default network updated',
      content: {
        'application/json': { schema: UpdateDefaultNetworkResponseSchema },
      },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'WALLET_TERMINATED', 'ENVIRONMENT_NETWORK_MISMATCH']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create wallet route sub-router.
 *
 * GET /wallet/address          -> returns wallet's public key
 * GET /wallet/balance          -> calls adapter.getBalance() and returns lamports
 * GET /wallet/assets           -> calls adapter.getAssets() and returns all token balances
 * PUT /wallet/default-network  -> changes wallet default network (session-scoped)
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
        network: wallet.defaultNetwork!,
        environment: wallet.environment!,
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

    // network query parameter -> specific network, fallback to wallet.defaultNetwork
    const { network: queryNetwork } = c.req.valid('query');
    const targetNetwork = queryNetwork ?? wallet.defaultNetwork!;

    // Validate network-environment compatibility when query param specified
    if (queryNetwork) {
      try {
        validateNetworkEnvironment(
          wallet.chain as ChainType,
          wallet.environment as EnvironmentType,
          queryNetwork as NetworkType,
        );
      } catch (err) {
        throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
          message: err instanceof Error ? err.message : 'Network validation failed',
        });
      }
    }

    const rpcUrl = resolveRpcUrl(
      deps.config.rpc as unknown as Record<string, string>,
      wallet.chain,
      targetNetwork,
    );
    const adapter = await deps.adapterPool.resolve(
      wallet.chain as ChainType,
      targetNetwork as NetworkType,
      rpcUrl,
    );

    const balanceInfo = await adapter.getBalance(wallet.publicKey);

    return c.json(
      {
        walletId: wallet.id,
        chain: wallet.chain,
        network: targetNetwork,
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

    // network query parameter -> specific network, fallback to wallet.defaultNetwork
    const { network: queryNetwork } = c.req.valid('query');
    const targetNetwork = queryNetwork ?? wallet.defaultNetwork!;

    // Validate network-environment compatibility when query param specified
    if (queryNetwork) {
      try {
        validateNetworkEnvironment(
          wallet.chain as ChainType,
          wallet.environment as EnvironmentType,
          queryNetwork as NetworkType,
        );
      } catch (err) {
        throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
          message: err instanceof Error ? err.message : 'Network validation failed',
        });
      }
    }

    const rpcUrl = resolveRpcUrl(
      deps.config.rpc as unknown as Record<string, string>,
      wallet.chain,
      targetNetwork,
    );
    const adapter = await deps.adapterPool.resolve(
      wallet.chain as ChainType,
      targetNetwork as NetworkType,
      rpcUrl,
    );

    // Wire ERC-20 tokens for EVM adapters before getAssets
    if (wallet.chain === 'ethereum' && 'setAllowedTokens' in adapter) {
      const tokenList: Array<{ address: string; symbol?: string; name?: string; decimals?: number }> = [];
      const seenAddresses = new Set<string>();

      // Source 1: Token registry (builtin + custom for this network)
      if (deps.tokenRegistryService) {
        const registryTokens = await deps.tokenRegistryService.getAdapterTokenList(targetNetwork);
        for (const t of registryTokens) {
          const lower = t.address.toLowerCase();
          if (!seenAddresses.has(lower)) {
            seenAddresses.add(lower);
            tokenList.push(t);
          }
        }
      }

      // Source 2: ALLOWED_TOKENS policy for this wallet
      const allowedTokensPolicies = await deps.db.select().from(policies)
        .where(
          and(
            eq(policies.walletId, wallet.id),
            eq(policies.type, 'ALLOWED_TOKENS'),
            eq(policies.enabled, true),
          )
        );
      if (allowedTokensPolicies.length > 0) {
        const rules = JSON.parse(allowedTokensPolicies[0]!.rules) as { tokens: Array<{ address: string }> };
        for (const t of rules.tokens) {
          const lower = t.address.toLowerCase();
          if (!seenAddresses.has(lower)) {
            seenAddresses.add(lower);
            tokenList.push({ address: t.address });
          }
        }
      }

      // Set merged token list on adapter
      (adapter as unknown as { setAllowedTokens: (t: typeof tokenList) => void }).setAllowedTokens(tokenList);
    }

    const assets = await adapter.getAssets(wallet.publicKey);

    return c.json(
      {
        walletId: wallet.id,
        chain: wallet.chain,
        network: targetNetwork,
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

  // ---------------------------------------------------------------------------
  // PUT /wallet/default-network (session-scoped)
  // ---------------------------------------------------------------------------

  router.openapi(walletDefaultNetworkRoute, async (c) => {
    const walletId = c.get('walletId' as never) as string;
    const wallet = await resolveWalletById(deps.db, walletId);

    if (wallet.status === 'TERMINATED') {
      throw new WAIaaSError('WALLET_TERMINATED', {
        message: `Wallet '${walletId}' is already terminated`,
      });
    }

    const body = c.req.valid('json');

    // Validate that the requested network is allowed for wallet's chain+environment
    try {
      validateNetworkEnvironment(
        wallet.chain as ChainType,
        wallet.environment as EnvironmentType,
        body.network as NetworkType,
      );
    } catch {
      throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
        message: `Network '${body.network}' is not allowed for chain '${wallet.chain}' in environment '${wallet.environment}'`,
      });
    }

    const previousNetwork = wallet.defaultNetwork;
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    await deps.db
      .update(wallets)
      .set({ defaultNetwork: body.network, updatedAt: now })
      .where(eq(wallets.id, walletId))
      .run();

    return c.json(
      {
        id: walletId,
        defaultNetwork: body.network,
        previousNetwork: previousNetwork ?? null,
      },
      200,
    );
  });

  return router;
}
