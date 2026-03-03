/**
 * Hono API server factory: createApp(deps) returns a configured Hono instance.
 *
 * Middleware registration order:
 *   1. requestId
 *   2. hostGuard
 *   3. killSwitchGuard
 *   4. requestLogger
 *
 * Auth middleware (route-level, registered on app before sub-routers):
 *   - masterAuth: /v1/wallets, /v1/policies, /v1/sessions, /v1/sessions/:id (admin operations, skips /renew)
 *   - sessionAuth: /v1/sessions/:id/renew, /v1/wallet/*, /v1/transactions/*
 *   - /health remains public (no auth required)
 *
 * Error handler is registered via app.onError.
 *
 * The returned app instance is NOT started -- starting is DaemonLifecycle's job.
 *
 * @see docs/29-api-framework-design.md
 * @see docs/52-auth-redesign.md
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OpenAPIHono } from '@hono/zod-openapi';
import { serveStatic } from '@hono/node-server/serve-static';

const require = createRequire(import.meta.url);
const { version: DAEMON_VERSION } = require('../../package.json') as { version: string };

// Compute absolute path to admin static files (from dist/api/server.js -> ../../public/admin)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ADMIN_STATIC_ROOT = join(__dirname, '..', '..', 'public', 'admin');

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import {
  requestId,
  hostGuard,
  createKillSwitchGuard,
  requestLogger,
  errorHandler,
  createSessionAuth,
  createMasterAuth,
  createOwnerAuth,
  cspMiddleware,
} from './middleware/index.js';
import type { GetKillSwitchState } from './middleware/index.js';
import { createHealthRoute } from './routes/health.js';
import type { VersionCheckService } from '../infrastructure/version/index.js';
import { walletCrudRoutes } from './routes/wallets.js';
import { sessionRoutes } from './routes/sessions.js';
import { walletRoutes } from './routes/wallet.js';
import { transactionRoutes } from './routes/transactions.js';
import { policyRoutes } from './routes/policies.js';
import { nonceRoutes } from './routes/nonce.js';
import { utilsRoutes } from './routes/utils.js';
import { skillsRoutes } from './routes/skills.js';
import { adminRoutes } from './routes/admin.js';
import type { AdminRouteDeps } from './routes/admin.js';
import type { KillSwitchState } from './routes/admin.js';
import { createWalletAppsRoutes } from './routes/wallet-apps.js';
import { tokenRegistryRoutes } from './routes/tokens.js';
import { connectInfoRoutes } from './routes/connect-info.js';
import { auditLogRoutes } from './routes/audit-logs.js';
import { webhookRoutes } from './routes/webhooks.js';
import { incomingRoutes } from './routes/incoming.js';
import { createStakingRoutes } from './routes/staking.js';
import { createDefiPositionRoutes } from './routes/defi-positions.js';
import { mcpTokenRoutes } from './routes/mcp.js';
import type { MasterPasswordRef } from './middleware/master-auth.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import { WAIaaSError } from '@waiaas/core';
import type { IPolicyEngine, IPriceOracle, IForexRateService, EventBus } from '@waiaas/core';
import type { KillSwitchService } from '../services/kill-switch-service.js';
import type { WcServiceRef } from '../services/wc-session-service.js';
import type { WcSigningBridgeRef } from '../services/wc-signing-bridge.js';
import type { ApprovalChannelRouter } from '../services/signing-sdk/approval-channel-router.js';
import type { JwtSecretManager } from '../infrastructure/jwt/index.js';
import type { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import type { DelayQueue } from '../workflow/delay-queue.js';
import type { OwnerLifecycleService } from '../workflow/owner-state.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { SettingsService } from '../infrastructure/settings/index.js';
import type { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
// ApiKeyStore removed in v29.5 (#214) -- API keys now managed by SettingsService
import type * as schema from '../infrastructure/database/schema.js';
import { TokenRegistryService } from '../infrastructure/token-registry/index.js';
import { WalletLinkRegistry } from '../services/signing-sdk/wallet-link-registry.js';
import { WalletAppService } from '../services/signing-sdk/wallet-app-service.js';
import { actionRoutes } from './routes/actions.js';
import { x402Routes } from './routes/x402.js';
import { wcRoutes, wcSessionRoutes } from './routes/wc.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';

export interface CreateAppDeps {
  getKillSwitchState?: GetKillSwitchState;
  setKillSwitchState?: (state: string, activatedBy?: string) => void;
  requestShutdown?: () => void;
  startTime?: number; // epoch seconds for uptime calculation
  db?: BetterSQLite3Database<typeof schema>;
  sqlite?: SQLiteDatabase;
  keyStore?: LocalKeyStore;
  masterPassword?: string;
  masterPasswordHash?: string; // Argon2id hash for masterAuth middleware
  /** Mutable ref for live password/hash updates (password change API). */
  passwordRef?: MasterPasswordRef;
  config?: DaemonConfig;
  adapterPool?: AdapterPool | null;
  policyEngine?: IPolicyEngine;
  jwtSecretManager?: JwtSecretManager;
  approvalWorkflow?: ApprovalWorkflow;
  delayQueue?: DelayQueue;
  ownerLifecycle?: OwnerLifecycleService;
  notificationService?: NotificationService;
  settingsService?: SettingsService;
  priceOracle?: IPriceOracle;
  actionProviderRegistry?: ActionProviderRegistry;
  onSettingsChanged?: (changedKeys: string[]) => void;
  dataDir?: string;
  forexRateService?: IForexRateService;
  eventBus?: EventBus;
  killSwitchService?: KillSwitchService;
  wcServiceRef?: WcServiceRef;
  wcSigningBridgeRef?: WcSigningBridgeRef;
  approvalChannelRouter?: ApprovalChannelRouter;
  versionCheckService?: VersionCheckService | null;
  /** Duck-typed to avoid circular dependency with IncomingTxMonitorService */
  incomingTxMonitorService?: { syncSubscriptions(): void | Promise<void> };
  /** Duck-typed to avoid circular import with EncryptedBackupService */
  encryptedBackupService?: { createBackup(password: string): Promise<{ path: string; filename: string; size: number; created_at: string; daemon_version: string; schema_version: number; file_count: number }>; listBackups(): Array<{ path: string; filename: string; size: number; created_at: string; daemon_version: string; schema_version: number; file_count: number }>; };
}

