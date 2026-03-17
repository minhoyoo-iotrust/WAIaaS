/**
 * Admin Auth route handlers: status, kill switch, recovery, shutdown, password change, JWT rotation.
 *
 * Extracted from admin.ts for maintainability.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute } from '@hono/zod-openapi';
import { sql, eq } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import { wallets, sessions, policies, transactions } from '../../infrastructure/database/schema.js';
import {
  AdminStatusResponseSchema,
  KillSwitchResponseSchema,
  KillSwitchActivateResponseSchema,
  KillSwitchEscalateResponseSchema,
  MasterPasswordChangeRequestSchema,
  MasterPasswordChangeResponseSchema,
  RecoverResponseSchema,
  KillSwitchRecoverRequestSchema,
  ShutdownResponseSchema,
  RotateSecretResponseSchema,
  buildErrorResponses,
} from './openapi-schemas.js';
import semver from 'semver';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AdminRouteDeps } from './admin.js';
import { formatTxAmount, buildTokenMap } from './admin-wallets.js';

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

const masterPasswordChangeRoute = createRoute({
  method: 'put',
  path: '/admin/master-password',
  tags: ['Admin'],
  summary: 'Change master password',
  request: {
    body: {
      content: { 'application/json': { schema: MasterPasswordChangeRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Master password changed successfully',
      content: { 'application/json': { schema: MasterPasswordChangeResponseSchema } },
    },
    ...buildErrorResponses(['INVALID_MASTER_PASSWORD', 'ACTION_VALIDATION_FAILED']),
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
// Register handlers
// ---------------------------------------------------------------------------

export function registerAdminAuthRoutes(router: OpenAPIHono, deps: AdminRouteDeps): void {
  // GET /admin/status
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
    const activeSessionResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(sessions)
      .where(
        sql`${sessions.revokedAt} IS NULL AND (${sessions.expiresAt} = 0 OR ${sessions.expiresAt} > ${nowSec})`,
      )
      .get();
    const activeSessionCount = activeSessionResult?.count ?? 0;

    // Count policies
    const policyCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(policies)
      .get();
    const policyCount = policyCountResult?.count ?? 0;

    // Count recent transactions (24h)
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
        txHash: transactions.txHash,
        chain: transactions.chain,
        tokenMint: transactions.tokenMint,
        contractAddress: transactions.contractAddress,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .orderBy(desc(transactions.createdAt))
      .limit(5)
      .all();

    // Pre-batch token lookups for recent transactions (NQ-05)
    const recentTokenAddrs = recentTxRows
      .map((tx) => ({ address: tx.tokenMint ?? tx.contractAddress ?? '', network: tx.network ?? null }))
      .filter((t) => t.address !== '');
    const recentTokenMap = buildTokenMap(recentTokenAddrs, deps.db);

    const recentTransactions = recentTxRows.map((tx) => {
      const tokenAddr = tx.tokenMint ?? tx.contractAddress ?? null;
      return {
      id: tx.id,
      walletId: tx.walletId,
      walletName: tx.walletName ?? null,
      type: tx.type,
      status: tx.status,
      toAddress: tx.toAddress ?? null,
      amount: tx.amount ?? null,
      formattedAmount: formatTxAmount(tx.amount ?? null, tx.chain, tx.network ?? null, tokenAddr, deps.db, recentTokenMap),
      amountUsd: tx.amountUsd ?? null,
      network: tx.network ?? null,
      txHash: tx.txHash ?? null,
      createdAt: tx.createdAt instanceof Date
        ? Math.floor(tx.createdAt.getTime() / 1000)
        : (typeof tx.createdAt === 'number' ? tx.createdAt : null),
    };
    });

    const ksState = deps.killSwitchService
      ? deps.killSwitchService.getState()
      : deps.getKillSwitchState();

    const latestVersion = deps.versionCheckService?.getLatest() ?? null;
    const updateAvailable = latestVersion !== null
      && semver.valid(latestVersion) !== null
      && semver.gt(latestVersion, deps.version);

    // Check for auto-provisioned status (recovery.key exists in data dir)
    const autoProvisioned = deps.dataDir
      ? existsSync(join(deps.dataDir, 'recovery.key'))
      : false;

    return c.json(
      {
        status: 'running',
        version: deps.version,
        latestVersion,
        updateAvailable,
        uptime,
        walletCount,
        activeSessionCount,
        killSwitchState: ksState.state,
        adminTimeout: deps.adminTimeout,
        timestamp: nowSec,
        policyCount,
        recentTxCount,
        failedTxCount,
        autoProvisioned,
        recentTransactions,
      },
      200,
    );
  });

  // POST /admin/kill-switch
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

  // GET /admin/kill-switch
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

  // POST /admin/kill-switch/escalate
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

  // POST /admin/recover (dual-auth recovery)
  router.openapi(recoverRoute, async (c) => {
    if (deps.killSwitchService) {
      const currentState = deps.killSwitchService.getState();

      if (currentState.state === 'ACTIVE') {
        throw new WAIaaSError('KILL_SWITCH_NOT_ACTIVE', {
          message: 'Kill switch is not active, nothing to recover',
        });
      }

      // Master password (masterAuth middleware) is sufficient for recovery.
      // Self-hosted daemon: admin with master password = server/DB access.
      // Dual-auth adds no real security but blocks emergency recovery.

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

  // POST /admin/shutdown
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

  // PUT /admin/master-password
  router.openapi(masterPasswordChangeRoute, async (c) => {
    const body = c.req.valid('json');
    const newPassword = body.newPassword;

    if (!deps.passwordRef) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: 'Password change not supported (passwordRef not available)',
      });
    }

    const oldPassword = deps.passwordRef.password;

    if (newPassword === oldPassword) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: 'New password must be different from the current password',
      });
    }

    // 1. Re-encrypt keystore files
    const { join } = await import('node:path');
    const { reEncryptKeystores, reEncryptSettings, reEncryptCredentials } = await import(
      '../../infrastructure/keystore/re-encrypt.js'
    );

    const keystoreDir = deps.dataDir ? join(deps.dataDir, 'keystore') : null;
    let walletsReEncrypted = 0;
    if (keystoreDir) {
      const { existsSync } = await import('node:fs');
      if (existsSync(keystoreDir)) {
        walletsReEncrypted = await reEncryptKeystores(keystoreDir, oldPassword, newPassword);
      }
    }

    // 2. Re-encrypt settings + API keys in DB
    const settingsReEncrypted = reEncryptSettings(
      deps.db,
      deps.sqlite,
      oldPassword,
      newPassword,
    );

    // 2b. Re-encrypt credential vault entries (v31.12)
    const credentialsReEncrypted = reEncryptCredentials(
      deps.db,
      deps.sqlite,
      oldPassword,
      newPassword,
    );

    // 3. Compute new Argon2id hash
    const argon2 = await import('argon2');
    const newHash = await argon2.default.hash(newPassword, {
      type: argon2.default.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    // 4. Update DB master_password_hash
    const { keyValueStore } = await import('../../infrastructure/database/schema.js');
    deps.db
      .update(keyValueStore)
      .set({ value: newHash, updatedAt: new Date() })
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .run();

    // 5. Update in-memory ref (live swap)
    deps.passwordRef.password = newPassword;
    deps.passwordRef.hash = newHash;

    // 6. Delete recovery.key if it exists (auto-provision -> manual)
    if (deps.dataDir) {
      const recoveryPath = join(deps.dataDir, 'recovery.key');
      const { existsSync, unlinkSync } = await import('node:fs');
      if (existsSync(recoveryPath)) {
        try {
          unlinkSync(recoveryPath);
        } catch {
          // Non-fatal: recovery.key cleanup failure
        }
      }
    }

    return c.json(
      {
        message: 'Master password changed successfully',
        walletsReEncrypted,
        settingsReEncrypted,
        credentialsReEncrypted,
      },
      200,
    );
  });

  // POST /admin/rotate-secret
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
}
