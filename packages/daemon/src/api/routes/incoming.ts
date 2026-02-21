/**
 * Incoming transaction routes: GET /v1/wallet/incoming, GET /v1/wallet/incoming/summary.
 *
 * GET /v1/wallet/incoming:
 *   - Paginated list with composite (detectedAt, id) cursor
 *   - Filters: chain, network, status (default CONFIRMED), token, from_address, since, until, wallet_id
 *   - sessionAuth required (via wildcard /v1/wallet/*)
 *
 * GET /v1/wallet/incoming/summary:
 *   - Period-based aggregation (daily/weekly/monthly) with BigInt app-layer amount summation
 *   - sessionAuth required
 *
 * @see docs/76-incoming-transaction-monitoring.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, and, lt, desc, gte, lte, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { IPriceOracle, IForexRateService, ChainType } from '@waiaas/core';
import { incomingTransactions } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveWalletId } from '../helpers/resolve-wallet-id.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import {
  IncomingTxListResponseSchema,
  IncomingTxSummaryResponseSchema,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface IncomingRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  priceOracle?: IPriceOracle;
  forexRateService?: IForexRateService;
  settingsService?: SettingsService;
}

// ---------------------------------------------------------------------------
// Cursor helpers (composite: detectedAt epoch + id)
// ---------------------------------------------------------------------------

export function encodeCursor(detectedAt: number, id: string): string {
  return Buffer.from(JSON.stringify({ d: detectedAt, i: id })).toString('base64url');
}

export function decodeCursor(cursor: string): { detectedAt: number; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
    if (typeof parsed.d === 'number' && typeof parsed.i === 'string') {
      return { detectedAt: parsed.d, id: parsed.i };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const listIncomingRoute = createRoute({
  method: 'get',
  path: '/wallet/incoming',
  tags: ['Wallet'],
  summary: 'List incoming transactions',
  description:
    'Paginated list of incoming transactions with composite (detectedAt, id) cursor. Defaults to status=CONFIRMED when no status parameter is provided.',
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
      cursor: z.string().optional(),
      chain: z.string().optional(),
      network: z.string().optional(),
      status: z.string().optional().describe('Filter by status (default: CONFIRMED)'),
      token: z.string().optional().describe('Filter by tokenAddress'),
      from_address: z.string().optional(),
      since: z.coerce.number().optional().describe('Epoch seconds lower bound'),
      until: z.coerce.number().optional().describe('Epoch seconds upper bound'),
      wallet_id: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Paginated incoming transaction list',
      content: { 'application/json': { schema: IncomingTxListResponseSchema } },
    },
  },
});

const incomingSummaryRoute = createRoute({
  method: 'get',
  path: '/wallet/incoming/summary',
  tags: ['Wallet'],
  summary: 'Incoming transaction summary by period',
  description:
    'Aggregate incoming transactions by period (daily/weekly/monthly) with BigInt app-layer amount summation.',
  request: {
    query: z.object({
      period: z.enum(['daily', 'weekly', 'monthly']).default('daily').optional(),
      chain: z.string().optional(),
      network: z.string().optional(),
      since: z.coerce.number().optional(),
      until: z.coerce.number().optional(),
      wallet_id: z.string().uuid().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Incoming transaction summary',
      content: { 'application/json': { schema: IncomingTxSummaryResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create incoming transaction route sub-router.
 *
 * GET /wallet/incoming -> paginated list with cursor pagination and 8 filters
 * GET /wallet/incoming/summary -> period aggregation with BigInt amount summation
 */
