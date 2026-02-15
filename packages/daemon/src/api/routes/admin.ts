/**
 * Admin route handlers: 12 daemon administration endpoints.
 *
 * GET    /admin/status              - Daemon health/uptime/version (masterAuth)
 * POST   /admin/kill-switch         - Activate kill switch (masterAuth)
 * GET    /admin/kill-switch         - Get kill switch state (public)
 * POST   /admin/recover             - Deactivate kill switch (masterAuth)
 * POST   /admin/shutdown            - Graceful daemon shutdown (masterAuth)
 * POST   /admin/rotate-secret       - Rotate JWT secret (masterAuth)
 * GET    /admin/notifications/status - Notification channel status (masterAuth)
 * POST   /admin/notifications/test   - Send test notification (masterAuth)
 * GET    /admin/notifications/log    - Query notification logs (masterAuth)
 * GET    /admin/settings            - Get all settings (masterAuth)
 * PUT    /admin/settings            - Update settings (masterAuth)
 * POST   /admin/settings/test-rpc   - Test RPC connectivity (masterAuth)
 *
 * @see docs/37-rest-api-complete-spec.md
 * @see docs/36-killswitch-evm-freeze.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { sql, desc, eq, and, count as drizzleCount } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { INotificationChannel, NotificationPayload } from '@waiaas/core';
import type { JwtSecretManager } from '../../infrastructure/jwt/jwt-secret-manager.js';
import { wallets, sessions, notificationLogs, policies, transactions } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { SettingsService } from '../../infrastructure/settings/index.js';
import { getSettingDefinition } from '../../infrastructure/settings/index.js';
import {
  AdminStatusResponseSchema,
  KillSwitchResponseSchema,
  KillSwitchActivateResponseSchema,
  RecoverResponseSchema,
  ShutdownResponseSchema,
  RotateSecretResponseSchema,
  NotificationStatusResponseSchema,
  NotificationTestRequestSchema,
  NotificationTestResponseSchema,
  NotificationLogResponseSchema,
  SettingsResponseSchema,
  SettingsUpdateRequestSchema,
  SettingsUpdateResponseSchema,
  TestRpcRequestSchema,
  TestRpcResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KillSwitchState {
  state: string;
  activatedAt: number | null;
  activatedBy: string | null;
}

export interface AdminRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  jwtSecretManager?: JwtSecretManager;
  getKillSwitchState: () => KillSwitchState;
  setKillSwitchState: (state: string, activatedBy?: string) => void;
  requestShutdown?: () => void;
  startTime: number; // epoch seconds
  version: string;
  adminTimeout: number;
  notificationService?: NotificationService;
  notificationConfig?: DaemonConfig['notifications'];
  settingsService?: SettingsService;
  onSettingsChanged?: (changedKeys: string[]) => void;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const statusRoute = createRoute({
  method: 'get',
  path: '/admin/status',
  tags: ['Admin'],
  summary: 'Get daemon status',
  responses: {
    200: {
      description: 'Daemon status',
      content: { 'application/json': { schema: AdminStatusResponseSchema } },
    },
  },
});

const activateKillSwitchRoute = createRoute({
  method: 'post',
  path: '/admin/kill-switch',
  tags: ['Admin'],
  summary: 'Activate kill switch',
  responses: {
    200: {
      description: 'Kill switch activated',
      content: { 'application/json': { schema: KillSwitchActivateResponseSchema } },
    },
    ...buildErrorResponses(['KILL_SWITCH_ACTIVE']),
  },
});

const getKillSwitchRoute = createRoute({
  method: 'get',
  path: '/admin/kill-switch',
  tags: ['Admin'],
  summary: 'Get kill switch state',
  responses: {
    200: {
      description: 'Kill switch state',
      content: { 'application/json': { schema: KillSwitchResponseSchema } },
    },
  },
});

const recoverRoute = createRoute({
  method: 'post',
  path: '/admin/recover',
  tags: ['Admin'],
  summary: 'Deactivate kill switch',
  responses: {
    200: {
      description: 'Kill switch deactivated',
      content: { 'application/json': { schema: RecoverResponseSchema } },
    },
    ...buildErrorResponses(['KILL_SWITCH_NOT_ACTIVE']),
  },
});

const shutdownRoute = createRoute({
  method: 'post',
  path: '/admin/shutdown',
  tags: ['Admin'],
  summary: 'Initiate graceful shutdown',
  responses: {
    200: {
      description: 'Shutdown initiated',
      content: { 'application/json': { schema: ShutdownResponseSchema } },
    },
  },
});

const rotateSecretRoute = createRoute({
  method: 'post',
  path: '/admin/rotate-secret',
  tags: ['Admin'],
  summary: 'Rotate JWT secret',
  responses: {
    200: {
      description: 'JWT secret rotated',
      content: { 'application/json': { schema: RotateSecretResponseSchema } },
    },
    ...buildErrorResponses(['ROTATION_TOO_RECENT']),
  },
});

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
// Settings route definitions
// ---------------------------------------------------------------------------

const settingsGetRoute = createRoute({
  method: 'get',
  path: '/admin/settings',
  tags: ['Admin'],
  summary: 'Get all settings grouped by category',
  responses: {
    200: {
      description: 'All settings with credentials masked as boolean',
      content: { 'application/json': { schema: SettingsResponseSchema } },
    },
  },
});

const settingsPutRoute = createRoute({
  method: 'put',
  path: '/admin/settings',
  tags: ['Admin'],
  summary: 'Update settings',
  request: {
    body: {
      content: { 'application/json': { schema: SettingsUpdateRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Updated settings',
      content: { 'application/json': { schema: SettingsUpdateResponseSchema } },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED']),
  },
});

const testRpcRoute = createRoute({
  method: 'post',
  path: '/admin/settings/test-rpc',
  tags: ['Admin'],
  summary: 'Test RPC endpoint connectivity',
  request: {
    body: {
      content: { 'application/json': { schema: TestRpcRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'RPC connectivity test result',
      content: { 'application/json': { schema: TestRpcResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create admin route sub-router.
 *
 * GET  /admin/status              - Daemon health info (masterAuth)
 * POST /admin/kill-switch         - Activate kill switch (masterAuth)
 * GET  /admin/kill-switch         - Get kill switch state (public)
 * POST /admin/recover             - Deactivate kill switch (masterAuth)
 * POST /admin/shutdown            - Graceful shutdown (masterAuth)
 * POST /admin/rotate-secret       - Rotate JWT secret (masterAuth)
 * GET  /admin/notifications/status - Notification channel status (masterAuth)
 * POST /admin/notifications/test   - Send test notification (masterAuth)
 * GET  /admin/notifications/log    - Query notification logs (masterAuth)
 * GET  /admin/settings            - Get all settings (masterAuth)
 * PUT  /admin/settings            - Update settings (masterAuth)
 * POST /admin/settings/test-rpc   - Test RPC connectivity (masterAuth)
 */