/**
 * Create a Hono app instance with all middleware and routes configured.
 *
 * @param deps - Optional dependencies (extensible for future use)
 * @returns Configured OpenAPIHono instance (not started)
 */
export function createApp(deps: CreateAppDeps = {}): OpenAPIHono {
  const app = new OpenAPIHono();

  // Register global middleware in order
  app.use('*', requestId);
  app.use('*', hostGuard);
  // killSwitchGuard: prefer KillSwitchService if available, else use callback
  const killSwitchStateGetter: GetKillSwitchState = deps.killSwitchService
    ? () => deps.killSwitchService!.getState().state
    : (deps.getKillSwitchState ?? (() => 'ACTIVE'));
  app.use('*', createKillSwitchGuard(killSwitchStateGetter));
  app.use('*', requestLogger);

  // Register error handler
  app.onError(errorHandler);

  // Register route-level auth middleware on the app (before sub-routers)
  if (deps.masterPasswordHash !== undefined || deps.passwordRef) {
    const masterAuth = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash, passwordRef: deps.passwordRef, sqlite: deps.sqlite });
    app.use('/v1/wallets', masterAuth);
    // /v1/policies: GET allows sessionAuth or masterAuth, others require masterAuth only
    app.use('/v1/policies', async (c, next) => {
      if (c.req.method === 'GET') {
        const authHeader = c.req.header('Authorization');
        if (authHeader?.startsWith('Bearer wai_sess_')) {
          // sessionAuth will handle GET in the sessionAuth block below
          await next();
          return;
        }
        // Otherwise fall through to masterAuth (admin GET)
      }
      return masterAuth(c, next);
    });
    app.use('/v1/policies/:id', masterAuth);
    // masterAuth on /v1/sessions (POST create, GET list)
    app.use('/v1/sessions', masterAuth);
    // masterAuth on /v1/sessions/:id for DELETE -- skip /renew sub-path (sessionAuth handles it)
    app.use('/v1/sessions/:id', async (c, next) => {
      if (c.req.path.endsWith('/renew')) {
        await next();
        return;
      }
      return masterAuth(c, next);
    });
    // masterAuth on session-wallet management sub-routes (v26.4)
    app.use('/v1/sessions/:id/wallets', masterAuth);
    app.use('/v1/sessions/:id/wallets/*', masterAuth);
  }

  // masterAuth for GET /v1/wallets/:id (wallet detail) -- skip sub-paths with own auth
  if (deps.masterPasswordHash !== undefined || deps.passwordRef) {
    const masterAuthForWalletDetail = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash, passwordRef: deps.passwordRef, sqlite: deps.sqlite });
    app.use('/v1/wallets/:id', async (c, next) => {
      // Skip sub-paths that have their own masterAuth registered below
      if (c.req.path.includes('/owner') || c.req.path.includes('/networks') || c.req.path.includes('/wc/')) {
        await next();
        return;
      }
      return masterAuthForWalletDetail(c, next);
    });
  }

  // masterAuth for PUT /v1/wallets/:id/owner
  if (deps.masterPasswordHash !== undefined || deps.passwordRef) {
    const masterAuthForOwner = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash, passwordRef: deps.passwordRef, sqlite: deps.sqlite });
    app.use('/v1/wallets/:id/owner', masterAuthForOwner);
    app.use('/v1/wallets/:id/networks', masterAuthForOwner);
  }

  // masterAuth for WalletConnect routes
  if (deps.masterPasswordHash !== undefined || deps.passwordRef) {
    const masterAuthForWc = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash, passwordRef: deps.passwordRef, sqlite: deps.sqlite });
    app.use('/v1/wallets/:id/wc/*', masterAuthForWc);
  }

  if (deps.jwtSecretManager && deps.db) {
    const sessionAuth = createSessionAuth({ jwtSecretManager: deps.jwtSecretManager, db: deps.db });
    // sessionAuth for session renewal (uses own token)
    app.use('/v1/sessions/:id/renew', sessionAuth);
    app.use('/v1/wallet/*', sessionAuth);
    // sessionAuth for GET /v1/transactions (exact path -- wildcard won't match base)
    app.use('/v1/transactions', sessionAuth);
    app.use('/v1/transactions/*', sessionAuth);
    app.use('/v1/utils/*', sessionAuth);
    // dual-auth for GET /v1/actions/providers: masterAuth (Admin UI) or sessionAuth (agent)
    app.use('/v1/actions/providers', async (c, next) => {
      if (c.req.method === 'GET') {
        const authHeader = c.req.header('Authorization');
        if (authHeader?.startsWith('Bearer wai_sess_')) {
          return sessionAuth(c, next);
        }
        // masterAuth handles admin GET (falls through to masterAuth block below)
        await next();
        return;
      }
      return sessionAuth(c, next);
    });
    app.use('/v1/actions/*', async (c, next) => {
      // GET /v1/actions/providers is handled by dual-auth middleware above
      if (c.req.method === 'GET' && c.req.path.endsWith('/actions/providers')) {
        await next();
        return;
      }
      return sessionAuth(c, next);
    });
    app.use('/v1/x402/*', sessionAuth);
    app.use('/v1/connect-info', sessionAuth);
    // sessionAuth for GET /v1/policies and GET /v1/tokens (dual-auth: agent read-only access)
    // Only apply sessionAuth when Bearer token is present; masterAuth GET is handled above.
    app.use('/v1/policies', async (c, next) => {
      if (c.req.method === 'GET') {
        const authHeader = c.req.header('Authorization');
        if (authHeader?.startsWith('Bearer wai_sess_')) {
          return sessionAuth(c, next);
        }
      }
      await next();
    });
    app.use('/v1/tokens', async (c, next) => {
      if (c.req.method === 'GET') {
        const authHeader = c.req.header('Authorization');
        if (authHeader?.startsWith('Bearer wai_sess_')) {
          return sessionAuth(c, next);
        }
      }
      await next();
    });
  }

  // ownerAuth for approve and reject routes (requires DB for agent lookup)
  if (deps.db) {
    const ownerAuth = createOwnerAuth({ db: deps.db });
    app.use('/v1/transactions/:id/approve', ownerAuth);
    app.use('/v1/transactions/:id/reject', ownerAuth);
    app.use('/v1/wallets/:id/owner/verify', ownerAuth);
  }

  // masterAuth for admin routes (except GET /admin/kill-switch which is public)
  if (deps.masterPasswordHash !== undefined || deps.passwordRef) {
    const masterAuthForAdmin = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash, passwordRef: deps.passwordRef, sqlite: deps.sqlite });
    app.use('/v1/admin/status', masterAuthForAdmin);
    app.use('/v1/admin/kill-switch', async (c, next) => {
      // POST requires masterAuth, GET is public
      if (c.req.method === 'POST') {
        return masterAuthForAdmin(c, next);
      }
      await next();
    });
    app.use('/v1/admin/recover', masterAuthForAdmin);
    app.use('/v1/admin/shutdown', masterAuthForAdmin);
    app.use('/v1/admin/rotate-secret', masterAuthForAdmin);
    app.use('/v1/admin/notifications/*', masterAuthForAdmin);
    app.use('/v1/admin/settings', masterAuthForAdmin);
    app.use('/v1/admin/settings/*', masterAuthForAdmin);
    app.use('/v1/admin/api-keys', masterAuthForAdmin);
    app.use('/v1/admin/api-keys/*', masterAuthForAdmin);
    app.use('/v1/admin/forex/*', masterAuthForAdmin);
    app.use('/v1/admin/kill-switch/escalate', masterAuthForAdmin);
    // /v1/tokens: GET allows sessionAuth or masterAuth, others require masterAuth only
    app.use('/v1/tokens', async (c, next) => {
      if (c.req.method === 'GET') {
        const authHeader = c.req.header('Authorization');
        if (authHeader?.startsWith('Bearer wai_sess_')) {
          // sessionAuth will handle GET in the sessionAuth block below
          await next();
          return;
        }
        // Otherwise fall through to masterAuth (admin GET)
      }
      return masterAuthForAdmin(c, next);
    });
    app.use('/v1/mcp/tokens', masterAuthForAdmin);
    app.use('/v1/admin/wallets/*', masterAuthForAdmin);
    app.use('/v1/admin/sessions/*', masterAuthForAdmin);
    app.use('/v1/admin/telegram-users', masterAuthForAdmin);
    app.use('/v1/admin/telegram-users/*', masterAuthForAdmin);
    app.use('/v1/admin/transactions', masterAuthForAdmin);
    app.use('/v1/admin/transactions/*', masterAuthForAdmin);
    app.use('/v1/admin/incoming', masterAuthForAdmin);
    app.use('/v1/admin/rpc-status', masterAuthForAdmin);
    app.use('/v1/admin/defi/*', masterAuthForAdmin);
    app.use('/v1/admin/master-password', masterAuthForAdmin);
    // masterAuth for audit-logs query API (OPS-02)
    app.use('/v1/audit-logs', masterAuthForAdmin);
    // masterAuth for webhook CRUD API (OPS-04)
    app.use('/v1/webhooks', masterAuthForAdmin);
    app.use('/v1/webhooks/*', masterAuthForAdmin);
    // masterAuth for encrypted backup API (OPS-03)
    app.use('/v1/admin/backup', masterAuthForAdmin);
    app.use('/v1/admin/backups', masterAuthForAdmin);
    // masterAuth for GET /v1/actions/providers (Admin UI reads provider list)
    app.use('/v1/actions/providers', async (c, next) => {
      if (c.req.method === 'GET') {
        const authHeader = c.req.header('Authorization');
        if (authHeader?.startsWith('Bearer wai_sess_')) {
          // sessionAuth handles agent GET in the sessionAuth block above
          await next();
          return;
        }
        return masterAuthForAdmin(c, next);
      }
      await next();
    });
  }

  // ownerAuth for POST /v1/owner/kill-switch
  if (deps.db) {
    const ownerAuthForKillSwitch = createOwnerAuth({ db: deps.db });
    app.use('/v1/owner/kill-switch', ownerAuthForKillSwitch);
  }

  // Register routes
  app.route('/health', createHealthRoute({ versionCheckService: deps.versionCheckService ?? null }));

  // Register nonce route (public, no auth required)
  app.route('/v1', nonceRoutes());

  // Register skills route (public, no auth required -- AI agent skill references)
  app.route('/v1', skillsRoutes());

  // Register utils routes (sessionAuth required -- stateless utilities)
  app.route('/v1', utilsRoutes());

  // Register wallet CRUD routes when deps are available
  const effectiveMasterPassword = deps.passwordRef?.password ?? deps.masterPassword;
  if (deps.db && deps.sqlite && deps.keyStore && effectiveMasterPassword !== undefined && deps.config) {
    app.route(
      '/v1',
      walletCrudRoutes({
        db: deps.db,
        sqlite: deps.sqlite,
        keyStore: deps.keyStore,
        masterPassword: effectiveMasterPassword,
        passwordRef: deps.passwordRef,
        config: deps.config,
        adapterPool: deps.adapterPool ?? undefined,
        notificationService: deps.notificationService,
        eventBus: deps.eventBus,
        jwtSecretManager: deps.jwtSecretManager ?? undefined,
        incomingTxMonitorService: deps.incomingTxMonitorService,
        settingsService: deps.settingsService,
        walletLinkRegistry: deps.settingsService
          ? new WalletLinkRegistry(deps.settingsService)
          : undefined,
        walletAppService: deps.sqlite
          ? new WalletAppService(deps.sqlite)
          : undefined,
      }),
    );
  }

  // Register session routes when deps are available (masterAuth + JWT)
  if (deps.db && deps.jwtSecretManager && deps.config) {
    app.route(
      '/v1',
      sessionRoutes({
        db: deps.db,
        sqlite: deps.sqlite,
        jwtSecretManager: deps.jwtSecretManager,
        config: deps.config,
        notificationService: deps.notificationService,
        eventBus: deps.eventBus,
      }),
    );
  }

  // Register policy routes when DB is available (masterAuth covers /v1/policies)
  if (deps.db) {
    app.route(
      '/v1',
      policyRoutes({ db: deps.db }),
    );
  }

  // Create shared TokenRegistryService for walletRoutes and tokenRegistryRoutes
  const tokenRegistryService = deps.db ? new TokenRegistryService(deps.db) : null;

  if (deps.db) {
    app.route(
      '/v1',
      walletRoutes({
        db: deps.db,
        adapterPool: deps.adapterPool ?? null,
        config: deps.config ?? null,
        tokenRegistryService,
        forexRateService: deps.forexRateService,
        settingsService: deps.settingsService,
      }),
    );
  }

  // Register incoming transaction routes (sessionAuth via /v1/wallet/* wildcard)
  if (deps.db) {
    app.route(
      '/v1',
      incomingRoutes({
        db: deps.db,
        sqlite: deps.sqlite,
        priceOracle: deps.priceOracle,
        forexRateService: deps.forexRateService,
        settingsService: deps.settingsService,
      }),
    );
  }

  // Register staking position routes (sessionAuth via /v1/wallet/* wildcard)
  if (deps.db) {
    app.route(
      '/v1',
      createStakingRoutes({
        db: deps.db,
        sqlite: deps.sqlite,
        priceOracle: deps.priceOracle,
      }),
    );
  }

  // Register DeFi position routes (sessionAuth via /v1/wallet/* wildcard)
  if (deps.db) {
    app.route(
      '/v1',
      createDefiPositionRoutes({
        db: deps.db,
        sqlite: deps.sqlite,
        actionProviderRegistry: deps.actionProviderRegistry,
      }),
    );
  }

  // Register transaction routes when all pipeline deps are available
  if (
    deps.db &&
    deps.keyStore &&
    effectiveMasterPassword !== undefined &&
    deps.adapterPool &&
    deps.policyEngine &&
    deps.config
  ) {
    app.route(
      '/v1',
      transactionRoutes({
        db: deps.db,
        adapterPool: deps.adapterPool,
        config: deps.config,
        keyStore: deps.keyStore,
        policyEngine: deps.policyEngine,
        masterPassword: effectiveMasterPassword,
        passwordRef: deps.passwordRef,
        approvalWorkflow: deps.approvalWorkflow,
        delayQueue: deps.delayQueue,
        ownerLifecycle: deps.ownerLifecycle,
        sqlite: deps.sqlite,
        notificationService: deps.notificationService,
        priceOracle: deps.priceOracle,
        settingsService: deps.settingsService,
        forexRateService: deps.forexRateService,
        eventBus: deps.eventBus,
        wcSigningBridgeRef: deps.wcSigningBridgeRef,
        approvalChannelRouter: deps.approvalChannelRouter,
      }),
    );
  }

  // Register action routes when registry + pipeline deps are available
  if (
    deps.actionProviderRegistry &&
    deps.settingsService &&
    deps.db &&
    deps.keyStore &&
    effectiveMasterPassword !== undefined &&
    deps.adapterPool &&
    deps.policyEngine &&
    deps.config
  ) {
    app.route(
      '/v1',
      actionRoutes({
        registry: deps.actionProviderRegistry,
        db: deps.db,
        adapterPool: deps.adapterPool,
        config: deps.config,
        keyStore: deps.keyStore,
        policyEngine: deps.policyEngine,
        masterPassword: effectiveMasterPassword,
        passwordRef: deps.passwordRef,
        approvalWorkflow: deps.approvalWorkflow,
        delayQueue: deps.delayQueue,
        ownerLifecycle: deps.ownerLifecycle,
        sqlite: deps.sqlite,
        notificationService: deps.notificationService,
        priceOracle: deps.priceOracle,
        settingsService: deps.settingsService!,
      }),
    );
  }

  // Register x402 routes when pipeline deps + config are available
  if (
    deps.db &&
    deps.sqlite &&
    deps.keyStore &&
    effectiveMasterPassword !== undefined &&
    deps.policyEngine &&
    deps.policyEngine instanceof DatabasePolicyEngine &&
    deps.config
  ) {
    app.route('/v1', x402Routes({
      db: deps.db,
      sqlite: deps.sqlite,
      keyStore: deps.keyStore,
      policyEngine: deps.policyEngine,
      masterPassword: effectiveMasterPassword,
      passwordRef: deps.passwordRef,
      config: deps.config,
      notificationService: deps.notificationService,
      priceOracle: deps.priceOracle,
      adapterPool: deps.adapterPool ?? null,
      settingsService: deps.settingsService,
      eventBus: deps.eventBus,
    }));
  }

  // Register admin routes when DB is available
  if (deps.db) {
    // Kill switch state holder: wraps getKillSwitchState callback with enriched state
    const killSwitchHolder: KillSwitchState = {
      state: 'ACTIVE',
      activatedAt: null,
      activatedBy: null,
    };

    // Sync initial state from KillSwitchService or callback
    if (deps.killSwitchService) {
      const ksInfo = deps.killSwitchService.getState();
      killSwitchHolder.state = ksInfo.state;
      killSwitchHolder.activatedAt = ksInfo.activatedAt;
      killSwitchHolder.activatedBy = ksInfo.activatedBy;
    } else if (deps.getKillSwitchState) {
      killSwitchHolder.state = deps.getKillSwitchState();
    }

    app.route(
      '/v1',
      adminRoutes({
        db: deps.db,
        jwtSecretManager: deps.jwtSecretManager,
        passwordRef: deps.passwordRef,
        getKillSwitchState: () => killSwitchHolder,
        setKillSwitchState: (state: string, activatedBy?: string) => {
          killSwitchHolder.state = state;
          if (state === 'SUSPENDED' || state === 'LOCKED') {
            killSwitchHolder.activatedAt = Math.floor(Date.now() / 1000);
            killSwitchHolder.activatedBy = activatedBy ?? null;
          } else {
            killSwitchHolder.activatedAt = null;
            killSwitchHolder.activatedBy = null;
          }
        },
        killSwitchService: deps.killSwitchService,
        requestShutdown: deps.requestShutdown,
        startTime: deps.startTime ?? Math.floor(Date.now() / 1000),
        version: DAEMON_VERSION,
        adminTimeout: deps.config?.daemon?.admin_timeout ?? 900,
        notificationService: deps.notificationService,
        notificationConfig: deps.config?.notifications,
        settingsService: deps.settingsService,
        onSettingsChanged: deps.onSettingsChanged,
        adapterPool: deps.adapterPool ?? null,
        daemonConfig: deps.config,
        priceOracle: deps.priceOracle,
        actionProviderRegistry: deps.actionProviderRegistry,
        forexRateService: deps.forexRateService,
        sqlite: deps.sqlite,
        dataDir: deps.dataDir,
        versionCheckService: deps.versionCheckService ?? null,
        delayQueue: deps.delayQueue,
        approvalWorkflow: deps.approvalWorkflow,
        rpcPool: deps.adapterPool?.pool,
        encryptedBackupService: deps.encryptedBackupService as AdminRouteDeps['encryptedBackupService'],
      }),
    );

    // Register wallet apps routes (masterAuth via admin middleware)
    if (deps.sqlite) {
      app.route(
        '/v1',
        createWalletAppsRoutes({
          walletAppService: new WalletAppService(deps.sqlite),
          settingsService: deps.settingsService,
        }),
      );
    }

    // Register owner kill-switch route (ownerAuth protected)
    if (deps.killSwitchService) {
      const ownerKsRouter = new OpenAPIHono();
      const ownerKillSwitchService = deps.killSwitchService;
      ownerKsRouter.post('/owner/kill-switch', async (c) => {
        const ownerAddress = c.get('ownerAddress' as never) as string | undefined;
        const result = ownerKillSwitchService.activateWithCascade(ownerAddress ?? 'owner');
        if (!result.success) {
          throw new WAIaaSError('KILL_SWITCH_ACTIVE', {
            message: result.error ?? 'Kill switch is already active',
          });
        }
        const state = ownerKillSwitchService.getState();
        return c.json(
          {
            state: 'SUSPENDED' as const,
            activatedAt: state.activatedAt ?? Math.floor(Date.now() / 1000),
          },
          200,
        );
      });
      app.route('/v1', ownerKsRouter);
    }
  }

  // Register audit log query routes (masterAuth required)
  if (deps.sqlite) {
    app.route('/v1', auditLogRoutes({ sqlite: deps.sqlite }));
  }

  // Register webhook CRUD routes (masterAuth required)
  if (deps.sqlite && effectiveMasterPassword) {
    app.route('/v1', webhookRoutes({ sqlite: deps.sqlite, masterPassword: effectiveMasterPassword }));
  }

  // Register token registry routes when DB is available
  if (deps.db && tokenRegistryService) {
    app.route(
      '/v1',
      tokenRegistryRoutes({
        tokenRegistryService,
        rpcConfig: deps.config?.rpc as unknown as Record<string, string>,
      }),
    );
  }

  // Register MCP token provisioning routes when deps are available
  if (deps.db && deps.jwtSecretManager && deps.config && deps.dataDir) {
    app.route(
      '/v1',
      mcpTokenRoutes({
        db: deps.db,
        jwtSecretManager: deps.jwtSecretManager,
        config: deps.config,
        dataDir: deps.dataDir,
        notificationService: deps.notificationService,
      }),
    );
  }

  // Register WalletConnect routes (always, with mutable WcServiceRef).
  // Handlers throw WC_NOT_CONFIGURED (503) when service is unavailable.
  // The ref pattern allows hot-reload to swap the underlying WcSessionService.
  if (deps.db) {
    const wcServiceRef = deps.wcServiceRef ?? { current: null };
    app.route('/v1', wcRoutes({ db: deps.db, wcServiceRef }));
    app.route('/v1', wcSessionRoutes({ db: deps.db, wcServiceRef }));
  }

  // Register connect-info route (sessionAuth, no masterAuth)
  if (deps.db) {
    app.route('/v1', connectInfoRoutes({
      db: deps.db,
      config: deps.config ?? {} as DaemonConfig,
      settingsService: deps.settingsService,
      actionProviderRegistry: deps.actionProviderRegistry,
      version: DAEMON_VERSION,
    }));
  }

  // Register OpenAPI spec endpoint (GET /doc)
  app.doc('/doc', {
    openapi: '3.0.0',
    info: {
      title: 'WAIaaS API',
      version: DAEMON_VERSION,
      description: 'AI Agent Wallet-as-a-Service REST API',
    },
  });

  // Register Admin UI static serving (conditional on config)
  if (deps.config?.daemon?.admin_ui !== false) {
    // CSP headers for admin paths
    app.use('/admin/*', cspMiddleware);

    // Serve static files from public/admin/ using absolute path
    app.use('/admin/*', serveStatic({
      root: ADMIN_STATIC_ROOT,
      rewriteRequestPath: (path: string) => path.replace(/^\/admin/, ''),
    }));

    // SPA fallback: any /admin/* path that didn't match a static file -> index.html
    app.get('/admin/*', serveStatic({
      root: ADMIN_STATIC_ROOT,
      path: 'index.html',
    }));

    // Redirect /admin to /admin/ for consistency
    app.get('/admin', (c) => c.redirect('/admin/'));
  }

  return app;
}
