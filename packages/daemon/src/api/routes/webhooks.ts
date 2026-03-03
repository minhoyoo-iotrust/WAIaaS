/**
 * Webhook CRUD routes: POST /v1/webhooks, GET /v1/webhooks, DELETE /v1/webhooks/:id
 *
 * Manages webhook subscriptions for outbound event delivery.
 * Secret security model: generated as 64-char hex, stored as SHA-256 hash + AES-GCM encrypted,
 * returned once on POST, never exposed on GET.
 *
 * @see .planning/milestones/v30.0-phases/307/DESIGN-SPEC.md (OPS-04 section 6)
 */

import { randomBytes, createHash } from 'node:crypto';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import {
  CreateWebhookRequestSchema,
  WebhookResponseSchema,
  CreateWebhookResponseSchema,
  WAIaaSError,
} from '@waiaas/core';
import { encryptSettingValue } from '../../infrastructure/settings/settings-crypto.js';
import { generateId } from '../../infrastructure/database/id.js';
import { buildErrorResponses, openApiValidationHook } from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookRouteDeps {
  sqlite: SQLiteDatabase;
  masterPassword: string;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const postWebhookRoute = createRoute({
  method: 'post',
  path: '/webhooks',
  tags: ['Webhooks'],
  summary: 'Register a new webhook',
  description:
    'Creates a webhook subscription. Returns a 64-char hex secret (one-time only). The secret is stored encrypted and never returned again.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateWebhookRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Webhook created with secret (one-time)',
      content: {
        'application/json': {
          schema: CreateWebhookResponseSchema,
        },
      },
    },
    ...buildErrorResponses(['INVALID_MASTER_PASSWORD']),
  },
});

const getWebhooksRoute = createRoute({
  method: 'get',
  path: '/webhooks',
  tags: ['Webhooks'],
  summary: 'List all webhooks',
  description: 'Returns all registered webhooks. Secret is never exposed.',
  responses: {
    200: {
      description: 'Webhook list',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(WebhookResponseSchema),
          }),
        },
      },
    },
    ...buildErrorResponses(['INVALID_MASTER_PASSWORD']),
  },
});

const deleteWebhookRoute = createRoute({
  method: 'delete',
  path: '/webhooks/{id}',
  tags: ['Webhooks'],
  summary: 'Delete a webhook',
  description: 'Deletes a webhook and CASCADE-deletes associated delivery logs.',
  request: {
    params: z.object({
      id: z.string().uuid(),
    }),
  },
  responses: {
    204: {
      description: 'Webhook deleted',
    },
    ...buildErrorResponses(['INVALID_MASTER_PASSWORD', 'WEBHOOK_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export function webhookRoutes(deps: WebhookRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // POST /v1/webhooks -- register
  router.openapi(postWebhookRoute, (c) => {
    const body = c.req.valid('json');

    // Generate secret
    const secret = randomBytes(32).toString('hex'); // 64-char hex
    const secretHash = createHash('sha256').update(secret).digest('hex');
    const secretEncrypted = encryptSettingValue(secret, deps.masterPassword);

    const id = generateId();
    const now = Math.floor(Date.now() / 1000);
    const events = body.events ?? [];
    const description = body.description ?? null;

    deps.sqlite
      .prepare(
        `INSERT INTO webhooks (id, url, secret_hash, secret_encrypted, events, description, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(id, body.url, secretHash, secretEncrypted, JSON.stringify(events), description, now, now);

    return c.json(
      {
        id,
        url: body.url,
        events: events as string[],
        description,
        enabled: true,
        secret,
        createdAt: now,
        updatedAt: now,
      },
      201,
    );
  });

  // GET /v1/webhooks -- list
  router.openapi(getWebhooksRoute, (c) => {
    const rows = deps.sqlite
      .prepare(
        'SELECT id, url, events, description, enabled, created_at, updated_at FROM webhooks ORDER BY created_at DESC',
      )
      .all() as Array<{
      id: string;
      url: string;
      events: string;
      description: string | null;
      enabled: number;
      created_at: number;
      updated_at: number;
    }>;

    const data = rows.map((row) => ({
      id: row.id,
      url: row.url,
      events: JSON.parse(row.events) as string[],
      description: row.description,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json({ data }, 200);
  });

  // DELETE /v1/webhooks/:id
  router.openapi(deleteWebhookRoute, (c) => {
    const { id } = c.req.valid('param');

    // Check exists
    const existing = deps.sqlite
      .prepare('SELECT id FROM webhooks WHERE id = ?')
      .get(id) as { id: string } | undefined;

    if (!existing) {
      throw new WAIaaSError('WEBHOOK_NOT_FOUND');
    }

    // Enable foreign keys for CASCADE
    deps.sqlite.exec('PRAGMA foreign_keys = ON');
    deps.sqlite.prepare('DELETE FROM webhooks WHERE id = ?').run(id);

    return c.body(null, 204);
  });

  return router;
}