export function adminRoutes(deps: AdminRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // ---------------------------------------------------------------------------
  // GET /admin/status
  // ---------------------------------------------------------------------------

  router.openapi(statusRoute, async (c) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const uptime = nowSec - deps.startTime;

    // Count wallets
    const walletCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(wallets)
      .get();
    const walletCount = walletCountResult?.count ?? 0;

    // Count active sessions (not expired, not revoked)
    // Use raw SQL with integer comparison (expiresAt is stored as epoch seconds)
    const activeSessionResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(
        sql`${sessions.revokedAt} IS NULL AND ${sessions.expiresAt} > ${nowSec}`,
      )
      .get();
    const activeSessionCount = activeSessionResult?.count ?? 0;

    // Count policies
    const policyCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(policies)
      .get();
    const policyCount = policyCountResult?.count ?? 0;

    // Count recent transactions (24h) -- created_at stored as epoch seconds in integer column
    const cutoffSec = nowSec - 86400;
    const recentTxCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(sql`${transactions.createdAt} > ${cutoffSec}`)
      .get();
    const recentTxCount = recentTxCountResult?.count ?? 0;

    // Count failed transactions (24h)
    const failedTxCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(
        sql`${transactions.status} = 'FAILED' AND ${transactions.createdAt} > ${cutoffSec}`,
      )
      .get();
    const failedTxCount = failedTxCountResult?.count ?? 0;

    // Recent 5 transactions with wallet name
    const recentTxRows = deps.db
      .select({
        id: transactions.id,
        walletId: transactions.walletId,
        walletName: wallets.name,
        type: transactions.type,
        status: transactions.status,
        toAddress: transactions.toAddress,
        amount: transactions.amount,
        network: transactions.network,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .orderBy(desc(transactions.createdAt))
      .limit(5)
      .all();

    const recentTransactions = recentTxRows.map((tx) => ({
      id: tx.id,
      walletId: tx.walletId,
      walletName: tx.walletName ?? null,
      type: tx.type,
      status: tx.status,
      toAddress: tx.toAddress ?? null,
      amount: tx.amount ?? null,
      network: tx.network ?? null,
      createdAt: tx.createdAt instanceof Date
        ? Math.floor(tx.createdAt.getTime() / 1000)
        : (typeof tx.createdAt === 'number' ? tx.createdAt : null),
    }));

    const ksState = deps.getKillSwitchState();

    return c.json(
      {
        status: 'running',
        version: deps.version,
        uptime,
        walletCount,
        activeSessionCount,
        killSwitchState: ksState.state,
        adminTimeout: deps.adminTimeout,
        timestamp: nowSec,
        policyCount,
        recentTxCount,
        failedTxCount,
        recentTransactions,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /admin/kill-switch
  // ---------------------------------------------------------------------------

  router.openapi(activateKillSwitchRoute, async (c) => {
    const ksState = deps.getKillSwitchState();

    if (ksState.state === 'ACTIVATED') {
      throw new WAIaaSError('KILL_SWITCH_ACTIVE', {
        message: 'Kill switch is already activated',
      });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    deps.setKillSwitchState('ACTIVATED', 'master');

    return c.json(
      {
        state: 'ACTIVATED' as const,
        activatedAt: nowSec,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /admin/kill-switch
  // ---------------------------------------------------------------------------

  router.openapi(getKillSwitchRoute, async (c) => {
    const ksState = deps.getKillSwitchState();

    return c.json(
      {
        state: ksState.state,
        activatedAt: ksState.activatedAt,
        activatedBy: ksState.activatedBy,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /admin/recover
  // ---------------------------------------------------------------------------

  router.openapi(recoverRoute, async (c) => {
    const ksState = deps.getKillSwitchState();

    if (ksState.state !== 'ACTIVATED') {
      throw new WAIaaSError('KILL_SWITCH_NOT_ACTIVE', {
        message: 'Kill switch is not active, nothing to recover',
      });
    }

    deps.setKillSwitchState('NORMAL');
    const nowSec = Math.floor(Date.now() / 1000);

    return c.json(
      {
        state: 'NORMAL' as const,
        recoveredAt: nowSec,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /admin/shutdown
  // ---------------------------------------------------------------------------

  router.openapi(shutdownRoute, async (c) => {
    if (deps.requestShutdown) {
      deps.requestShutdown();
    }

    return c.json(
      {
        message: 'Shutdown initiated',
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /admin/rotate-secret
  // ---------------------------------------------------------------------------

  router.openapi(rotateSecretRoute, async (c) => {
    if (!deps.jwtSecretManager) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'JWT secret manager not available',
      });
    }

    await deps.jwtSecretManager.rotateSecret();
    const nowSec = Math.floor(Date.now() / 1000);

    return c.json(
      {
        rotatedAt: nowSec,
        message: 'JWT secret rotated. Old tokens valid for 5 minutes.',
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /admin/notifications/status
  // ---------------------------------------------------------------------------

  router.openapi(notificationsStatusRoute, async (c) => {
    const notifConfig = deps.notificationConfig;
    const svc = deps.notificationService;
    const channelNames = svc ? svc.getChannelNames() : [];

    const channels = [
      {
        name: 'telegram',
        enabled: !!(
          notifConfig?.telegram_bot_token &&
          notifConfig?.telegram_chat_id &&
          channelNames.includes('telegram')
        ),
      },
      {
        name: 'discord',
        enabled: !!(
          notifConfig?.discord_webhook_url &&
          channelNames.includes('discord')
        ),
      },
      {
        name: 'ntfy',
        enabled: !!(
          notifConfig?.ntfy_topic &&
          channelNames.includes('ntfy')
        ),
      },
    ];

    return c.json(
      {
        enabled: notifConfig?.enabled ?? false,
        channels,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /admin/notifications/test
  // ---------------------------------------------------------------------------

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
      message: '[Test] WAIaaS notification test',
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

  // ---------------------------------------------------------------------------
  // GET /admin/notifications/log
  // ---------------------------------------------------------------------------

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
      createdAt: row.createdAt instanceof Date
        ? Math.floor(row.createdAt.getTime() / 1000)
        : (typeof row.createdAt === 'number' ? row.createdAt : 0),
    }));

    return c.json({ logs, total, page, pageSize }, 200);
  });

  // ---------------------------------------------------------------------------
  // GET /admin/settings
  // ---------------------------------------------------------------------------

  router.openapi(settingsGetRoute, async (c) => {
    if (!deps.settingsService) {
      return c.json(
        {
          notifications: {} as Record<string, string | boolean>,
          rpc: {} as Record<string, string | boolean>,
          security: {} as Record<string, string | boolean>,
          daemon: {} as Record<string, string | boolean>,
          walletconnect: {} as Record<string, string | boolean>,
        },
        200,
      );
    }

    const masked = deps.settingsService.getAllMasked();
    return c.json(
      {
        notifications: masked.notifications ?? {},
        rpc: masked.rpc ?? {},
        security: masked.security ?? {},
        daemon: masked.daemon ?? {},
        walletconnect: masked.walletconnect ?? {},
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // PUT /admin/settings
  // ---------------------------------------------------------------------------

  router.openapi(settingsPutRoute, async (c) => {
    const body = c.req.valid('json');
    const entries = body.settings;

    // Validate all keys exist in SETTING_DEFINITIONS
    for (const entry of entries) {
      const def = getSettingDefinition(entry.key);
      if (!def) {
        throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
          message: `Unknown setting key: ${entry.key}`,
        });
      }
    }

    if (!deps.settingsService) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'Settings service not available',
      });
    }

    // Persist all values
    deps.settingsService.setMany(entries);

    // Notify hot-reload callback if provided
    if (deps.onSettingsChanged) {
      deps.onSettingsChanged(entries.map((e) => e.key));
    }

    const masked = deps.settingsService.getAllMasked();
    return c.json(
      {
        updated: entries.length,
        settings: {
          notifications: masked.notifications ?? {},
          rpc: masked.rpc ?? {},
          security: masked.security ?? {},
          daemon: masked.daemon ?? {},
          walletconnect: masked.walletconnect ?? {},
        },
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /admin/settings/test-rpc
  // ---------------------------------------------------------------------------

  router.openapi(testRpcRoute, async (c) => {
    const body = c.req.valid('json');
    const { url, chain } = body;

    const rpcMethod = chain === 'solana' ? 'getBlockHeight' : 'eth_blockNumber';
    const rpcBody = JSON.stringify({
      jsonrpc: '2.0',
      method: rpcMethod,
      params: [],
      id: 1,
    });

    const startMs = performance.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rpcBody,
        signal: AbortSignal.timeout(5000),
      });

      const latencyMs = Math.round(performance.now() - startMs);
      const result = (await response.json()) as {
        result?: unknown;
        error?: { message?: string };
      };

      if (result.error) {
        return c.json(
          {
            success: false,
            latencyMs,
            error: result.error.message ?? 'RPC error',
          },
          200,
        );
      }

      // Parse block number from result
      let blockNumber: number | undefined;
      if (chain === 'solana') {
        blockNumber = typeof result.result === 'number' ? result.result : undefined;
      } else {
        // eth_blockNumber returns hex string
        blockNumber =
          typeof result.result === 'string'
            ? parseInt(result.result, 16)
            : undefined;
      }

      return c.json(
        {
          success: true,
          latencyMs,
          blockNumber,
        },
        200,
      );
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startMs);
      const errorMessage = err instanceof Error ? err.message : String(err);

      return c.json(
        {
          success: false,
          latencyMs,
          error: errorMessage,
        },
        200,
      );
    }
  });

  return router;
}
