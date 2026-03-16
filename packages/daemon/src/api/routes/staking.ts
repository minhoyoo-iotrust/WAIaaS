/**
 * Staking position routes: GET /v1/wallet/staking.
 *
 * Returns per-wallet staking positions (Lido stETH, Jito JitoSOL) with
 * estimated balance (aggregated from transactions), APY, and USD conversion.
 *
 * - sessionAuth required (via wildcard /v1/wallet/*)
 * - Wallet resolved via resolveWalletId (session default or explicit wallet_id)
 * - Positions derived from completed staking transactions in the DB
 * - Pending unstake detected from bridge_status='PENDING' transactions
 *
 * @see packages/actions/src/providers/lido-staking
 * @see packages/actions/src/providers/jito-staking
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { wallets } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveWalletId } from '../helpers/resolve-wallet-id.js';
import type { IPriceOracle, NetworkType } from '@waiaas/core';
import { networkToCaip2 } from '@waiaas/core';
import {
  StakingPositionsResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface StakingRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  priceOracle?: IPriceOracle;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Approximate APY for Lido stETH (v1 hardcoded) */
const LIDO_APY = '~3.5%';
/** Approximate APY for Jito JitoSOL (v1 hardcoded) */
const JITO_APY = '~7.5%';

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const getStakingPositionsRoute = createRoute({
  method: 'get',
  path: '/wallet/staking',
  tags: ['Wallet'],
  summary: 'Get wallet staking positions',
  description:
    'Returns staking positions (Lido stETH for Ethereum wallets, Jito JitoSOL for Solana wallets) ' +
    'with estimated balance, APY, and pending unstake status.',
  request: {
    query: z.object({
      wallet_id: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Staking positions for the wallet',
      content: { 'application/json': { schema: StakingPositionsResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { aggregateStakingBalance } from '../../services/staking/aggregate-staking-balance.js';

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create staking route sub-router.
 *
 * GET /wallet/staking -> staking positions for the session wallet
 */
export function createStakingRoutes(deps: StakingRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(getStakingPositionsRoute, async (c) => {
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

    const positions: Array<{
      protocol: 'lido' | 'jito';
      chain: 'ethereum' | 'solana';
      asset: string;
      balance: string;
      balanceUsd: string | null;
      apy: string | null;
      pendingUnstake: { amount: string; status: 'PENDING' | 'COMPLETED' | 'TIMEOUT'; requestedAt: number | null } | null;
      network?: string;
      chainId?: string;
    }> = [];

    // Ethereum wallet -> check Lido staking
    if (wallet.chain === 'ethereum' && deps.sqlite) {
      const { balanceWei, pendingUnstake } = aggregateStakingBalance(
        deps.sqlite,
        walletId,
        'lido_staking',
      );

      if (balanceWei > 0n || pendingUnstake) {
        // Try to get USD price for stETH
        let balanceUsd: string | null = null;
        if (deps.priceOracle && balanceWei > 0n) {
          try {
            const priceInfo = await deps.priceOracle.getNativePrice('ethereum');
            // stETH is approximately 1:1 with ETH
            const ethAmount = Number(balanceWei) / 1e18;
            balanceUsd = (ethAmount * priceInfo.usdPrice).toFixed(2);
          } catch {
            // Price unavailable
          }
        }

        let lidoChainId: string | undefined;
        try { lidoChainId = networkToCaip2('ethereum-mainnet' as NetworkType); } catch { /* graceful */ }
        positions.push({
          protocol: 'lido',
          chain: 'ethereum',
          asset: 'stETH',
          balance: balanceWei.toString(),
          balanceUsd,
          apy: LIDO_APY,
          pendingUnstake,
          network: 'ethereum-mainnet',
          ...(lidoChainId ? { chainId: lidoChainId } : {}),
        });
      }
    }

    // Solana wallet -> check Jito staking
    if (wallet.chain === 'solana' && deps.sqlite) {
      const { balanceWei: balanceLamports, pendingUnstake } = aggregateStakingBalance(
        deps.sqlite,
        walletId,
        'jito_staking',
      );

      if (balanceLamports > 0n || pendingUnstake) {
        // Try to get USD price for JitoSOL
        let balanceUsd: string | null = null;
        if (deps.priceOracle && balanceLamports > 0n) {
          try {
            const priceInfo = await deps.priceOracle.getNativePrice('solana');
            // JitoSOL is approximately 1:1 with SOL
            const solAmount = Number(balanceLamports) / 1e9;
            balanceUsd = (solAmount * priceInfo.usdPrice).toFixed(2);
          } catch {
            // Price unavailable
          }
        }

        let jitoChainId: string | undefined;
        try { jitoChainId = networkToCaip2('solana-mainnet' as NetworkType); } catch { /* graceful */ }
        positions.push({
          protocol: 'jito',
          chain: 'solana',
          asset: 'JitoSOL',
          balance: balanceLamports.toString(),
          balanceUsd,
          apy: JITO_APY,
          pendingUnstake,
          network: 'solana-mainnet',
          ...(jitoChainId ? { chainId: jitoChainId } : {}),
        });
      }
    }

    return c.json(
      {
        walletId,
        positions,
      },
      200,
    );
  });

  return router;
}
