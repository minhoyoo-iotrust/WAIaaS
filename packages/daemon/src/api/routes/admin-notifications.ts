/**
 * Admin Notification route handlers: status, test, log.
 *
 * Extracted from admin.ts for maintainability.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute, z } from '@hono/zod-openapi';
import { desc, eq, and, gte, lte, count as drizzleCount } from 'drizzle-orm';
import type { INotificationChannel, NotificationPayload } from '@waiaas/core';
import { notificationLogs } from '../../infrastructure/database/schema.js';
import {
  NotificationStatusResponseSchema,
  NotificationTestRequestSchema,
  NotificationTestResponseSchema,
  NotificationLogResponseSchema,
} from './openapi-schemas.js';
import type { AdminRouteDeps } from './admin.js';

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const notificationsStatusRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/status',
  tags: ['Admin'],
  summary: 'Get notification channel status',
  responses: {
    200: {
      description: 'Notification channel status (no credentials)',
      content: { 'application/json': { schema: NotificationStatusResponseSchema } },
    },
  },
});

const notificationsTestRoute = createRoute({
  method: 'post',
  path: '/admin/notifications/test',
  tags: ['Admin'],
  summary: 'Send test notification',
  request: {
    body: {
      content: { 'application/json': { schema: NotificationTestRequestSchema } },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Test notification results',
      content: { 'application/json': { schema: NotificationTestResponseSchema } },
    },
  },
});

const notificationLogQuerySchema = z.object({
  page: z.string().optional().default('1'),
  pageSize: z.string().optional().default('20'),
  channel: z.string().optional(),
  status: z.string().optional(),
  eventType: z.string().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
});

const notificationsLogRoute = createRoute({
  method: 'get',
  path: '/admin/notifications/log',
  tags: ['Admin'],
  summary: 'Query notification delivery logs',
  request: {
    query: notificationLogQuerySchema,
  },
  responses: {
    200: {
      description: 'Paginated notification logs',
      content: { 'application/json': { schema: NotificationLogResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Register handlers
// ---------------------------------------------------------------------------

export function registerAdminNotificationRoutes(router: OpenAPIHono, deps: AdminRouteDeps): void {
  // GET /admin/notifications/status
  router.openapi(notificationsStatusRoute, async (c) => {
    const ss = deps.settingsService;
    const svc = deps.notificationService;
    const channelNames = svc ? svc.getChannelNames() : [];

    // Read from SettingsService (dynamic) instead of static config snapshot
    const enabled = ss ? ss.get('notifications.enabled') === 'true' : (deps.notificationConfig?.enabled ?? false);

    const channels = [
      {
        name: 'telegram',
        enabled: !!(
          (ss ? ss.get('notifications.telegram_bot_token') : deps.notificationConfig?.telegram_bot_token) &&
          (ss ? ss.get('notifications.telegram_chat_id') : deps.notificationConfig?.telegram_chat_id) &&
          channelNames.includes('telegram')
        ),
      },
      {
        name: 'discord',
        enabled: !!(
          (ss ? ss.get('notifications.discord_webhook_url') : deps.notificationConfig?.discord_webhook_url) &&
          channelNames.includes('discord')
        ),
      },
      {
        name: 'slack',
        enabled: !!(
          (ss ? ss.get('notifications.slack_webhook_url') : deps.notificationConfig?.slack_webhook_url) &&
          channelNames.includes('slack')
        ),
      },
    ];

    return c.json(
      {
        enabled,
        channels,
      },
      200,
    );
  });

  // POST /admin/notifications/test
  router.openapi(notificationsTestRoute, async (c) => {
    const svc = deps.notificationService;
    if (!svc) {
      return c.json({ results: [] }, 200);
    }

    const body = await c.req.json().catch(() => ({})) as { channel?: string };
    const allChannels = svc.getChannels();
    const targetChannels = body.channel
      ? allChannels.filter((ch: INotificationChannel) => ch.name === body.channel)
      : allChannels;

    const testPayload: NotificationPayload = {
      eventType: 'TX_CONFIRMED',
      walletId: 'admin-test',
      title: '[Test] Notification Test',
      body: 'WAIaaS notification test',
      message: '[Test] Notification Test\nWAIaaS notification test',
      timestamp: Math.floor(Date.now() / 1000),
    };

    const results: Array<{ channel: string; success: boolean; error?: string }> = [];

    for (const ch of targetChannels) {
      try {
        await ch.send(testPayload);
        results.push({ channel: ch.name, success: true });
      } catch (err) {
        results.push({
          channel: ch.name,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return c.json({ results }, 200);
  });

  // GET /admin/notifications/log
  router.openapi(notificationsLogRoute, async (c) => {
    const query = c.req.valid('query');
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10) || 20));
    const offset = (page - 1) * pageSize;

    // Build where conditions
    const conditions = [];
    if (query.channel) {
      conditions.push(eq(notificationLogs.channel, query.channel));
    }
    if (query.status) {
      conditions.push(eq(notificationLogs.status, query.status));
    }
    if (query.eventType) {
      conditions.push(eq(notificationLogs.eventType, query.eventType));
    }
    if (query.since) {
      const sinceTs = parseInt(query.since, 10);
      if (!isNaN(sinceTs)) {
        conditions.push(gte(notificationLogs.createdAt, new Date(sinceTs * 1000)));
      }
    }
    if (query.until) {
      const untilTs = parseInt(query.until, 10);
      if (!isNaN(untilTs)) {
        conditions.push(lte(notificationLogs.createdAt, new Date(untilTs * 1000)));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Query total count
    const totalResult = deps.db
      .select({ count: drizzleCount() })
      .from(notificationLogs)
      .where(whereClause)
      .get();
    const total = totalResult?.count ?? 0;

    // Query logs with pagination
    const rows = deps.db
      .select()
      .from(notificationLogs)
      .where(whereClause)
      .orderBy(desc(notificationLogs.createdAt))
      .limit(pageSize)
      .offset(offset)
      .all();

    const logs = rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      walletId: row.walletId ?? null,
      channel: row.channel,
      status: row.status,
      error: row.error ?? null,
      message: row.message ?? null,
      createdAt: row.createdAt instanceof Date
        ? Math.floor(row.createdAt.getTime() / 1000)
        : (typeof row.createdAt === 'number' ? row.createdAt : 0),
    }));

    return c.json({ logs, total, page, pageSize }, 200);
  });
}
