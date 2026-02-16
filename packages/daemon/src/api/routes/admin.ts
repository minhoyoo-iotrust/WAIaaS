/**
 * Admin route handlers: 17 daemon administration endpoints.
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
 * GET    /admin/oracle-status       - Oracle cache/source/cross-validation status (masterAuth)
 * GET    /admin/api-keys            - List Action Provider API key status (masterAuth)
 * PUT    /admin/api-keys/:provider  - Set or update API key (masterAuth)
 * DELETE /admin/api-keys/:provider  - Delete API key (masterAuth)
 * GET    /admin/forex/rates         - Forex exchange rates for display currency (masterAuth)
 *
 * @see docs/37-rest-api-complete-spec.md
 * @see docs/36-killswitch-evm-freeze.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { sql, desc, eq, and, count as drizzleCount } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError, getDefaultNetwork } from '@waiaas/core';
import type { INotificationChannel, NotificationPayload, ChainType, EnvironmentType, NetworkType, IPriceOracle, IForexRateService, CurrencyCode } from '@waiaas/core';
import { CurrencyCodeSchema, formatRatePreview } from '@waiaas/core';
import type { JwtSecretManager } from '../../infrastructure/jwt/jwt-secret-manager.js';
import { wallets, sessions, notificationLogs, policies, transactions } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { SettingsService } from '../../infrastructure/settings/index.js';
import { getSettingDefinition } from '../../infrastructure/settings/index.js';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import type { ApiKeyStore } from '../../infrastructure/action/api-key-store.js';
import type { ActionProviderRegistry } from '../../infrastructure/action/action-provider-registry.js';
import type { KillSwitchService } from '../../services/kill-switch-service.js';
import {
  AdminStatusResponseSchema,
  KillSwitchResponseSchema,
  KillSwitchActivateResponseSchema,
  KillSwitchEscalateResponseSchema,
  RecoverResponseSchema,
  KillSwitchRecoverRequestSchema,
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
  OracleStatusResponseSchema,
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
  killSwitchService?: KillSwitchService;
  requestShutdown?: () => void;
  startTime: number; // epoch seconds
  version: string;
  adminTimeout: number;
  notificationService?: NotificationService;
  notificationConfig?: DaemonConfig['notifications'];
  settingsService?: SettingsService;
  onSettingsChanged?: (changedKeys: string[]) => void;
  adapterPool?: AdapterPool | null;
  daemonConfig?: DaemonConfig;
  priceOracle?: IPriceOracle;
  oracleConfig?: { coingeckoApiKeyConfigured: boolean; crossValidationThreshold: number };
  apiKeyStore?: ApiKeyStore;
  actionProviderRegistry?: ActionProviderRegistry;
  forexRateService?: IForexRateService;
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

const escalateKillSwitchRoute = createRoute({
  method: 'post',
  path: '/admin/kill-switch/escalate',
  tags: ['Admin'],
  summary: 'Escalate kill switch to LOCKED',
  responses: {
    200: {
      description: 'Kill switch escalated to LOCKED',
      content: { 'application/json': { schema: KillSwitchEscalateResponseSchema } },
    },
    ...buildErrorResponses(['INVALID_STATE_TRANSITION']),
  },
});

const recoverRoute = createRoute({
  method: 'post',
  path: '/admin/recover',
  tags: ['Admin'],
  summary: 'Recover from kill switch (dual-auth)',
  request: {
    body: {
      content: { 'application/json': { schema: KillSwitchRecoverRequestSchema } },
      required: false,
    },
  },
  responses: {
    200: {
      description: 'Kill switch deactivated',
      content: { 'application/json': { schema: RecoverResponseSchema } },
    },
    ...buildErrorResponses(['KILL_SWITCH_NOT_ACTIVE', 'INVALID_STATE_TRANSITION', 'INVALID_SIGNATURE']),
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
// Oracle status route definition
// ---------------------------------------------------------------------------

const oracleStatusRoute = createRoute({
  method: 'get',
  path: '/admin/oracle-status',
  tags: ['Admin'],
  summary: 'Get oracle cache statistics and source status',
  responses: {
    200: {
      description: 'Oracle status',
      content: { 'application/json': { schema: OracleStatusResponseSchema } },
    },
  },
});

// ---------------------------------------------------------------------------
// API Keys route definitions
// ---------------------------------------------------------------------------

const apiKeysListResponseSchema = z.object({
  keys: z.array(
    z.object({
      providerName: z.string(),
      hasKey: z.boolean(),
      maskedKey: z.string().nullable(),
      requiresApiKey: z.boolean(),
      updatedAt: z.string().nullable(),
    }),
  ),
});

const apiKeysListRoute = createRoute({
  method: 'get',
  path: '/admin/api-keys',
  tags: ['Admin'],
  summary: 'List Action Provider API key status',
  responses: {
    200: {
      description: 'API key status per provider',
      content: { 'application/json': { schema: apiKeysListResponseSchema } },
    },
  },
});

const apiKeyPutRoute = createRoute({
  method: 'put',
  path: '/admin/api-keys/{provider}',
  tags: ['Admin'],
  summary: 'Set or update Action Provider API key',
  request: {
    params: z.object({ provider: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({ apiKey: z.string().min(1) }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'API key saved',
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            providerName: z.string(),
          }),
        },
      },
    },
  },
});

const apiKeyDeleteRoute = createRoute({
  method: 'delete',
  path: '/admin/api-keys/{provider}',
  tags: ['Admin'],
  summary: 'Delete Action Provider API key',
  request: {
    params: z.object({ provider: z.string() }),
  },
  responses: {
    200: {
      description: 'API key deleted',
      content: {
        'application/json': {
          schema: z.object({ success: z.boolean() }),
        },
      },
    },
    ...buildErrorResponses(['ACTION_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Forex rates route definitions
// ---------------------------------------------------------------------------

const forexRatesQuerySchema = z.object({
  currencies: z.string().optional().openapi({
    description: 'Comma-separated currency codes (e.g. KRW,JPY,EUR). If omitted, returns empty.',
  }),
});

const forexRatesRoute = createRoute({
  method: 'get',
  path: '/admin/forex/rates',
  tags: ['Admin'],
  summary: 'Get forex exchange rates for display currencies',
  request: {
    query: forexRatesQuerySchema,
  },
  responses: {
    200: {
      description: 'Forex rates with preview strings',
      content: {
        'application/json': {
          schema: z.object({
            rates: z.record(
              z.string(),
              z.object({
                rate: z.number(),
                preview: z.string(),
              }),
            ),
          }),
        },
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Admin wallet route definitions
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
                network: z.string().nullable(),
                txHash: z.string().nullable(),
                createdAt: z.number().nullable(),
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
  summary: 'Get wallet balance (native + tokens)',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Wallet balance',
      content: {
        'application/json': {
          schema: z.object({
            native: z
              .object({
                balance: z.string(),
                symbol: z.string(),
                network: z.string(),
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
        },
      },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create admin route sub-router.
 *
 * GET    /admin/status              - Daemon health info (masterAuth)
 * POST   /admin/kill-switch         - Activate kill switch (masterAuth)
 * GET    /admin/kill-switch         - Get kill switch state (public)
 * POST   /admin/recover             - Deactivate kill switch (masterAuth)
 * POST   /admin/shutdown            - Graceful shutdown (masterAuth)
 * POST   /admin/rotate-secret       - Rotate JWT secret (masterAuth)
 * GET    /admin/notifications/status - Notification channel status (masterAuth)
 * POST   /admin/notifications/test   - Send test notification (masterAuth)
 * GET    /admin/notifications/log    - Query notification logs (masterAuth)
 * GET    /admin/settings            - Get all settings (masterAuth)
 * PUT    /admin/settings            - Update settings (masterAuth)
 * POST   /admin/settings/test-rpc   - Test RPC connectivity (masterAuth)
 * GET    /admin/oracle-status       - Oracle cache/source/cross-validation status (masterAuth)
 * GET    /admin/api-keys            - List Action Provider API key status (masterAuth)
 * PUT    /admin/api-keys/:provider  - Set or update API key (masterAuth)
 * DELETE /admin/api-keys/:provider  - Delete API key (masterAuth)
 * GET    /admin/forex/rates             - Forex exchange rates (masterAuth)
 * GET    /admin/wallets/:id/balance      - Wallet native+token balance (masterAuth)
 * GET    /admin/wallets/:id/transactions - Wallet transaction history (masterAuth)
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
        amountUsd: transactions.amountUsd,
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
      amountUsd: tx.amountUsd ?? null,
      network: tx.network ?? null,
      createdAt: tx.createdAt instanceof Date
        ? Math.floor(tx.createdAt.getTime() / 1000)
        : (typeof tx.createdAt === 'number' ? tx.createdAt : null),
    }));

    const ksState = deps.killSwitchService
      ? deps.killSwitchService.getState()
      : deps.getKillSwitchState();

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
    if (deps.killSwitchService) {
      const result = deps.killSwitchService.activateWithCascade('master');
      if (!result.success) {
        throw new WAIaaSError('KILL_SWITCH_ACTIVE', {
          message: result.error ?? 'Kill switch is already active',
        });
      }
      const state = deps.killSwitchService.getState();
      return c.json(
        {
          state: 'SUSPENDED' as const,
          activatedAt: state.activatedAt ?? Math.floor(Date.now() / 1000),
        },
        200,
      );
    }

    // Legacy fallback (no KillSwitchService)
    const ksState = deps.getKillSwitchState();
    if (ksState.state !== 'ACTIVE' && ksState.state !== 'NORMAL') {
      throw new WAIaaSError('KILL_SWITCH_ACTIVE', {
        message: 'Kill switch is already activated',
      });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    deps.setKillSwitchState('SUSPENDED', 'master');
    return c.json(
      {
        state: 'SUSPENDED' as const,
        activatedAt: nowSec,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /admin/kill-switch
  // ---------------------------------------------------------------------------

  router.openapi(getKillSwitchRoute, async (c) => {
    if (deps.killSwitchService) {
      const ksState = deps.killSwitchService.getState();
      return c.json(
        {
          state: ksState.state,
          activatedAt: ksState.activatedAt,
          activatedBy: ksState.activatedBy,
        },
        200,
      );
    }

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
  // POST /admin/kill-switch/escalate
  // ---------------------------------------------------------------------------

  router.openapi(escalateKillSwitchRoute, async (c) => {
    if (deps.killSwitchService) {
      const result = deps.killSwitchService.escalateWithCascade('master');
      if (!result.success) {
        throw new WAIaaSError('INVALID_STATE_TRANSITION', {
          message: result.error ?? 'Cannot escalate kill switch',
        });
      }
      const state = deps.killSwitchService.getState();
      return c.json(
        {
          state: 'LOCKED' as const,
          escalatedAt: state.activatedAt ?? Math.floor(Date.now() / 1000),
        },
        200,
      );
    }

    throw new WAIaaSError('INVALID_STATE_TRANSITION', {
      message: 'Kill switch service not available',
    });
  });

  // ---------------------------------------------------------------------------
  // POST /admin/recover (dual-auth recovery)
  // ---------------------------------------------------------------------------

  router.openapi(recoverRoute, async (c) => {
    if (deps.killSwitchService) {
      const currentState = deps.killSwitchService.getState();

      if (currentState.state === 'ACTIVE') {
        throw new WAIaaSError('KILL_SWITCH_NOT_ACTIVE', {
          message: 'Kill switch is not active, nothing to recover',
        });
      }

      // Check if any wallet has an owner registered (dual-auth requirement)
      const body = await c.req.json().catch(() => ({})) as {
        ownerSignature?: string;
        ownerAddress?: string;
        chain?: string;
        message?: string;
      };

      // Check if any wallet has owner_address set
      const walletsWithOwner = deps.db
        .select({ ownerAddress: wallets.ownerAddress })
        .from(wallets)
        .where(sql`${wallets.ownerAddress} IS NOT NULL`)
        .all();

      const hasOwners = walletsWithOwner.length > 0;

      if (hasOwners) {
        // Dual-auth: owner signature required
        if (!body.ownerSignature || !body.ownerAddress || !body.message) {
          throw new WAIaaSError('INVALID_SIGNATURE', {
            message: 'Owner signature required for recovery (dual-auth). Provide ownerSignature, ownerAddress, chain, and message.',
          });
        }

        // Verify owner address matches a registered wallet owner
        const matchingWallet = walletsWithOwner.find(
          (w) => w.ownerAddress === body.ownerAddress,
        );
        if (!matchingWallet) {
          throw new WAIaaSError('INVALID_SIGNATURE', {
            message: 'Owner address does not match any registered wallet owner',
          });
        }

        // Note: Full signature verification (SIWS/SIWE) is done by ownerAuth
        // middleware in production. For the recover endpoint, the masterAuth
        // middleware handles the master password part, and we verify owner
        // identity by matching ownerAddress to a registered wallet.
      }
      // If no owners registered: master-only recovery (skip owner verification)

      // LOCKED recovery: additional wait time (5 seconds)
      if (currentState.state === 'LOCKED') {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const success = deps.killSwitchService.recoverFromLocked();
        if (!success) {
          throw new WAIaaSError('INVALID_STATE_TRANSITION', {
            message: 'Failed to recover from LOCKED state (concurrent state change)',
          });
        }
      } else {
        // SUSPENDED recovery
        const success = deps.killSwitchService.recoverFromSuspended();
        if (!success) {
          throw new WAIaaSError('INVALID_STATE_TRANSITION', {
            message: 'Failed to recover from SUSPENDED state (concurrent state change)',
          });
        }
      }

      const nowSec = Math.floor(Date.now() / 1000);

      // Send recovery notification
      if (deps.notificationService) {
        void deps.notificationService.notify('KILL_SWITCH_RECOVERED', 'system', {});
      }

      return c.json(
        {
          state: 'ACTIVE' as const,
          recoveredAt: nowSec,
        },
        200,
      );
    }

    // Legacy fallback
    const ksState = deps.getKillSwitchState();
    if (ksState.state === 'NORMAL' || ksState.state === 'ACTIVE') {
      throw new WAIaaSError('KILL_SWITCH_NOT_ACTIVE', {
        message: 'Kill switch is not active, nothing to recover',
      });
    }
    deps.setKillSwitchState('ACTIVE');
    const nowSec = Math.floor(Date.now() / 1000);
    return c.json(
      {
        state: 'ACTIVE' as const,
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
      {
        name: 'slack',
        enabled: !!(
          notifConfig?.slack_webhook_url &&
          channelNames.includes('slack')
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
      message: row.message ?? null,
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
          oracle: {} as Record<string, string | boolean>,
          display: {} as Record<string, string | boolean>,
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
        oracle: masked.oracle ?? {},
        display: masked.display ?? {},
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
          oracle: masked.oracle ?? {},
          display: masked.display ?? {},
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

  // ---------------------------------------------------------------------------
  // GET /admin/oracle-status
  // ---------------------------------------------------------------------------

  router.openapi(oracleStatusRoute, async (c) => {
    const stats = deps.priceOracle?.getCacheStats() ?? { hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 };
    return c.json(
      {
        cache: stats,
        sources: {
          pyth: {
            available: !!deps.priceOracle,
            baseUrl: 'https://hermes.pyth.network',
          },
          coingecko: {
            available: deps.oracleConfig?.coingeckoApiKeyConfigured ?? false,
            apiKeyConfigured: deps.oracleConfig?.coingeckoApiKeyConfigured ?? false,
          },
        },
        crossValidation: {
          enabled: deps.oracleConfig?.coingeckoApiKeyConfigured ?? false,
          threshold: deps.oracleConfig?.crossValidationThreshold ?? 5,
        },
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /admin/api-keys
  // ---------------------------------------------------------------------------

  router.openapi(apiKeysListRoute, async (c) => {
    const registry = deps.actionProviderRegistry;
    const store = deps.apiKeyStore;

    if (!registry) {
      return c.json({ keys: [] }, 200);
    }

    const providers = registry.listProviders();
    const storedKeys = store ? store.listAll() : [];
    const storedMap = new Map(storedKeys.map((k) => [k.providerName, k]));

    const keys = providers.map((p) => {
      const stored = storedMap.get(p.name);
      return {
        providerName: p.name,
        hasKey: stored?.hasKey ?? false,
        maskedKey: stored?.maskedKey ?? null,
        requiresApiKey: p.requiresApiKey ?? false,
        updatedAt: stored?.updatedAt
          ? stored.updatedAt.toISOString()
          : null,
      };
    });

    return c.json({ keys }, 200);
  });

  // ---------------------------------------------------------------------------
  // PUT /admin/api-keys/:provider
  // ---------------------------------------------------------------------------

  router.openapi(apiKeyPutRoute, async (c) => {
    const { provider } = c.req.valid('param');
    const body = c.req.valid('json');

    if (!deps.apiKeyStore) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'API key store not available',
      });
    }

    deps.apiKeyStore.set(provider, body.apiKey);
    return c.json({ success: true, providerName: provider }, 200);
  });

  // ---------------------------------------------------------------------------
  // DELETE /admin/api-keys/:provider
  // ---------------------------------------------------------------------------

  router.openapi(apiKeyDeleteRoute, async (c) => {
    const { provider } = c.req.valid('param');

    if (!deps.apiKeyStore) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'API key store not available',
      });
    }

    const deleted = deps.apiKeyStore.delete(provider);
    if (!deleted) {
      throw new WAIaaSError('ACTION_NOT_FOUND', {
        message: `No API key found for provider '${provider}'`,
        details: { providerName: provider },
      });
    }

    return c.json({ success: true }, 200);
  });

  // ---------------------------------------------------------------------------
  // GET /admin/forex/rates
  // ---------------------------------------------------------------------------

  router.openapi(forexRatesRoute, async (c) => {
    const { currencies: currenciesParam } = c.req.valid('query');
    const rates: Record<string, { rate: number; preview: string }> = {};

    if (!currenciesParam || !deps.forexRateService) {
      return c.json({ rates }, 200);
    }

    // Parse comma-separated currency codes, validate each
    const codes = currenciesParam
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => CurrencyCodeSchema.safeParse(s).success) as CurrencyCode[];

    if (codes.length === 0) {
      return c.json({ rates }, 200);
    }

    const rateMap = await deps.forexRateService.getRates(codes);
    for (const [code, forexRate] of rateMap) {
      rates[code] = {
        rate: forexRate.rate,
        preview: formatRatePreview(forexRate.rate, code),
      };
    }

    return c.json({ rates }, 200);
  });

  // ---------------------------------------------------------------------------
  // GET /admin/wallets/:id/transactions
  // ---------------------------------------------------------------------------

  router.openapi(adminWalletTransactionsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const query = c.req.valid('query');
    const limit = query.limit ?? 20;

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
      .all();

    // Total count
    const totalResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.walletId, id))
      .get();
    const total = totalResult?.count ?? 0;

    const items = rows.map((tx) => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      toAddress: tx.toAddress ?? null,
      amount: tx.amount ?? null,
      amountUsd: tx.amountUsd ?? null,
      network: tx.network ?? null,
      txHash: tx.txHash ?? null,
      createdAt: tx.createdAt instanceof Date
        ? Math.floor(tx.createdAt.getTime() / 1000)
        : (typeof tx.createdAt === 'number' ? tx.createdAt : null),
    }));

    return c.json({ items, total }, 200);
  });

  // ---------------------------------------------------------------------------
  // GET /admin/wallets/:id/balance
  // ---------------------------------------------------------------------------

  router.openapi(adminWalletBalanceRoute, async (c) => {
    const { id } = c.req.valid('param');

    // Verify wallet exists
    const wallet = deps.db.select().from(wallets).where(eq(wallets.id, id)).get();
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    // If no adapter pool, return null balance
    if (!deps.adapterPool) {
      return c.json({ native: null, tokens: [] }, 200);
    }

    try {
      const network = (wallet.defaultNetwork
        ?? getDefaultNetwork(wallet.chain as ChainType, wallet.environment as EnvironmentType)) as NetworkType;
      const rpcUrl = resolveRpcUrl(deps.daemonConfig!.rpc, wallet.chain, network);
      const adapter = await deps.adapterPool.resolve(wallet.chain as ChainType, network, rpcUrl);

      // Get native balance
      const balanceInfo = await adapter.getBalance(wallet.publicKey);
      const nativeBalance = (Number(balanceInfo.balance) / 10 ** balanceInfo.decimals).toString();

      // Get token assets
      const assets = await adapter.getAssets(wallet.publicKey);
      const tokens = assets
        .filter((a) => !a.isNative)
        .map((a) => ({
          symbol: a.symbol,
          balance: (Number(a.balance) / 10 ** a.decimals).toString(),
          address: a.mint,
        }));

      return c.json(
        {
          native: { balance: nativeBalance, symbol: balanceInfo.symbol, network },
          tokens,
        },
        200,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return c.json(
        { native: null, tokens: [], error: errorMessage },
        200,
      );
    }
  });

  return router;
}
