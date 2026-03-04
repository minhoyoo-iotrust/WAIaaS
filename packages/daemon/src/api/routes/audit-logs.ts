/**
 * Audit log query route: GET /v1/audit-logs
 *
 * Cursor-based pagination with 6 filters (wallet_id, event_type, severity,
 * from, to, tx_id). Protected by masterAuth.
 *
 * @see .planning/milestones/v30.0-phases/305/DESIGN-SPEC.md (OPS-02)
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import {
  AuditLogQuerySchema,
  AuditLogResponseSchema,
} from '@waiaas/core';
import type { AuditEventType, AuditSeverity } from '@waiaas/core';
import { buildErrorResponses, openApiValidationHook } from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogRouteDeps {
  sqlite: SQLiteDatabase;
}

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

const getAuditLogsRoute = createRoute({
  method: 'get',
  path: '/audit-logs',
  tags: ['Admin'],
  summary: 'Query audit logs with cursor pagination',
  description:
    'Returns audit log entries filtered by wallet, event type, severity, time range, or transaction ID. Requires master auth.',
  request: {
    query: AuditLogQuerySchema,
  },
  responses: {
    200: {
      description: 'Audit log entries',
      content: {
        'application/json': {
          schema: AuditLogResponseSchema,
        },
      },
    },
    ...buildErrorResponses(['INVALID_MASTER_PASSWORD']),
  },
});

// ---------------------------------------------------------------------------
// WHERE clause builder (shared between data query and total count)
// ---------------------------------------------------------------------------

interface WhereResult {
  clause: string;
  params: unknown[];
}

function buildWhereClause(
  query: {
    wallet_id?: string;
    event_type?: string;
    severity?: string;
    from?: number;
    to?: number;
    tx_id?: string;
  },
  opts?: { includeCursor?: { cursor: number } },
): WhereResult {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.wallet_id) {
    conditions.push('wallet_id = ?');
    params.push(query.wallet_id);
  }
  if (query.event_type) {
    conditions.push('event_type = ?');
    params.push(query.event_type);
  }
  if (query.severity) {
    conditions.push('severity = ?');
    params.push(query.severity);
  }
  if (query.from !== undefined) {
    conditions.push('timestamp >= ?');
    params.push(query.from);
  }
  if (query.to !== undefined) {
    conditions.push('timestamp <= ?');
    params.push(query.to);
  }
  if (query.tx_id) {
    conditions.push('tx_id = ?');
    params.push(query.tx_id);
  }
  if (opts?.includeCursor) {
    conditions.push('id < ?');
    params.push(opts.includeCursor.cursor);
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, params };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function auditLogRoutes(deps: AuditLogRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(getAuditLogsRoute, (c) => {
    const query = c.req.valid('query');
    const limit = query.limit ?? 50;

    // Build WHERE clause with cursor
    const cursorOpt = query.cursor ? { cursor: query.cursor } : undefined;
    const { clause: whereClause, params } = buildWhereClause(query, {
      includeCursor: cursorOpt,
    });

    // Fetch limit + 1 to determine hasMore
    const sql = `SELECT id, timestamp, event_type, actor, wallet_id, session_id, tx_id, details, severity, ip_address FROM audit_log ${whereClause} ORDER BY id DESC LIMIT ?`;
    params.push(limit + 1);

    const rows = deps.sqlite.prepare(sql).all(...params) as Array<{
      id: number;
      timestamp: number;
      event_type: string;
      actor: string;
      wallet_id: string | null;
      session_id: string | null;
      tx_id: string | null;
      details: string;
      severity: string;
      ip_address: string | null;
    }>;

    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type as AuditEventType,
      actor: row.actor,
      walletId: row.wallet_id,
      sessionId: row.session_id,
      txId: row.tx_id,
      details: JSON.parse(row.details) as Record<string, unknown>,
      severity: row.severity as AuditSeverity,
      ipAddress: row.ip_address,
    }));

    const nextCursor =
      hasMore && data.length > 0 ? data[data.length - 1]!.id : null;

    // Optional total count (without cursor filter)
    let total: number | undefined;
    if (query.include_total) {
      const { clause: totalWhere, params: totalParams } = buildWhereClause(query);
      const countRow = deps.sqlite
        .prepare(`SELECT COUNT(*) AS cnt FROM audit_log ${totalWhere}`)
        .get(...totalParams) as { cnt: number };
      total = countRow.cnt;
    }

    return c.json(
      {
        data,
        nextCursor,
        hasMore,
        ...(total !== undefined && { total }),
      },
      200,
    );
  });

  return router;
}
