/**
 * DeFi position routes: GET /v1/wallet/positions, GET /v1/wallet/health-factor.
 *
 * - GET /v1/wallet/positions: Returns cached DeFi positions from defi_positions DB table
 *   with USD amounts and status filtering (only ACTIVE positions).
 * - GET /v1/wallet/health-factor: Returns live health factor from ILendingProvider
 *   implementations (Aave V3, Kamino) with severity classification.
 *
 * - sessionAuth required (via wildcard /v1/wallet/*)
 * - Wallet resolved via resolveWalletId (session default or explicit wallet_id)
 *
 * @see packages/actions/src/providers/aave-v3
 * @see packages/actions/src/providers/kamino
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { wallets } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveWalletId } from '../helpers/resolve-wallet-id.js';
import type { ActionProviderRegistry } from '../../infrastructure/action/action-provider-registry.js';
import type { ILendingProvider, NetworkType } from '@waiaas/core';
import { networkToCaip2 } from '@waiaas/core';
import {
  DeFiPositionsResponseSchema,
  HealthFactorResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface DefiPositionRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  actionProviderRegistry?: ActionProviderRegistry;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const getPositionsRoute = createRoute({
  method: 'get',
  path: '/wallet/positions',
  tags: ['DeFi'],
  summary: 'Get DeFi lending positions',
  description:
    'Returns cached DeFi lending positions from the database with USD amounts. ' +
    'Only ACTIVE positions are returned. Positions are ordered by category and provider.',
  request: {
    query: z.object({
      wallet_id: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: 'DeFi positions for the wallet',
      content: { 'application/json': { schema: DeFiPositionsResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const getHealthFactorRoute = createRoute({
  method: 'get',
  path: '/wallet/health-factor',
  tags: ['DeFi'],
  summary: 'Get lending health factor',
  description:
    'Returns aggregated health factor from all registered lending providers ' +
    '(Aave V3, Kamino) with collateral/debt USD values and severity classification.',
  request: {
    query: z.object({
      wallet_id: z.string().uuid().optional(),
      network: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Health factor for the wallet',
      content: { 'application/json': { schema: HealthFactorResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// DB row type for defi_positions query
// ---------------------------------------------------------------------------

interface DefiPositionRow {
  id: string;
  wallet_id: string;
  category: string;
  provider: string;
  chain: string;
  network: string | null;
  asset_id: string | null;
  amount: string;
  amount_usd: number | null;
  metadata: string | null;
  status: string;
  opened_at: number;
  last_synced_at: number;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create DeFi position route sub-router.
 *
 * GET /wallet/positions -> cached DeFi positions from DB
 * GET /wallet/health-factor -> live health factor from ILendingProvider
 */
export function createDefiPositionRoutes(deps: DefiPositionRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // -----------------------------------------------------------------------
  // GET /wallet/positions
  // -----------------------------------------------------------------------
  router.openapi(getPositionsRoute, async (c) => {
    const { wallet_id } = c.req.valid('query');

    // Resolve wallet from session
    const walletId = resolveWalletId(c, deps.db, wallet_id);

    // Fetch wallet details
    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      const { WAIaaSError } = await import('@waiaas/core');
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    // Query defi_positions table (direct SQL for performance)
    let rows: DefiPositionRow[] = [];
    if (deps.sqlite) {
      rows = deps.sqlite.prepare(
        `SELECT id, wallet_id, category, provider, chain, network, asset_id,
                amount, amount_usd, metadata, status, opened_at, last_synced_at
         FROM defi_positions
         WHERE wallet_id = ? AND status = 'ACTIVE'
         ORDER BY category, provider`,
      ).all(walletId) as DefiPositionRow[];
    }

    // Map rows to response shape
    const positions = rows.map((row) => {
      let metadata: unknown = null;
      if (row.metadata) {
        try {
          metadata = JSON.parse(row.metadata);
        } catch {
          metadata = row.metadata;
        }
      }

      // CAIP-2 chainId (graceful)
      let chainId: string | undefined;
      if (row.network) {
        try { chainId = networkToCaip2(row.network as NetworkType); } catch { /* graceful */ }
      }

      return {
        id: row.id,
        category: row.category,
        provider: row.provider,
        chain: row.chain,
        network: row.network,
        assetId: row.asset_id,
        amount: row.amount,
        amountUsd: row.amount_usd,
        metadata,
        status: row.status,
        openedAt: row.opened_at,
        lastSyncedAt: row.last_synced_at,
        ...(chainId ? { chainId } : {}),
      };
    });

    // Calculate totalValueUsd as sum of non-null amountUsd values
    const usdValues = positions.map((p) => p.amountUsd).filter((v): v is number => v !== null);
    const totalValueUsd = usdValues.length > 0 ? usdValues.reduce((a, b) => a + b, 0) : null;

    return c.json({ walletId, positions, totalValueUsd }, 200);
  });

  // -----------------------------------------------------------------------
  // GET /wallet/health-factor
  // -----------------------------------------------------------------------
  router.openapi(getHealthFactorRoute, async (c) => {
    const { wallet_id } = c.req.valid('query');

    // Resolve wallet from session
    const walletId = resolveWalletId(c, deps.db, wallet_id);

    // Fetch wallet details
    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      const { WAIaaSError } = await import('@waiaas/core');
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    // Iterate all registered lending providers (Aave V3, Kamino, etc.)
    const lendingProviders: Array<{ name: string; provider: ILendingProvider }> = [];
    if (deps.actionProviderRegistry) {
      for (const meta of deps.actionProviderRegistry.listProviders()) {
        const p = deps.actionProviderRegistry.getProvider(meta.name);
        if (p && 'getHealthFactor' in p && typeof (p as unknown as ILendingProvider).getHealthFactor === 'function') {
          lendingProviders.push({ name: meta.name, provider: p as unknown as ILendingProvider });
        }
      }
    }

    if (lendingProviders.length === 0) {
      // No lending provider registered -- return default safe response
      return c.json({
        walletId,
        factor: Infinity,
        totalCollateralUsd: 0,
        totalDebtUsd: 0,
        currentLtv: 0,
        status: 'safe' as const,
      }, 200);
    }

    // Aggregate health factors: use worst (lowest) factor across all providers
    let worstFactor = Infinity;
    let totalCollateralUsd = 0;
    let totalDebtUsd = 0;
    let worstLtv = 0;
    let worstStatus: 'safe' | 'warning' | 'danger' | 'critical' = 'safe';

    const context = {
      walletAddress: wallet.publicKey,
      chain: wallet.chain as 'ethereum' | 'solana',
      walletId,
    };

    for (const { provider } of lendingProviders) {
      try {
        const hf = await provider.getHealthFactor(walletId, context);
        totalCollateralUsd += hf.totalCollateralUsd;
        totalDebtUsd += hf.totalDebtUsd;
        if (hf.factor < worstFactor) {
          worstFactor = hf.factor;
          worstLtv = hf.currentLtv;
          worstStatus = hf.status;
        }
      } catch {
        // Skip provider on error (graceful degradation)
      }
    }

    return c.json({
      walletId,
      factor: worstFactor,
      totalCollateralUsd,
      totalDebtUsd,
      currentLtv: worstLtv,
      status: worstStatus,
    }, 200);
  });

  return router;
}
