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
import { WAIaaSError, validateNetworkEnvironment, getNetworksForEnvironment } from '@waiaas/core';
import type { ChainType, NetworkType, EnvironmentType, IForexRateService } from '@waiaas/core';
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
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import { resolveDisplayCurrencyCode, fetchDisplayRate, toDisplayAmount } from './display-currency-helper.js';
import { resolveWalletId } from '../helpers/resolve-wallet-id.js';

export interface WalletRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapterPool: AdapterPool | null;
  config: DaemonConfig | null;
  tokenRegistryService: TokenRegistryService | null;
  forexRateService?: IForexRateService;
  settingsService?: SettingsService;
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
      network: z.string().optional().describe(
        "Network to query. Use 'all' to get balances for all networks in the wallet's environment.",
      ),
      display_currency: z.string().optional().describe('Display currency code for balance conversion (e.g. KRW, EUR). Defaults to server setting.'),
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
      network: z.string().optional().describe(
        "Network to query. Use 'all' to get assets for all networks in the wallet's environment.",
      ),
      display_currency: z.string().optional().describe('Display currency code for asset value conversion (e.g. KRW, EUR). Defaults to server setting.'),
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
// Helper: Wire ERC-20 token list on EVM adapters
// ---------------------------------------------------------------------------

type TokenListEntry = { address: string; symbol?: string; name?: string; decimals?: number };

/**
 * Wire ERC-20 token list into an EVM adapter so getAssets() can query balances.
 * Merges tokens from the token registry and ALLOWED_TOKENS policy.
 */
async function wireEvmTokens(
  adapter: unknown,
  wallet: { id: string; chain: string },
  network: string,
  deps: WalletRouteDeps,
): Promise<void> {
  if (wallet.chain !== 'ethereum' || !('setAllowedTokens' in (adapter as Record<string, unknown>))) {
    return;
  }

  const tokenList: TokenListEntry[] = [];
  const seenAddresses = new Set<string>();

  // Source 1: Token registry (builtin + custom for this network)
  if (deps.tokenRegistryService) {
    const registryTokens = await deps.tokenRegistryService.getAdapterTokenList(network);
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
  (adapter as unknown as { setAllowedTokens: (t: TokenListEntry[]) => void }).setAllowedTokens(tokenList);
}

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
    const walletId = resolveWalletId(c, deps.db);
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
    const walletId = resolveWalletId(c, deps.db);
    const wallet = await resolveWalletById(deps.db, walletId);

    if (!deps.adapterPool || !deps.config) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: 'Chain adapter not available',
      });
    }

    // network query parameter -> specific network, fallback to wallet.defaultNetwork
    const { network: queryNetwork, display_currency: queryCurrency } = c.req.valid('query');

    // Resolve display currency from query param or server setting
    const currencyCode = resolveDisplayCurrencyCode(queryCurrency, deps.settingsService);

    // --- network=all: return balances for all environment networks ---
    if (queryNetwork === 'all') {
      const networks = getNetworksForEnvironment(
        wallet.chain as ChainType,
        wallet.environment as EnvironmentType,
      );

      const results = await Promise.allSettled(
        networks.map(async (net) => {
          const rpcUrl = resolveRpcUrl(
            deps.config!.rpc as unknown as Record<string, string>,
            wallet.chain,
            net,
          );
          const adapter = await deps.adapterPool!.resolve(
            wallet.chain as ChainType,
            net as NetworkType,
            rpcUrl,
          );
          const balanceInfo = await adapter.getBalance(wallet.publicKey);
          return {
            network: net,
            balance: balanceInfo.balance.toString(),
            decimals: balanceInfo.decimals,
            symbol: balanceInfo.symbol,
          };
        }),
      );

      const balances = results.map((r, i) => {
        if (r.status === 'fulfilled') {
          return r.value;
        }
        return {
          network: networks[i]!,
          error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
        };
      });

      // network=all returns a different shape -- cast to satisfy typed route
      return c.json({ walletId: wallet.id, chain: wallet.chain, environment: wallet.environment, balances } as never, 200);
    }

    // --- existing: specific network or wallet default ---
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

    // Balance displayBalance: requires price oracle (USD price of native token) + forex rate
    // Currently null -- balance USD conversion is not available without price data in this context
    const displayBalance: string | null = null;

    return c.json(
      {
        walletId: wallet.id,
        chain: wallet.chain,
        network: targetNetwork,
        address: wallet.publicKey,
        balance: balanceInfo.balance.toString(),
        decimals: balanceInfo.decimals,
        symbol: balanceInfo.symbol,
        displayBalance,
        displayCurrency: currencyCode ?? null,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /wallet/assets
  // ---------------------------------------------------------------------------

  router.openapi(walletAssetsRoute, async (c) => {
    const walletId = resolveWalletId(c, deps.db);
    const wallet = await resolveWalletById(deps.db, walletId);

    if (!deps.adapterPool || !deps.config) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: 'Chain adapter not available',
      });
    }

    // network query parameter -> specific network, fallback to wallet.defaultNetwork
    const { network: queryNetwork, display_currency: queryCurrency } = c.req.valid('query');

    // Resolve display currency from query param or server setting
    const currencyCode = resolveDisplayCurrencyCode(queryCurrency, deps.settingsService);
    const displayRate = await fetchDisplayRate(currencyCode, deps.forexRateService);

    // --- network=all: return assets for all environment networks ---
    if (queryNetwork === 'all') {
      const networks = getNetworksForEnvironment(
        wallet.chain as ChainType,
        wallet.environment as EnvironmentType,
      );

      const results = await Promise.allSettled(
        networks.map(async (net) => {
          const rpcUrl = resolveRpcUrl(
            deps.config!.rpc as unknown as Record<string, string>,
            wallet.chain,
            net,
          );
          const adapter = await deps.adapterPool!.resolve(
            wallet.chain as ChainType,
            net as NetworkType,
            rpcUrl,
          );

          // Wire ERC-20 tokens for EVM adapters
          await wireEvmTokens(adapter, wallet, net, deps);

          const assets = await adapter.getAssets(wallet.publicKey);
          return {
            network: net,
            assets: assets.map((a) => ({
              mint: a.mint,
              symbol: a.symbol,
              name: a.name,
              balance: a.balance.toString(),
              decimals: a.decimals,
              isNative: a.isNative,
              usdValue: a.usdValue,
            })),
          };
        }),
      );

      const networkAssets = results.map((r, i) => {
        if (r.status === 'fulfilled') {
          return r.value;
        }
        return {
          network: networks[i]!,
          error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
        };
      });

      // network=all returns a different shape -- cast to satisfy typed route
      return c.json({ walletId: wallet.id, chain: wallet.chain, environment: wallet.environment, networkAssets } as never, 200);
    }

    // --- existing: specific network or wallet default ---
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
    await wireEvmTokens(adapter, wallet, targetNetwork, deps);

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
          displayValue: toDisplayAmount(a.usdValue ?? null, currencyCode, displayRate),
        })),
        displayCurrency: currencyCode ?? null,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // PUT /wallet/default-network (session-scoped)
  // ---------------------------------------------------------------------------

  router.openapi(walletDefaultNetworkRoute, async (c) => {
    const walletId = resolveWalletId(c, deps.db);
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
