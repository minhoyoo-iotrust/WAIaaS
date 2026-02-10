/**
 * Hono API server factory: createApp(deps) returns a configured Hono instance.
 *
 * Middleware registration order:
 *   1. requestId
 *   2. hostGuard
 *   3. killSwitchGuard
 *   4. requestLogger
 *
 * Error handler is registered via app.onError.
 * Routes registered: /health, /v1/agents, /v1/wallet/*
 *
 * The returned app instance is NOT started -- starting is DaemonLifecycle's job.
 *
 * @see docs/29-api-framework-design.md
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
} from './middleware/index.js';
import type { GetKillSwitchState } from './middleware/index.js';
import { health } from './routes/health.js';
import { agentRoutes } from './routes/agents.js';
import { walletRoutes } from './routes/wallet.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../infrastructure/config/loader.js';
import type * as schema from '../infrastructure/database/schema.js';

export interface CreateAppDeps {
  getKillSwitchState?: GetKillSwitchState;
  db?: BetterSQLite3Database<typeof schema>;
  keyStore?: LocalKeyStore;
  masterPassword?: string;
  config?: DaemonConfig;
  adapter?: IChainAdapter | null;
}

/**
 * Create a Hono app instance with all middleware and routes configured.
 *
 * @param deps - Optional dependencies (extensible for future use)
 * @returns Configured Hono instance (not started)
 */
export function createApp(deps: CreateAppDeps = {}): Hono {
  const app = new Hono();

  // Register middleware in order
  app.use('*', requestId);
  app.use('*', hostGuard);
  app.use('*', createKillSwitchGuard(deps.getKillSwitchState));
  app.use('*', requestLogger);

  // Register error handler
  app.onError(errorHandler);

  // Register routes
  app.route('/health', health);

  // Register agent/wallet routes when deps are available
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

  if (deps.db) {
    app.route(
      '/v1',
      walletRoutes({
        db: deps.db,
        adapter: deps.adapter ?? null,
      }),
    );
  }

  return app;
}
