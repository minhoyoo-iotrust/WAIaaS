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
import { health } from './routes/health.js';
import { walletCrudRoutes } from './routes/wallets.js';
import { sessionRoutes } from './routes/sessions.js';
import { walletRoutes } from './routes/wallet.js';
import { transactionRoutes } from './routes/transactions.js';
import { policyRoutes } from './routes/policies.js';
import { nonceRoutes } from './routes/nonce.js';
import { utilsRoutes } from './routes/utils.js';
import { skillsRoutes } from './routes/skills.js';
import { adminRoutes } from './routes/admin.js';
import type { KillSwitchState } from './routes/admin.js';
import { tokenRegistryRoutes } from './routes/tokens.js';
import { mcpTokenRoutes } from './routes/mcp.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { IPolicyEngine, IPriceOracle, IForexRateService } from '@waiaas/core';
import type { JwtSecretManager } from '../infrastructure/jwt/index.js';
import type { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import type { DelayQueue } from '../workflow/delay-queue.js';
import type { OwnerLifecycleService } from '../workflow/owner-state.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { SettingsService } from '../infrastructure/settings/index.js';
import type { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import type { ApiKeyStore } from '../infrastructure/action/api-key-store.js';
import type * as schema from '../infrastructure/database/schema.js';
import { TokenRegistryService } from '../infrastructure/token-registry/index.js';
import { actionRoutes } from './routes/actions.js';
import { x402Routes } from './routes/x402.js';
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
  apiKeyStore?: ApiKeyStore;
  onSettingsChanged?: (changedKeys: string[]) => void;
  dataDir?: string;
  forexRateService?: IForexRateService;
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
  app.use('*', createKillSwitchGuard(deps.getKillSwitchState));
  app.use('*', requestLogger);

  // Register error handler
  app.onError(errorHandler);

  // Register route-level auth middleware on the app (before sub-routers)
  if (deps.masterPasswordHash !== undefined) {
    const masterAuth = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash });
    app.use('/v1/wallets', masterAuth);
    app.use('/v1/policies', masterAuth);
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
  }

  // masterAuth for GET /v1/wallets/:id (wallet detail) -- skip sub-paths with own auth
  if (deps.masterPasswordHash !== undefined) {
    const masterAuthForWalletDetail = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash });
    app.use('/v1/wallets/:id', async (c, next) => {
      // Skip sub-paths that have their own masterAuth registered below
      if (c.req.path.includes('/owner') || c.req.path.includes('/default-network') || c.req.path.includes('/networks')) {
        await next();
        return;
      }
      return masterAuthForWalletDetail(c, next);
    });
  }

  // masterAuth for PUT /v1/wallets/:id/owner
  if (deps.masterPasswordHash !== undefined) {
    const masterAuthForOwner = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash });
    app.use('/v1/wallets/:id/owner', masterAuthForOwner);
    app.use('/v1/wallets/:id/default-network', masterAuthForOwner);
    app.use('/v1/wallets/:id/networks', masterAuthForOwner);
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
    app.use('/v1/actions/*', sessionAuth);
    app.use('/v1/x402/*', sessionAuth);
  }

  // ownerAuth for approve and reject routes (requires DB for agent lookup)
  if (deps.db) {
    const ownerAuth = createOwnerAuth({ db: deps.db });
    app.use('/v1/transactions/:id/approve', ownerAuth);
    app.use('/v1/transactions/:id/reject', ownerAuth);
  }

  // masterAuth for admin routes (except GET /admin/kill-switch which is public)
  if (deps.masterPasswordHash !== undefined) {
    const masterAuthForAdmin = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash });
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
    app.use('/v1/tokens', masterAuthForAdmin);
    app.use('/v1/mcp/tokens', masterAuthForAdmin);
    app.use('/v1/admin/wallets/*', masterAuthForAdmin);
  }

  // Register routes
  app.route('/health', health);

  // Register nonce route (public, no auth required)
  app.route('/v1', nonceRoutes());

  // Register skills route (public, no auth required -- AI agent skill references)
  app.route('/v1', skillsRoutes());

  // Register utils routes (sessionAuth required -- stateless utilities)
  app.route('/v1', utilsRoutes());

  // Register wallet CRUD routes when deps are available
  if (deps.db && deps.sqlite && deps.keyStore && deps.masterPassword !== undefined && deps.config) {
    app.route(
      '/v1',
      walletCrudRoutes({
        db: deps.db,
        sqlite: deps.sqlite,
        keyStore: deps.keyStore,
        masterPassword: deps.masterPassword,
        config: deps.config,
        notificationService: deps.notificationService,
      }),
    );
  }

  // Register session routes when deps are available (masterAuth + JWT)
  if (deps.db && deps.jwtSecretManager && deps.config) {
    app.route(
      '/v1',
      sessionRoutes({
        db: deps.db,
        jwtSecretManager: deps.jwtSecretManager,
        config: deps.config,
        notificationService: deps.notificationService,
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
      }),
    );
  }

  // Register transaction routes when all pipeline deps are available
  if (
    deps.db &&
    deps.keyStore &&
    deps.masterPassword !== undefined &&
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
        masterPassword: deps.masterPassword,
        approvalWorkflow: deps.approvalWorkflow,
        delayQueue: deps.delayQueue,
        ownerLifecycle: deps.ownerLifecycle,
        sqlite: deps.sqlite,
        notificationService: deps.notificationService,
        priceOracle: deps.priceOracle,
        settingsService: deps.settingsService,
      }),
    );
  }

  // Register action routes when registry + pipeline deps are available
  if (
    deps.actionProviderRegistry &&
    deps.apiKeyStore &&
    deps.db &&
    deps.keyStore &&
    deps.masterPassword !== undefined &&
    deps.adapterPool &&
    deps.policyEngine &&
    deps.config
  ) {
    app.route(
      '/v1',
      actionRoutes({
        registry: deps.actionProviderRegistry,
        apiKeyStore: deps.apiKeyStore,
        db: deps.db,
        adapterPool: deps.adapterPool,
        config: deps.config,
        keyStore: deps.keyStore,
        policyEngine: deps.policyEngine,
        masterPassword: deps.masterPassword,
        approvalWorkflow: deps.approvalWorkflow,
        delayQueue: deps.delayQueue,
        ownerLifecycle: deps.ownerLifecycle,
        sqlite: deps.sqlite,
        notificationService: deps.notificationService,
        priceOracle: deps.priceOracle,
        settingsService: deps.settingsService,
      }),
    );
  }

  // Register x402 routes when pipeline deps + config are available
  if (
    deps.db &&
    deps.sqlite &&
    deps.keyStore &&
    deps.masterPassword !== undefined &&
    deps.policyEngine &&
    deps.policyEngine instanceof DatabasePolicyEngine &&
    deps.config
  ) {
    app.route('/v1', x402Routes({
      db: deps.db,
      sqlite: deps.sqlite,
      keyStore: deps.keyStore,
      policyEngine: deps.policyEngine,
      masterPassword: deps.masterPassword,
      config: deps.config,
      notificationService: deps.notificationService,
      priceOracle: deps.priceOracle,
      adapterPool: deps.adapterPool ?? null,
      settingsService: deps.settingsService,
    }));
  }

  // Register admin routes when DB is available
  if (deps.db) {
    // Kill switch state holder: wraps getKillSwitchState callback with enriched state
    const killSwitchHolder: KillSwitchState = {
      state: 'NORMAL',
      activatedAt: null,
      activatedBy: null,
    };

    // Sync initial state from callback if provided
    if (deps.getKillSwitchState) {
      killSwitchHolder.state = deps.getKillSwitchState();
    }

    app.route(
      '/v1',
      adminRoutes({
        db: deps.db,
        jwtSecretManager: deps.jwtSecretManager,
        getKillSwitchState: () => killSwitchHolder,
        setKillSwitchState: (state: string, activatedBy?: string) => {
          killSwitchHolder.state = state;
          if (state === 'ACTIVATED') {
            killSwitchHolder.activatedAt = Math.floor(Date.now() / 1000);
            killSwitchHolder.activatedBy = activatedBy ?? null;
          } else {
            killSwitchHolder.activatedAt = null;
            killSwitchHolder.activatedBy = null;
          }
        },
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
        apiKeyStore: deps.apiKeyStore,
        actionProviderRegistry: deps.actionProviderRegistry,
        forexRateService: deps.forexRateService,
      }),
    );
  }

  // Register token registry routes when DB is available
  if (deps.db && tokenRegistryService) {
    app.route(
      '/v1',
      tokenRegistryRoutes({ tokenRegistryService }),
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
