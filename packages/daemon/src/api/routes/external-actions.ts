/**
 * External Actions query routes.
 *
 * GET /v1/wallets/:id/actions       - List off-chain actions (venue/status filter + pagination)
 * GET /v1/wallets/:id/actions/:actionId - Off-chain action detail
 *
 * These endpoints query the transactions table filtering by action_kind IN ('signedData','signedHttp').
 * SessionAuth is applied at server level (wallets/:id/actions/* matches sessionAuth wildcard).
 *
 * @since v31.12
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../../infrastructure/database/schema.js';
import { transactions } from '../../infrastructure/database/schema.js';
import {
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExternalActionQueryDeps {
  db: BetterSQLite3Database<typeof schema>;
}

// ---------------------------------------------------------------------------
// OpenAPI schemas
// ---------------------------------------------------------------------------

const ExternalActionItemSchema = z.object({
  id: z.string(),
  actionKind: z.string(),
  venue: z.string().nullable(),
  operation: z.string().nullable(),
  status: z.string(),
  bridgeStatus: z.string().nullable(),
  createdAt: z.number().int(),
  provider: z.string().nullable(),
  actionName: z.string().nullable(),
});

const ExternalActionDetailSchema = ExternalActionItemSchema.extend({
  metadata: z.record(z.unknown()).nullable(),
  bridgeMetadata: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  txHash: z.string().nullable(),
});

const ExternalActionsListResponseSchema = z.object({
  actions: z.array(ExternalActionItemSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const listExternalActionsRoute = createRoute({
  method: 'get',
  path: '/wallets/{walletId}/actions',
  tags: ['External Actions'],
  summary: 'List off-chain actions for a wallet',
  description: 'Returns off-chain (signedData/signedHttp) action history with venue/status filters and pagination.',
  request: {
    params: z.object({
      walletId: z.string().uuid(),
    }),
    query: z.object({
      venue: z.string().optional(),
      status: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      description: 'Off-chain action list',
      content: { 'application/json': { schema: ExternalActionsListResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const getExternalActionRoute = createRoute({
  method: 'get',
  path: '/wallets/{walletId}/actions/{actionId}',
  tags: ['External Actions'],
  summary: 'Get off-chain action detail',
  description: 'Returns full details of a single off-chain action including metadata and tracking info.',
  request: {
    params: z.object({
      walletId: z.string().uuid(),
      actionId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Off-chain action detail',
      content: { 'application/json': { schema: ExternalActionDetailSchema } },
    },
    ...buildErrorResponses(['ACTION_NOT_FOUND', 'WALLET_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OFF_CHAIN_KINDS = ['signedData', 'signedHttp'] as const;

function parseJsonSafe(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function externalActionRoutes(deps: ExternalActionQueryDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // -------------------------------------------------------------------------
  // GET /wallets/:walletId/actions
  // -------------------------------------------------------------------------

  router.openapi(listExternalActionsRoute, async (c) => {
    const { walletId } = c.req.valid('param');
    const { venue, status, limit, offset } = c.req.valid('query');

    // Build WHERE conditions
    const conditions = [
      eq(transactions.walletId, walletId),
      inArray(transactions.actionKind, [...OFF_CHAIN_KINDS]),
    ];

    if (venue) {
      conditions.push(eq(transactions.venue, venue));
    }
    if (status) {
      conditions.push(eq(transactions.status, status));
    }

    // Count total
    const countResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(and(...conditions))
      .get();
    const total = countResult?.count ?? 0;

    // Query with pagination
    const rows = deps.db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(sql`created_at DESC`)
      .limit(limit)
      .offset(offset)
      .all();

    const actions = rows.map((row) => {
      const meta = parseJsonSafe(row.metadata as string);
      return {
        id: row.id,
        actionKind: row.actionKind,
        venue: row.venue,
        operation: row.operation,
        status: row.status,
        bridgeStatus: row.bridgeStatus,
        createdAt: row.createdAt instanceof Date
          ? Math.floor(row.createdAt.getTime() / 1000)
          : (row.createdAt as number),
        provider: meta?.provider as string ?? null,
        actionName: meta?.action as string ?? null,
      };
    });

    return c.json({ actions, total, limit, offset }, 200);
  });

  // -------------------------------------------------------------------------
  // GET /wallets/:walletId/actions/:actionId
  // -------------------------------------------------------------------------

  router.openapi(getExternalActionRoute, async (c) => {
    const { walletId, actionId } = c.req.valid('param');

    const row = deps.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, actionId),
          eq(transactions.walletId, walletId),
          inArray(transactions.actionKind, [...OFF_CHAIN_KINDS]),
        ),
      )
      .get();

    if (!row) {
      throw new WAIaaSError('ACTION_NOT_FOUND', {
        message: `Off-chain action '${actionId}' not found`,
        details: { walletId, actionId },
      });
    }

    const meta = parseJsonSafe(row.metadata as string);
    const bridgeMeta = parseJsonSafe(row.bridgeMetadata as string);

    return c.json({
      id: row.id,
      actionKind: row.actionKind,
      venue: row.venue,
      operation: row.operation,
      status: row.status,
      bridgeStatus: row.bridgeStatus,
      createdAt: row.createdAt instanceof Date
        ? Math.floor(row.createdAt.getTime() / 1000)
        : (row.createdAt as number),
      provider: meta?.provider as string ?? null,
      actionName: meta?.action as string ?? null,
      metadata: meta,
      bridgeMetadata: bridgeMeta,
      error: row.error,
      txHash: row.txHash,
    }, 200);
  });

  return router;
}