export function incomingRoutes(deps: IncomingRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // ---------------------------------------------------------------------------
  // GET /wallet/incoming (list with cursor pagination)
  // ---------------------------------------------------------------------------

  router.openapi(listIncomingRoute, async (c) => {
    const {
      limit: rawLimit,
      cursor,
      chain,
      network,
      status: statusParam,
      token,
      from_address,
      since,
      until,
      wallet_id,
    } = c.req.valid('query');
    const limit = rawLimit ?? 20;

    // Resolve wallet from session (or explicit wallet_id query param)
    const walletId = resolveWalletId(c, deps.db, wallet_id);

    // CRITICAL: Default status to CONFIRMED when no status param provided
    const status = statusParam ?? 'CONFIRMED';

    // Build WHERE conditions
    const conditions = [
      eq(incomingTransactions.walletId, walletId),
      eq(incomingTransactions.status, status),
    ];

    if (chain) conditions.push(eq(incomingTransactions.chain, chain));
    if (network) conditions.push(eq(incomingTransactions.network, network));
    if (token) conditions.push(eq(incomingTransactions.tokenAddress, token));
    if (from_address) conditions.push(eq(incomingTransactions.fromAddress, from_address));
    if (since !== undefined) conditions.push(gte(incomingTransactions.detectedAt, new Date(since * 1000)));
    if (until !== undefined) conditions.push(lte(incomingTransactions.detectedAt, new Date(until * 1000)));

    // Cursor-based pagination: (detectedAt < cursor.detectedAt) OR (detectedAt = cursor.detectedAt AND id < cursor.id)
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        const cursorDate = new Date(decoded.detectedAt * 1000);
        conditions.push(
          or(
            lt(incomingTransactions.detectedAt, cursorDate),
            and(
              eq(incomingTransactions.detectedAt, cursorDate),
              lt(incomingTransactions.id, decoded.id),
            ),
          )!,
        );
      }
    }

    // Query: ORDER BY detectedAt DESC, id DESC -- fetch limit+1 to detect hasMore
    const rows = await deps.db
      .select()
      .from(incomingTransactions)
      .where(and(...conditions))
      .orderBy(desc(incomingTransactions.detectedAt), desc(incomingTransactions.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Map DB rows to API response format
    // - Date objects -> epoch seconds
    // - isSuspicious -> suspicious (DB column vs API field name)
    const mapped = items.map((row) => ({
      id: row.id,
      txHash: row.txHash,
      walletId: row.walletId,
      fromAddress: row.fromAddress,
      amount: row.amount,
      tokenAddress: row.tokenAddress,
      chain: row.chain,
      network: row.network,
      status: row.status,
      blockNumber: row.blockNumber,
      detectedAt: Math.floor(row.detectedAt.getTime() / 1000),
      confirmedAt: row.confirmedAt ? Math.floor(row.confirmedAt.getTime() / 1000) : null,
      suspicious: row.isSuspicious,
    }));

    // Compute nextCursor from last item (use epoch-converted value, NOT raw Date)
    const lastItem = items.length > 0 ? items[items.length - 1]! : null;
    const nextCursor = hasMore && lastItem
      ? encodeCursor(Math.floor(lastItem.detectedAt.getTime() / 1000), lastItem.id)
      : null;

    return c.json(
      {
        data: mapped,
        nextCursor,
        hasMore,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /wallet/incoming/summary (period aggregation)
  // ---------------------------------------------------------------------------

  router.openapi(incomingSummaryRoute, async (c) => {
    const {
      period: rawPeriod,
      chain,
      network,
      since,
      until,
      wallet_id,
    } = c.req.valid('query');
    const period = rawPeriod ?? 'daily';

    const walletId = resolveWalletId(c, deps.db, wallet_id);

    // Use raw SQL via deps.sqlite for GROUP BY with date formatting
    // Fetch all matching rows (date_col, amount, is_suspicious), aggregate in JS
    let dateFn: string;
    switch (period) {
      case 'weekly':
        dateFn = "strftime('%Y-W%W', detected_at, 'unixepoch')";
        break;
      case 'monthly':
        dateFn = "strftime('%Y-%m', detected_at, 'unixepoch')";
        break;
      default: // daily
        dateFn = "strftime('%Y-%m-%d', detected_at, 'unixepoch')";
        break;
    }

    // Build WHERE clause and params
    const whereParts = ['wallet_id = ?', "status = 'CONFIRMED'"];
    const params: (string | number)[] = [walletId];

    if (chain) {
      whereParts.push('chain = ?');
      params.push(chain);
    }
    if (network) {
      whereParts.push('network = ?');
      params.push(network);
    }
    if (since !== undefined) {
      whereParts.push('detected_at >= ?');
      params.push(since);
    }
    if (until !== undefined) {
      whereParts.push('detected_at <= ?');
      params.push(until);
    }

    const whereClause = whereParts.join(' AND ');

    // Single query: fetch date_col, amount, is_suspicious for all matching rows
    // Aggregate entirely in JS for BigInt safety
    const sqlQuery = `SELECT ${dateFn} as date_col, amount, is_suspicious FROM incoming_transactions WHERE ${whereClause} ORDER BY date_col DESC`;

    type RawRow = { date_col: string; amount: string; is_suspicious: number };

    let rawRows: RawRow[] = [];
    if (deps.sqlite) {
      rawRows = deps.sqlite.prepare(sqlQuery).all(...params) as RawRow[];
    }

    // Group by date_col and compute BigInt sums in app layer
    const buckets = new Map<string, { totalCount: number; totalAmount: bigint; suspiciousCount: number }>();

    for (const row of rawRows) {
      let bucket = buckets.get(row.date_col);
      if (!bucket) {
        bucket = { totalCount: 0, totalAmount: 0n, suspiciousCount: 0 };
        buckets.set(row.date_col, bucket);
      }
      bucket.totalCount++;
      try {
        bucket.totalAmount += BigInt(row.amount);
      } catch {
        // Non-numeric amount (e.g. decimal string) -- parse as integer portion
        bucket.totalAmount += BigInt(Math.floor(Number(row.amount)));
      }
      if (row.is_suspicious) {
        bucket.suspiciousCount++;
      }
    }

    // Convert to response entries (sorted DESC by date)
    const entries: Array<{
      date: string;
      totalCount: number;
      totalAmountNative: string;
      totalAmountUsd: number | null;
      suspiciousCount: number;
    }> = [];

    // Get native token price for USD conversion if available
    let nativePriceUsd: number | null = null;
    if (deps.priceOracle && chain) {
      try {
        const priceInfo = await deps.priceOracle.getNativePrice(chain as ChainType);
        nativePriceUsd = priceInfo.usdPrice;
      } catch {
        // Price unavailable -- totalAmountUsd will be null
      }
    }

    for (const [date, bucket] of buckets) {
      let totalAmountUsd: number | null = null;

      if (nativePriceUsd !== null) {
        // Convert BigInt lamports/wei to human-readable amount then multiply by USD price
        // Note: This is an approximation -- proper decimals handling would need chain context
        const amountNum = Number(bucket.totalAmount);
        if (Number.isFinite(amountNum)) {
          totalAmountUsd = amountNum * nativePriceUsd;
        }
      }

      entries.push({
        date,
        totalCount: bucket.totalCount,
        totalAmountNative: bucket.totalAmount.toString(),
        totalAmountUsd,
        suspiciousCount: bucket.suspiciousCount,
      });
    }

    return c.json(
      {
        period,
        entries,
      },
      200,
    );
  });

  return router;
}
