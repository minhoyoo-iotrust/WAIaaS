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
import type { IPriceOracle } from '@waiaas/core';
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

interface StakingTxRow {
  amount: string | null;
  bridge_status: string | null;
  created_at: number | null;
  metadata: string | null;
}

/**
 * Aggregate staking transactions for a wallet + provider key.
 *
 * Stake transactions increase position; unstake transactions decrease.
 * The net balance is an estimate based on transaction records.
 */
function aggregateStakingBalance(
  sqlite: SQLiteDatabase,
  walletId: string,
  providerKey: string,
): { balanceWei: bigint; pendingUnstake: { amount: string; status: 'PENDING' | 'COMPLETED' | 'TIMEOUT'; requestedAt: number | null } | null } {
  // Query completed stake/unstake transactions for this provider
  // metadata column stores JSON with action provider info
  const stakeRows = sqlite.prepare(
    `SELECT amount, bridge_status, created_at, metadata
     FROM transactions
     WHERE wallet_id = ? AND status IN ('CONFIRMED', 'COMPLETED')
       AND metadata LIKE ?
     ORDER BY created_at ASC`,
  ).all(walletId, `%${providerKey}%`) as StakingTxRow[];

  let totalStaked = 0n;
  let totalUnstaked = 0n;

  for (const row of stakeRows) {
    // Fallback: if amount is NULL, try extracting from metadata (CONTRACT_CALL value)
    let effectiveAmount = row.amount;
    if (!effectiveAmount && row.metadata) {
      try {
        const meta = JSON.parse(row.metadata) as Record<string, unknown>;
        const origReq = meta.originalRequest as Record<string, unknown> | undefined;
        if (origReq?.value && typeof origReq.value === 'string') {
          effectiveAmount = origReq.value;
        }
      } catch { /* ignore */ }
    }
    if (!effectiveAmount) continue;

    // Parse metadata to determine if it's a stake or unstake action
    let isUnstake = false;
    if (row.metadata) {
      try {
        const meta = JSON.parse(row.metadata) as Record<string, unknown>;
        if (meta.action === 'unstake' || meta.actionName === 'unstake') {
          isUnstake = true;
        }
      } catch {
        // Ignore parse errors
      }
    }

    try {
      const amountBig = BigInt(effectiveAmount);
      if (isUnstake) {
        totalUnstaked += amountBig;
      } else {
        totalStaked += amountBig;
      }
    } catch {
      // Non-numeric amount -- skip
    }
  }

  // Check for pending unstake (bridge_status = PENDING)
  const pendingRow = sqlite.prepare(
    `SELECT amount, bridge_status, created_at
     FROM transactions
     WHERE wallet_id = ? AND bridge_status = 'PENDING'
       AND metadata LIKE ?
     ORDER BY created_at DESC
     LIMIT 1`,
  ).get(walletId, `%${providerKey}%`) as StakingTxRow | undefined;

  let pendingUnstake: { amount: string; status: 'PENDING' | 'COMPLETED' | 'TIMEOUT'; requestedAt: number | null } | null = null;

  if (pendingRow && pendingRow.amount) {
    pendingUnstake = {
      amount: pendingRow.amount,
      status: (pendingRow.bridge_status ?? 'PENDING') as 'PENDING' | 'COMPLETED' | 'TIMEOUT',
      requestedAt: pendingRow.created_at ?? null,
    };
  }

  // Net staking balance
  const balanceWei = totalStaked > totalUnstaked ? totalStaked - totalUnstaked : 0n;

  return { balanceWei, pendingUnstake };
}

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

        positions.push({
          protocol: 'lido',
          chain: 'ethereum',
          asset: 'stETH',
          balance: balanceWei.toString(),
          balanceUsd,
          apy: LIDO_APY,
          pendingUnstake,
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

        positions.push({
          protocol: 'jito',
          chain: 'solana',
          asset: 'JitoSOL',
          balance: balanceLamports.toString(),
          balanceUsd,
          apy: JITO_APY,
          pendingUnstake,
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
