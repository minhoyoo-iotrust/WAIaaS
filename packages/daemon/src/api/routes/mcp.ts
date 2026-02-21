/**
 * MCP token provisioning route: POST /mcp/tokens.
 *
 * Combines session creation + token file writing + Claude Desktop config
 * snippet generation into a single request. Fixes BUG-013.
 *
 * Protected by masterAuth at the server level.
 *
 * @see objectives/bug-reports/v1.4.1-BUG-013-admin-mcp-token-provisioning.md
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { createHash } from 'node:crypto';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { eq, and, isNull, gt, sql } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { JwtSecretManager, JwtPayload } from '../../infrastructure/jwt/index.js';
import { generateId } from '../../infrastructure/database/id.js';
import { wallets, sessions, sessionWallets } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import {
  McpTokenCreateRequestSchema,
  McpTokenCreateResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpTokenRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  jwtSecretManager: JwtSecretManager;
  config: DaemonConfig;
  dataDir: string;
  notificationService?: NotificationService;
}

// ---------------------------------------------------------------------------
// Slug utility (local copy from CLI to avoid cross-package dependency)
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'wallet';
}

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

const createMcpTokenRoute = createRoute({
  method: 'post',
  path: '/mcp/tokens',
  tags: ['MCP'],
  summary: 'Create MCP token (session + file + config snippet)',
  request: {
    body: {
      content: {
        'application/json': { schema: McpTokenCreateRequestSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'MCP token created with Claude Desktop config snippet',
      content: { 'application/json': { schema: McpTokenCreateResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'SESSION_LIMIT_EXCEEDED']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create MCP token route sub-router.
 *
 * POST /mcp/tokens -> create session + write token file + return config snippet (201)
 */
export function mcpTokenRoutes(deps: McpTokenRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(createMcpTokenRoute, async (c) => {
    const parsed = c.req.valid('json');

    // 1. Verify wallet exists
    const wallet = deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, parsed.walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    // 2. Check active session count for this wallet
    const nowSec = Math.floor(Date.now() / 1000);
    const nowDate = new Date(nowSec * 1000);

    const activeCountResult = deps.db
      .select({ count: sql<number>`count(*)` })
      .from(sessionWallets)
      .innerJoin(sessions, eq(sessionWallets.sessionId, sessions.id))
      .where(
        and(
          eq(sessionWallets.walletId, parsed.walletId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, nowDate),
        ),
      )
      .get();

    const activeCount = activeCountResult?.count ?? 0;
    const maxSessions = deps.config.security.max_sessions_per_wallet;

    if (activeCount >= maxSessions) {
      throw new WAIaaSError('SESSION_LIMIT_EXCEEDED', {
        message: `Wallet has ${activeCount} active sessions (max: ${maxSessions})`,
      });
    }

    // 3. Generate session ID, compute TTL
    const sessionId = generateId();
    const ttl = parsed.expiresIn ?? deps.config.security.session_ttl;
    const expiresAt = nowSec + ttl;
    const absoluteExpiresAt = nowSec + deps.config.security.session_absolute_lifetime;

    // 4. Sign JWT
    const jwtPayload: JwtPayload = {
      sub: sessionId,
      wlt: parsed.walletId,
      iat: nowSec,
      exp: expiresAt,
    };
    const token = await deps.jwtSecretManager.signToken(jwtPayload);

    // 5. Compute tokenHash, insert session into DB
    const tokenHash = createHash('sha256').update(token).digest('hex');

    deps.db.insert(sessions).values({
      id: sessionId,
      tokenHash,
      expiresAt: new Date(expiresAt * 1000),
      absoluteExpiresAt: new Date(absoluteExpiresAt * 1000),
      createdAt: new Date(nowSec * 1000),
      renewalCount: 0,
      maxRenewals: deps.config.security.session_max_renewals,
      constraints: null,
      source: 'mcp',
    }).run();

    // Insert session_wallets link (v26.4: 1:N session-wallet model)
    deps.db.insert(sessionWallets).values({
      sessionId,
      walletId: parsed.walletId,
      isDefault: true,
      createdAt: new Date(nowSec * 1000),
    }).run();

    // 6. Write JWT to dataDir/mcp-tokens/<walletId> atomically
    const tokenPath = join(deps.dataDir, 'mcp-tokens', parsed.walletId);
    const tmpPath = `${tokenPath}.tmp`;
    await mkdir(dirname(tokenPath), { recursive: true });
    await writeFile(tmpPath, token, 'utf-8');
    await rename(tmpPath, tokenPath);

    // 7. Build Claude Desktop config snippet
    const port = deps.config.daemon.port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const slug = toSlug(wallet.name ?? parsed.walletId);

    const env: Record<string, string> = {
      WAIAAS_DATA_DIR: deps.dataDir,
      WAIAAS_BASE_URL: baseUrl,
      WAIAAS_WALLET_ID: parsed.walletId,
    };
    if (wallet.name) {
      env['WAIAAS_WALLET_NAME'] = wallet.name;
    }

    const claudeDesktopConfig: Record<string, unknown> = {
      [`waiaas-${slug}`]: {
        command: 'npx',
        args: ['@waiaas/mcp'],
        env,
      },
    };

    // 8. Fire-and-forget notification
    void deps.notificationService?.notify('SESSION_CREATED', parsed.walletId, {
      sessionId,
    });

    // 9. Return response
    return c.json(
      {
        walletId: parsed.walletId,
        walletName: wallet.name ?? null,
        tokenPath,
        expiresAt,
        claudeDesktopConfig,
      },
      201,
    );
  });

  return router;
}
