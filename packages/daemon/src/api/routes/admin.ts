/**
 * Admin route handlers: 6 daemon administration endpoints.
 *
 * GET    /admin/status        - Daemon health/uptime/version (masterAuth)
 * POST   /admin/kill-switch   - Activate kill switch (masterAuth)
 * GET    /admin/kill-switch   - Get kill switch state (public)
 * POST   /admin/recover       - Deactivate kill switch (masterAuth)
 * POST   /admin/shutdown      - Graceful daemon shutdown (masterAuth)
 * POST   /admin/rotate-secret - Rotate JWT secret (masterAuth)
 *
 * @see docs/37-rest-api-complete-spec.md
 * @see docs/36-killswitch-evm-freeze.md
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { JwtSecretManager } from '../../infrastructure/jwt/jwt-secret-manager.js';
import { agents, sessions } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import {
  AdminStatusResponseSchema,
  KillSwitchResponseSchema,
  KillSwitchActivateResponseSchema,
  RecoverResponseSchema,
  ShutdownResponseSchema,
  RotateSecretResponseSchema,
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

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create admin route sub-router.
 *
 * GET  /admin/status        - Daemon health info (masterAuth)
 * POST /admin/kill-switch   - Activate kill switch (masterAuth)
 * GET  /admin/kill-switch   - Get kill switch state (public)
 * POST /admin/recover       - Deactivate kill switch (masterAuth)
 * POST /admin/shutdown      - Graceful shutdown (masterAuth)
 * POST /admin/rotate-secret - Rotate JWT secret (masterAuth)
 */
export function adminRoutes(deps: AdminRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // ---------------------------------------------------------------------------
  // GET /admin/status
  // ---------------------------------------------------------------------------

  router.openapi(statusRoute, async (c) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const uptime = nowSec - deps.startTime;

    // Count agents
    const agentCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(agents)
      .get();
    const agentCount = agentCountResult?.count ?? 0;

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

    const ksState = deps.getKillSwitchState();

    return c.json(
      {
        status: 'running',
        version: deps.version,
        uptime,
        agentCount,
        activeSessionCount,
        killSwitchState: ksState.state,
        adminTimeout: deps.adminTimeout,
        timestamp: nowSec,
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

  return router;
}
