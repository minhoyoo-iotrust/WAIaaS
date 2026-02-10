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
 *   - masterAuth: /v1/agents, /v1/sessions (admin operations)
 *   - sessionAuth: /v1/wallet/*, /v1/transactions/* (session-authenticated)
 *   - /health remains public (no auth required)
 *
 * Error handler is registered via app.onError.
 *
 * The returned app instance is NOT started -- starting is DaemonLifecycle's job.
 *
 * @see docs/29-api-framework-design.md
 * @see docs/52-auth-redesign.md
 */

import { Hono } from 'hono';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { IChainAdapter } from '@waiaas/core';
import {
  requestId,
  hostGuard,
  createKillSwitchGuard,
  requestLogger,
  errorHandler,
  createSessionAuth,
  createMasterAuth,
} from './middleware/index.js';
import type { GetKillSwitchState } from './middleware/index.js';
import { health } from './routes/health.js';
import { agentRoutes } from './routes/agents.js';
import { sessionRoutes } from './routes/sessions.js';
import { walletRoutes } from './routes/wallet.js';
import { transactionRoutes } from './routes/transactions.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type { IPolicyEngine } from '@waiaas/core';
import type { JwtSecretManager } from '../infrastructure/jwt/index.js';
import type * as schema from '../infrastructure/database/schema.js';

export interface CreateAppDeps {
  getKillSwitchState?: GetKillSwitchState;
  db?: BetterSQLite3Database<typeof schema>;
  keyStore?: LocalKeyStore;
  masterPassword?: string;
  masterPasswordHash?: string; // Argon2id hash for masterAuth middleware
  config?: DaemonConfig;
  adapter?: IChainAdapter | null;
  policyEngine?: IPolicyEngine;
  jwtSecretManager?: JwtSecretManager;
}

/**
 * Create a Hono app instance with all middleware and routes configured.
 *
 * @param deps - Optional dependencies (extensible for future use)
 * @returns Configured Hono instance (not started)
 */
export function createApp(deps: CreateAppDeps = {}): Hono {
  const app = new Hono();

  // Register global middleware in order
  app.use('*', requestId);
  app.use('*', hostGuard);
  app.use('*', createKillSwitchGuard(deps.getKillSwitchState));
  app.use('*', requestLogger);

  // Register error handler
  app.onError(errorHandler);

  // Register route-level auth middleware on the app (before sub-routers)
  if (deps.masterPasswordHash !== undefined) {
    app.use('/v1/agents', createMasterAuth({ masterPasswordHash: deps.masterPasswordHash }));
    app.use('/v1/sessions', createMasterAuth({ masterPasswordHash: deps.masterPasswordHash }));
    app.use('/v1/sessions/*', createMasterAuth({ masterPasswordHash: deps.masterPasswordHash }));
  }

  if (deps.jwtSecretManager && deps.db) {
    const sessionAuth = createSessionAuth({ jwtSecretManager: deps.jwtSecretManager, db: deps.db });
    app.use('/v1/wallet/*', sessionAuth);
    app.use('/v1/transactions/*', sessionAuth);
  }

  // Register routes
  app.route('/health', health);

  // Register agent routes when deps are available
  if (deps.db && deps.keyStore && deps.masterPassword !== undefined && deps.config) {
    app.route(
      '/v1',
      agentRoutes({
        db: deps.db,
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
      }),
    );
  }

  return app;
}
