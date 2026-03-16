/**
 * Admin Wallet route handlers: wallet transactions, balance, staking, telegram users, defi positions.
 *
 * Extracted from admin.ts for maintainability.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute, z } from '@hono/zod-openapi';
import { sql, eq, and, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError, getNetworksForEnvironment, formatAmount, NATIVE_DECIMALS, NATIVE_SYMBOLS } from '@waiaas/core';
import type { ChainType, EnvironmentType } from '@waiaas/core';
import { wallets, transactions, tokenRegistry } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import {
  StakingPositionsResponseSchema,
  buildErrorResponses,
} from './openapi-schemas.js';
import type { AdminRouteDeps } from './admin.js';
import { resolveContractFields } from './admin-monitoring.js';
import { aggregateStakingBalance } from '../../services/staking/aggregate-staking-balance.js';


/**
 * Format raw blockchain amount to human-readable string with token symbol.
 * Returns null if formatting is not possible (unknown token, null amount, etc).
 */
export function formatTxAmount(
  amount: string | null,
  chain: string,
  network: string | null,
  tokenAddress: string | null,
  db: BetterSQLite3Database<typeof schema>,
): string | null {
  if (!amount || amount === '0') return amount;

  try {
    if (tokenAddress) {
      // Token transfer: look up decimals/symbol from token_registry
      const token = db
        .select({ symbol: tokenRegistry.symbol, decimals: tokenRegistry.decimals })
        .from(tokenRegistry)
        .where(and(
          eq(tokenRegistry.address, tokenAddress),
          network ? eq(tokenRegistry.network, network) : undefined,
        ))
        .limit(1)
        .get();
      if (!token) return null; // unknown token -> caller falls back to raw
      return `${formatAmount(BigInt(amount), token.decimals)} ${token.symbol}`;
    }

    // Native transfer
    const decimals = NATIVE_DECIMALS[chain] ?? 18;
    const symbol = NATIVE_SYMBOLS[chain] ?? chain.toUpperCase();
    return `${formatAmount(BigInt(amount), decimals)} ${symbol}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const adminWalletTransactionsRoute = createRoute({
  method: 'get',
  path: '/admin/wallets/{id}/transactions',
  tags: ['Admin'],
  summary: 'Get wallet transactions',
  request: {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
      offset: z.coerce.number().int().min(0).default(0).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Wallet transaction list',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                type: z.string(),
                status: z.string(),
                toAddress: z.string().nullable(),
                amount: z.string().nullable(),
                formattedAmount: z.string().nullable(),
                amountUsd: z.number().nullable(),
                network: z.string().nullable(),
                txHash: z.string().nullable(),
                createdAt: z.number().nullable(),
                contractName: z.string().nullable().optional(),
                contractNameSource: z.string().nullable().optional(),
              }),
            ),
            total: z.number().int(),
          }),
        },
      },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const adminWalletBalanceRoute = createRoute({
  method: 'get',
  path: '/admin/wallets/{id}/balance',
  tags: ['Admin'],
  summary: 'Get wallet balance across all available networks',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Wallet balances per network',
      content: {
        'application/json': {
          schema: z.object({
            balances: z.array(
              z.object({
                network: z.string(),
                native: z
                  .object({
                    balance: z.string(),
                    symbol: z.string(),
                    usd: z.number().nullable().optional(),
                  })
                  .nullable(),
                tokens: z.array(
                  z.object({
                    symbol: z.string(),
                    balance: z.string(),
                    address: z.string(),
                  }),
                ),
                error: z.string().optional(),
              }),
            ),
          }),
        },
      },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const adminWalletStakingRoute = createRoute({
  method: 'get',
  path: '/admin/wallets/{id}/staking',
  tags: ['Admin'],
  summary: 'Get wallet staking positions',
  description:
    'Returns staking positions (Lido stETH, Jito JitoSOL) for a specific wallet with balance, APY, pending unstake status.',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Staking positions for the wallet',
      content: { 'application/json': { schema: StakingPositionsResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const adminDefiPositionsRoute = createRoute({
  method: 'get',
  path: '/admin/defi/positions',
  tags: ['Admin'],
  summary: 'Get all DeFi positions across wallets',
  description:
    'Returns all active DeFi positions across all wallets with aggregated totals. ' +
    'Optionally filter by wallet_id. masterAuth required.',
  request: {
    query: z.object({
      wallet_id: z.string().uuid().optional(),
      category: z.enum(['STAKING', 'LENDING', 'YIELD', 'PERP']).optional(),
      includeTestnets: z.enum(['true', 'false']).optional().default('false'),
    }),
  },
  responses: {
    200: {
      description: 'Active DeFi positions with aggregates',
      content: {
        'application/json': {
          schema: z.object({
            positions: z.array(z.object({
              id: z.string(),
              walletId: z.string(),
              category: z.string(),
              provider: z.string(),
              chain: z.string(),
              environment: z.string(),
              network: z.string().nullable(),
              assetId: z.string().nullable(),
              amount: z.string(),
              amountUsd: z.number().nullable(),
              metadata: z.unknown().nullable(),
              status: z.string(),
              openedAt: z.number(),
              lastSyncedAt: z.number(),
            })),
            totalValueUsd: z.number().nullable(),
            worstHealthFactor: z.number().nullable(),
            activeCount: z.number(),
          }),
        },
      },
    },
  },
});

// Telegram Users route definitions
const TelegramUserSchema = z.object({
  chat_id: z.number(),
  username: z.string().nullable(),
  role: z.enum(['PENDING', 'ADMIN', 'READONLY']),
  registered_at: z.number(),
  approved_at: z.number().nullable(),
});

const telegramUsersListRoute = createRoute({
  method: 'get',
  path: '/admin/telegram-users',
  tags: ['Admin'],
  summary: 'List Telegram bot users',
  responses: {
    200: {
      description: 'Telegram users list',
      content: {
        'application/json': {
          schema: z.object({
            users: z.array(TelegramUserSchema),
            total: z.number(),
          }),
        },
      },
    },
  },
});

const telegramUserUpdateRoute = createRoute({
  method: 'put',
  path: '/admin/telegram-users/{chatId}',
  tags: ['Admin'],
  summary: 'Update Telegram user role',
  request: {
    params: z.object({ chatId: z.coerce.number() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            role: z.enum(['ADMIN', 'READONLY']),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'User role updated',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            chat_id: z.number(),
            role: z.enum(['ADMIN', 'READONLY']),
          }),
        },
      },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const telegramUserDeleteRoute = createRoute({
  method: 'delete',
  path: '/admin/telegram-users/{chatId}',
  tags: ['Admin'],
  summary: 'Delete Telegram user',
  request: {
    params: z.object({ chatId: z.coerce.number() }),
  },
  responses: {
    200: {
      description: 'User deleted',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Register handlers
// ---------------------------------------------------------------------------

export function registerAdminWalletRoutes(router: OpenAPIHono, deps: AdminRouteDeps): void {
  // GET /admin/wallets/:id/transactions
  router.openapi(adminWalletTransactionsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const query = c.req.valid('query');
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    // Verify wallet exists
    const wallet = deps.db.select().from(wallets).where(eq(wallets.id, id)).get();
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    // Query transactions for this wallet
    const rows = deps.db
      .select()
      .from(transactions)
      .where(eq(transactions.walletId, id))
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    // Total count
    const totalResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.walletId, id))
      .get();
    const total = totalResult?.count ?? 0;

    const items = rows.map((tx) => {
      const tokenAddr = tx.tokenMint ?? tx.contractAddress ?? null;
      return {
        id: tx.id,
        type: tx.type,
        status: tx.status,
        toAddress: tx.toAddress ?? null,
        amount: tx.amount ?? null,
        formattedAmount: formatTxAmount(tx.amount ?? null, tx.chain, tx.network ?? null, tokenAddr, deps.db),
        amountUsd: tx.amountUsd ?? null,
        network: tx.network ?? null,
        txHash: tx.txHash ?? null,
        createdAt: tx.createdAt instanceof Date
          ? Math.floor(tx.createdAt.getTime() / 1000)
          : (typeof tx.createdAt === 'number' ? tx.createdAt : null),
        ...resolveContractFields(tx.type, tx.toAddress ?? null, tx.network ?? null, deps.contractNameRegistry),
      };
    });

    return c.json({ items, total }, 200);
  });

  // GET /admin/wallets/:id/balance
  router.openapi(adminWalletBalanceRoute, async (c) => {
    const { id } = c.req.valid('param');

    // Verify wallet exists
    const wallet = deps.db.select().from(wallets).where(eq(wallets.id, id)).get();
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    // If no adapter pool, return empty balances
    if (!deps.adapterPool) {
      return c.json({ balances: [] }, 200);
    }

    const chain = wallet.chain as ChainType;
    const env = wallet.environment as EnvironmentType;
    const networks = getNetworksForEnvironment(chain, env);

    const results = await Promise.allSettled(
      networks.map(async (network) => {
        const rpcUrl = resolveRpcUrl(deps.daemonConfig!.rpc, wallet.chain, network);
        if (!rpcUrl) {
          return { network, native: null, tokens: [], error: 'RPC endpoint not configured' };
        }
        const adapter = await deps.adapterPool!.resolve(chain, network, rpcUrl);

        const balanceInfo = await adapter.getBalance(wallet.publicKey);
        const nativeBalance = formatAmount(balanceInfo.balance, balanceInfo.decimals);

        // Resolve USD price for native token if price oracle is available
        let nativeUsd: number | null = null;
        if (deps.priceOracle) {
          try {
            const priceInfo = await deps.priceOracle.getNativePrice(chain);
            nativeUsd = Number(nativeBalance) * priceInfo.usdPrice;
          } catch { /* non-critical: USD price unavailable */ }
        }

        const assets = await adapter.getAssets(wallet.publicKey);
        const tokens = assets
          .filter((a) => !a.isNative)
          .map((a) => ({
            symbol: a.symbol,
            balance: formatAmount(a.balance, a.decimals),
            address: a.mint,
          }));

        return {
          network,
          native: { balance: nativeBalance, symbol: balanceInfo.symbol, usd: nativeUsd },
          tokens,
        };
      }),
    );

    const balances = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      const errorMessage = r.reason instanceof Error ? r.reason.message : String(r.reason);
      return { network: networks[i]!, native: null, tokens: [], error: errorMessage };
    });

    return c.json({ balances }, 200);
  });

  // GET /admin/wallets/:id/staking
  router.openapi(adminWalletStakingRoute, async (c) => {
    const { id } = c.req.valid('param');

    // Verify wallet exists
    const wallet = deps.db.select().from(wallets).where(eq(wallets.id, id)).get();
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
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

    if (!deps.sqlite) {
      return c.json({ walletId: id, positions }, 200);
    }

    const LIDO_APY = '~3.5%';
    const JITO_APY = '~7.5%';

    // Ethereum wallet -> Lido
    if (wallet.chain === 'ethereum') {
      const { balanceWei, pendingUnstake } = aggregateStakingBalance(deps.sqlite!, id, 'lido_staking');
      if (balanceWei > 0n || pendingUnstake) {
        let balanceUsd: string | null = null;
        if (deps.priceOracle && balanceWei > 0n) {
          try {
            const priceInfo = await deps.priceOracle.getNativePrice('ethereum');
            balanceUsd = (Number(balanceWei) / 1e18 * priceInfo.usdPrice).toFixed(2);
          } catch { /* price unavailable */ }
        }
        positions.push({ protocol: 'lido', chain: 'ethereum', asset: 'stETH', balance: balanceWei.toString(), balanceUsd, apy: LIDO_APY, pendingUnstake });
      }
    }

    // Solana wallet -> Jito
    if (wallet.chain === 'solana') {
      const { balanceWei: balanceLamports, pendingUnstake } = aggregateStakingBalance(deps.sqlite!, id, 'jito_staking');
      if (balanceLamports > 0n || pendingUnstake) {
        let balanceUsd: string | null = null;
        if (deps.priceOracle && balanceLamports > 0n) {
          try {
            const priceInfo = await deps.priceOracle.getNativePrice('solana');
            balanceUsd = (Number(balanceLamports) / 1e9 * priceInfo.usdPrice).toFixed(2);
          } catch { /* price unavailable */ }
        }
        positions.push({ protocol: 'jito', chain: 'solana', asset: 'JitoSOL', balance: balanceLamports.toString(), balanceUsd, apy: JITO_APY, pendingUnstake });
      }
    }

    return c.json({ walletId: id, positions }, 200);
  });

  // GET /admin/telegram-users
  router.openapi(telegramUsersListRoute, async (c) => {
    if (!deps.sqlite) {
      return c.json({ users: [] as Array<{ chat_id: number; username: string | null; role: 'PENDING' | 'ADMIN' | 'READONLY'; registered_at: number; approved_at: number | null }>, total: 0 }, 200);
    }

    const rows = deps.sqlite
      .prepare(
        'SELECT chat_id, username, role, registered_at, approved_at FROM telegram_users ORDER BY registered_at DESC',
      )
      .all() as Array<{
      chat_id: number;
      username: string | null;
      role: 'PENDING' | 'ADMIN' | 'READONLY';
      registered_at: number;
      approved_at: number | null;
    }>;

    return c.json({ users: rows, total: rows.length }, 200);
  });

  // PUT /admin/telegram-users/:chatId
  router.openapi(telegramUserUpdateRoute, async (c) => {
    if (!deps.sqlite) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'SQLite not available',
      });
    }

    const { chatId } = c.req.valid('param');
    const body = c.req.valid('json');
    const now = Math.floor(Date.now() / 1000);

    const result = deps.sqlite
      .prepare(
        'UPDATE telegram_users SET role = ?, approved_at = ? WHERE chat_id = ?',
      )
      .run(body.role, now, chatId);

    if (result.changes === 0) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Telegram user not found: ${chatId}`,
      });
    }

    return c.json(
      { success: true, chat_id: chatId, role: body.role },
      200,
    );
  });

  // DELETE /admin/telegram-users/:chatId
  router.openapi(telegramUserDeleteRoute, async (c) => {
    if (!deps.sqlite) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'SQLite not available',
      });
    }

    const { chatId } = c.req.valid('param');

    const result = deps.sqlite
      .prepare('DELETE FROM telegram_users WHERE chat_id = ?')
      .run(chatId);

    if (result.changes === 0) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Telegram user not found: ${chatId}`,
      });
    }

    return c.json({ success: true }, 200);
  });

  // GET /admin/defi/positions
  router.openapi(adminDefiPositionsRoute, async (c) => {
    const { wallet_id, category, includeTestnets } = c.req.valid('query');

    if (!deps.sqlite) {
      return c.json({ positions: [], totalValueUsd: null, worstHealthFactor: null, activeCount: 0 }, 200);
    }

    // Cross-wallet DeFi positions query
    type PositionRow = {
      id: string; wallet_id: string; category: string; provider: string;
      chain: string; environment: string; network: string | null; asset_id: string | null;
      amount: string; amount_usd: number | null; metadata: string | null;
      status: string; opened_at: number; last_synced_at: number;
    };

    const conditions: string[] = ["status = 'ACTIVE'"];
    const params: unknown[] = [];

    if (includeTestnets !== 'true') {
      conditions.push("environment = 'mainnet'");
    }
    if (wallet_id) {
      conditions.push('wallet_id = ?');
      params.push(wallet_id);
    }
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }

    const whereClause = conditions.join(' AND ');
    const rows = deps.sqlite.prepare(
      `SELECT id, wallet_id, category, provider, chain, environment, network, asset_id,
              amount, amount_usd, metadata, status, opened_at, last_synced_at
       FROM defi_positions
       WHERE ${whereClause}
       ORDER BY category, provider`,
    ).all(...params) as PositionRow[];

    function parseMetadata(raw: string | null): unknown {
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    }

    const positions = rows.map((row) => ({
      id: row.id,
      walletId: row.wallet_id,
      category: row.category,
      provider: row.provider,
      chain: row.chain,
      environment: row.environment,
      network: row.network,
      assetId: row.asset_id,
      amount: row.amount,
      amountUsd: row.amount_usd,
      metadata: parseMetadata(row.metadata),
      status: row.status,
      openedAt: row.opened_at,
      lastSyncedAt: row.last_synced_at,
    }));

    // Aggregate totalValueUsd
    const usdValues = positions.map((p) => p.amountUsd).filter((v): v is number => v !== null);
    const totalValueUsd = usdValues.length > 0 ? usdValues.reduce((a, b) => a + b, 0) : null;

    // Worst health factor from metadata JSON
    let worstHealthFactor: number | null = null;
    for (const row of rows) {
      if (row.category === 'LENDING' && row.metadata) {
        try {
          const meta = JSON.parse(row.metadata) as Record<string, unknown>;
          if (typeof meta.healthFactor === 'number' && meta.healthFactor > 0) {
            if (worstHealthFactor === null || meta.healthFactor < worstHealthFactor) {
              worstHealthFactor = meta.healthFactor;
            }
          }
        } catch { /* skip */ }
      }
    }

    return c.json({
      positions,
      totalValueUsd,
      worstHealthFactor,
      activeCount: positions.length,
    }, 200);
  });
}
