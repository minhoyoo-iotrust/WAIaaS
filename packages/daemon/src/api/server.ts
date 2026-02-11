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
 *   - masterAuth: /v1/agents, /v1/policies, /v1/sessions, /v1/sessions/:id (admin operations, skips /renew)
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
import { OpenAPIHono } from '@hono/zod-openapi';

const require = createRequire(import.meta.url);
const { version: DAEMON_VERSION } = require('../../package.json') as { version: string };
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { IChainAdapter } from '@waiaas/core';
import {
  requestId,
  hostGuard,
  createKillSwitchGuard,
  requestLogger,
  errorHandler,
  createSessionAuth,
  createMasterAuth,
  createOwnerAuth,
} from './middleware/index.js';
import type { GetKillSwitchState } from './middleware/index.js';
import { health } from './routes/health.js';
import { agentRoutes } from './routes/agents.js';
import { sessionRoutes } from './routes/sessions.js';
import { walletRoutes } from './routes/wallet.js';
import { transactionRoutes } from './routes/transactions.js';
import { policyRoutes } from './routes/policies.js';
import { nonceRoutes } from './routes/nonce.js';
import { adminRoutes } from './routes/admin.js';
import type { KillSwitchState } from './routes/admin.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { IPolicyEngine } from '@waiaas/core';
import type { JwtSecretManager } from '../infrastructure/jwt/index.js';
import type { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import type { DelayQueue } from '../workflow/delay-queue.js';
import type { OwnerLifecycleService } from '../workflow/owner-state.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type * as schema from '../infrastructure/database/schema.js';

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
  adapter?: IChainAdapter | null;
  policyEngine?: IPolicyEngine;
  jwtSecretManager?: JwtSecretManager;
  approvalWorkflow?: ApprovalWorkflow;
  delayQueue?: DelayQueue;
  ownerLifecycle?: OwnerLifecycleService;
  notificationService?: NotificationService;
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
    app.use('/v1/agents', masterAuth);
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

  // masterAuth for GET /v1/agents/:id (agent detail) -- skip /owner sub-path
  if (deps.masterPasswordHash !== undefined) {
    const masterAuthForAgentDetail = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash });
    app.use('/v1/agents/:id', async (c, next) => {
      // Skip /v1/agents/:id/owner (has its own masterAuth below)
      if (c.req.path.includes('/owner')) {
        await next();
        return;
      }
      return masterAuthForAgentDetail(c, next);
    });
  }

  // masterAuth for PUT /v1/agents/:id/owner
  if (deps.masterPasswordHash !== undefined) {
    const masterAuthForOwner = createMasterAuth({ masterPasswordHash: deps.masterPasswordHash });
    app.use('/v1/agents/:id/owner', masterAuthForOwner);
  }

  if (deps.jwtSecretManager && deps.db) {
    const sessionAuth = createSessionAuth({ jwtSecretManager: deps.jwtSecretManager, db: deps.db });
    // sessionAuth for session renewal (uses own token)
    app.use('/v1/sessions/:id/renew', sessionAuth);
    app.use('/v1/wallet/*', sessionAuth);
    // sessionAuth for GET /v1/transactions (exact path -- wildcard won't match base)
    app.use('/v1/transactions', sessionAuth);
    app.use('/v1/transactions/*', sessionAuth);
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
  }

  // Register routes
  app.route('/health', health);

  // Register nonce route (public, no auth required)
  app.route('/v1', nonceRoutes());

  // Register agent routes when deps are available
  if (deps.db && deps.sqlite && deps.keyStore && deps.masterPassword !== undefined && deps.config) {
    app.route(
      '/v1',
      agentRoutes({
        db: deps.db,
        sqlite: deps.sqlite,
        keyStore: deps.keyStore,
        masterPassword: deps.masterPassword,
        config: deps.config,
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

  if (deps.db) {
    app.route(
      '/v1',
      walletRoutes({
        db: deps.db,
        adapter: deps.adapter ?? null,
      }),
    );
  }

  // Register transaction routes when all pipeline deps are available
  if (
    deps.db &&
    deps.keyStore &&
    deps.masterPassword !== undefined &&
    deps.adapter &&
    deps.policyEngine
  ) {
    app.route(
      '/v1',
      transactionRoutes({
        db: deps.db,
        adapter: deps.adapter,
        keyStore: deps.keyStore,
        policyEngine: deps.policyEngine,
        masterPassword: deps.masterPassword,
        approvalWorkflow: deps.approvalWorkflow,
        delayQueue: deps.delayQueue,
        ownerLifecycle: deps.ownerLifecycle,
        sqlite: deps.sqlite,
        config: deps.config ? {
          policy_defaults_delay_seconds: deps.config.security.policy_defaults_delay_seconds,
          policy_defaults_approval_timeout: deps.config.security.policy_defaults_approval_timeout,
        } : undefined,
      }),
    );
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

  return app;
}
