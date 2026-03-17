/**
 * Admin Monitoring route handlers: transactions, incoming, agent-prompt, session-reissue,
 * tx-cancel, tx-reject, backup, stats, autostop.
 *
 * Extracted from admin.ts for maintainability.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute, z } from '@hono/zod-openapi';
import { sql, desc, eq, and, isNull, gt, count as drizzleCount, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { WAIaaSError, getNetworksForEnvironment } from '@waiaas/core';
import type { ContractNameRegistry } from '@waiaas/core';
import type { JwtPayload } from '../../infrastructure/jwt/jwt-secret-manager.js';
import { wallets, sessions, sessionWallets, policies, transactions, incomingTransactions } from '../../infrastructure/database/schema.js';
import { generateId } from '../../infrastructure/database/id.js';
import { buildConnectInfoPrompt } from './connect-info.js';
import type { DefaultDenyStatus } from './connect-info.js';
import {
  AgentPromptRequestSchema,
  AgentPromptResponseSchema,
  SessionReissueResponseSchema,
  BackupInfoResponseSchema,
  BackupListResponseSchema,
  ErrorResponseSchema,
  buildErrorResponses,
} from './openapi-schemas.js';
import type { AdminRouteDeps } from './admin.js';
import { formatTxAmount, buildTokenMap } from './admin-wallets.js';

// ---------------------------------------------------------------------------
// Contract name resolution helper (v32.0 Phase 423)
// ---------------------------------------------------------------------------

/**
 * Resolve contract name fields for a transaction row.
 * Returns non-null contractName/contractNameSource only for CONTRACT_CALL
 * with a real (non-fallback) registry match.
 */
export function resolveContractFields(
  type: string,
  toAddress: string | null,
  network: string | null,
  registry?: ContractNameRegistry,
): { contractName: string | null; contractNameSource: string | null } {
  if (type !== 'CONTRACT_CALL' || !toAddress || !network || !registry) {
    return { contractName: null, contractNameSource: null };
  }
  const result = registry.resolve(toAddress, network);
  // fallback source means no real name was found -- return null to keep response clean
  if (result.source === 'fallback') {
    return { contractName: null, contractNameSource: null };
  }
  return { contractName: result.name, contractNameSource: result.source };
}

// ---------------------------------------------------------------------------
// Route definitions (top-level)
// ---------------------------------------------------------------------------

const adminTransactionsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  wallet_id: z.string().uuid().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  network: z.string().optional(),
  since: z.coerce.number().optional(),
  until: z.coerce.number().optional(),
  search: z.string().optional(),
});

const adminTransactionsRoute = createRoute({
  method: 'get',
  path: '/admin/transactions',
  tags: ['Admin'],
  summary: 'List cross-wallet transactions with filters and pagination',
  request: {
    query: adminTransactionsQuerySchema,
  },
  responses: {
    200: {
      description: 'Paginated cross-wallet transaction list',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                walletId: z.string(),
                walletName: z.string().nullable(),
                type: z.string(),
                status: z.string(),
                tier: z.string().nullable(),
                toAddress: z.string().nullable(),
                amount: z.string().nullable(),
                amountUsd: z.number().nullable(),
                network: z.string().nullable(),
                txHash: z.string().nullable(),
                chain: z.string(),
                createdAt: z.number().nullable(),
                contractName: z.string().nullable().optional(),
                contractNameSource: z.string().nullable().optional(),
              }),
            ),
            total: z.number().int(),
            offset: z.number().int(),
            limit: z.number().int(),
          }),
        },
      },
    },
  },
});

const adminIncomingQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  wallet_id: z.string().uuid().optional(),
  chain: z.string().optional(),
  status: z.string().optional(),
  suspicious: z.enum(['true', 'false']).optional(),
});

const adminIncomingRoute = createRoute({
  method: 'get',
  path: '/admin/incoming',
  tags: ['Admin'],
  summary: 'List cross-wallet incoming transactions with filters and pagination',
  request: {
    query: adminIncomingQuerySchema,
  },
  responses: {
    200: {
      description: 'Paginated cross-wallet incoming transaction list',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(
              z.object({
                id: z.string(),
                txHash: z.string(),
                walletId: z.string(),
                walletName: z.string().nullable(),
                fromAddress: z.string(),
                amount: z.string(),
                tokenAddress: z.string().nullable(),
                chain: z.string(),
                network: z.string(),
                status: z.string(),
                blockNumber: z.number().nullable(),
                detectedAt: z.number().nullable(),
                confirmedAt: z.number().nullable(),
                suspicious: z.boolean(),
              }),
            ),
            total: z.number().int(),
            offset: z.number().int(),
            limit: z.number().int(),
          }),
        },
      },
    },
  },
});

// ---------------------------------------------------------------------------
// Register handlers
// ---------------------------------------------------------------------------

export function registerAdminMonitoringRoutes(router: OpenAPIHono, deps: AdminRouteDeps): void {
  // GET /admin/transactions (cross-wallet transaction list)
  router.openapi(adminTransactionsRoute, async (c) => {
    const query = c.req.valid('query');
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

    // Build WHERE conditions
    const conditions = [];
    if (query.wallet_id) {
      conditions.push(eq(transactions.walletId, query.wallet_id));
    }
    if (query.type) {
      conditions.push(eq(transactions.type, query.type));
    }
    if (query.status) {
      conditions.push(eq(transactions.status, query.status));
    }
    if (query.network) {
      conditions.push(eq(transactions.network, query.network));
    }
    if (query.since !== undefined) {
      conditions.push(sql`${transactions.createdAt} >= ${query.since}`);
    }
    if (query.until !== undefined) {
      conditions.push(sql`${transactions.createdAt} <= ${query.until}`);
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(sql`(${transactions.txHash} LIKE ${pattern} OR ${transactions.toAddress} LIKE ${pattern})`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const totalResult = deps.db
      .select({ count: drizzleCount() })
      .from(transactions)
      .where(whereClause)
      .get();
    const total = totalResult?.count ?? 0;

    // Query with JOIN for walletName
    const rows = deps.db
      .select({
        id: transactions.id,
        walletId: transactions.walletId,
        walletName: wallets.name,
        type: transactions.type,
        status: transactions.status,
        tier: transactions.tier,
        toAddress: transactions.toAddress,
        amount: transactions.amount,
        amountUsd: transactions.amountUsd,
        network: transactions.network,
        txHash: transactions.txHash,
        chain: transactions.chain,
        createdAt: transactions.createdAt,
        tokenMint: transactions.tokenMint,
        contractAddress: transactions.contractAddress,
      })
      .from(transactions)
      .leftJoin(wallets, eq(transactions.walletId, wallets.id))
      .where(whereClause)
      .orderBy(desc(transactions.createdAt))
      .offset(offset)
      .limit(limit)
      .all();

    // Pre-batch token lookups (NQ-05)
    const txTokenAddrs = rows
      .map((row) => ({ address: row.tokenMint ?? row.contractAddress ?? '', network: row.network ?? null }))
      .filter((t) => t.address !== '');
    const txTokenMap = buildTokenMap(txTokenAddrs, deps.db);

    const items = rows.map((row) => {
      const tokenAddr = row.tokenMint ?? row.contractAddress ?? null;
      return {
        id: row.id,
        walletId: row.walletId,
        walletName: row.walletName ?? null,
        type: row.type,
        status: row.status,
        tier: row.tier ?? null,
        toAddress: row.toAddress ?? null,
        amount: row.amount ?? null,
        formattedAmount: formatTxAmount(row.amount ?? null, row.chain, row.network ?? null, tokenAddr, deps.db, txTokenMap),
        amountUsd: row.amountUsd ?? null,
        network: row.network ?? null,
        txHash: row.txHash ?? null,
        chain: row.chain,
        createdAt: row.createdAt instanceof Date
          ? Math.floor(row.createdAt.getTime() / 1000)
          : (typeof row.createdAt === 'number' ? row.createdAt : null),
        ...resolveContractFields(row.type, row.toAddress ?? null, row.network ?? null, deps.contractNameRegistry),
      };
    });

    return c.json({ items, total, offset, limit }, 200);
  });

  // GET /admin/incoming (cross-wallet incoming transaction list)
  router.openapi(adminIncomingRoute, async (c) => {
    const query = c.req.valid('query');
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

    // Build WHERE conditions (no default status filter -- admin sees all)
    const conditions = [];
    if (query.wallet_id) {
      conditions.push(eq(incomingTransactions.walletId, query.wallet_id));
    }
    if (query.chain) {
      conditions.push(eq(incomingTransactions.chain, query.chain));
    }
    if (query.status) {
      conditions.push(eq(incomingTransactions.status, query.status));
    }
    if (query.suspicious !== undefined) {
      conditions.push(eq(incomingTransactions.isSuspicious, query.suspicious === 'true'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total
    const totalResult = deps.db
      .select({ count: drizzleCount() })
      .from(incomingTransactions)
      .where(whereClause)
      .get();
    const total = totalResult?.count ?? 0;

    // Query with JOIN for walletName
    const rows = deps.db
      .select({
        id: incomingTransactions.id,
        txHash: incomingTransactions.txHash,
        walletId: incomingTransactions.walletId,
        walletName: wallets.name,
        fromAddress: incomingTransactions.fromAddress,
        amount: incomingTransactions.amount,
        tokenAddress: incomingTransactions.tokenAddress,
        chain: incomingTransactions.chain,
        network: incomingTransactions.network,
        status: incomingTransactions.status,
        blockNumber: incomingTransactions.blockNumber,
        detectedAt: incomingTransactions.detectedAt,
        confirmedAt: incomingTransactions.confirmedAt,
        isSuspicious: incomingTransactions.isSuspicious,
      })
      .from(incomingTransactions)
      .leftJoin(wallets, eq(incomingTransactions.walletId, wallets.id))
      .where(whereClause)
      .orderBy(desc(incomingTransactions.detectedAt))
      .offset(offset)
      .limit(limit)
      .all();

    // Pre-batch token lookups for incoming transactions (NQ-05)
    const inTokenAddrs = rows
      .map((row) => ({ address: row.tokenAddress ?? '', network: row.network ?? null }))
      .filter((t) => t.address !== '');
    const inTokenMap = buildTokenMap(inTokenAddrs, deps.db);

    const items = rows.map((row) => ({
      id: row.id,
      txHash: row.txHash,
      walletId: row.walletId,
      walletName: row.walletName ?? null,
      fromAddress: row.fromAddress,
      amount: row.amount,
      formattedAmount: formatTxAmount(row.amount, row.chain, row.network, row.tokenAddress ?? null, deps.db, inTokenMap),
      tokenAddress: row.tokenAddress ?? null,
      chain: row.chain,
      network: row.network,
      status: row.status,
      blockNumber: row.blockNumber ?? null,
      detectedAt: row.detectedAt instanceof Date
        ? Math.floor(row.detectedAt.getTime() / 1000)
        : (typeof row.detectedAt === 'number' ? row.detectedAt : null),
      confirmedAt: row.confirmedAt instanceof Date
        ? Math.floor(row.confirmedAt.getTime() / 1000)
        : (typeof row.confirmedAt === 'number' ? row.confirmedAt : null),
      suspicious: row.isSuspicious ?? false,
    }));

    return c.json({ items, total, offset, limit }, 200);
  });

  // POST /admin/agent-prompt -- Generate agent connection prompt
  const agentPromptRoute = createRoute({
    method: 'post',
    path: '/admin/agent-prompt',
    tags: ['Admin'],
    summary: 'Generate agent connection prompt (magic word)',
    request: {
      body: {
        content: { 'application/json': { schema: AgentPromptRequestSchema } },
      },
    },
    responses: {
      201: {
        description: 'Agent prompt generated',
        content: { 'application/json': { schema: AgentPromptResponseSchema } },
      },
      ...buildErrorResponses(['ADAPTER_NOT_AVAILABLE']),
    },
  });

  router.openapi(agentPromptRoute, async (c) => {
    if (!deps.jwtSecretManager || !deps.daemonConfig) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', { message: 'JWT signing not available' });
    }

    const body = c.req.valid('json');
    const nowSec = Math.floor(Date.now() / 1000);
    // v29.9: per-session TTL; omit = unlimited
    const ttl = body.ttl; // undefined = unlimited session
    const expiresAt = ttl !== undefined ? nowSec + ttl : 0; // 0 = unlimited

    // Get target wallets (with environment for prompt builder)
    let targetWallets: Array<{ id: string; name: string; chain: string; environment: string; publicKey: string }>;

    if (body.walletIds && body.walletIds.length > 0) {
      // NQ-02: batch wallet fetch via single IN() query instead of N individual queries
      const walletRows = deps.db
        .select()
        .from(wallets)
        .where(inArray(wallets.id, body.walletIds))
        .all();
      targetWallets = walletRows
        .filter((w) => w.status === 'ACTIVE')
        .map((w) => ({ id: w.id, name: w.name, chain: w.chain, environment: w.environment, publicKey: w.publicKey }));
    } else {
      targetWallets = deps.db
        .select()
        .from(wallets)
        .where(eq(wallets.status, 'ACTIVE'))
        .all()
        .map((w) => ({ id: w.id, name: w.name, chain: w.chain, environment: w.environment, publicKey: w.publicKey }));
    }

    if (targetWallets.length === 0) {
      return c.json(
        { prompt: '', walletCount: 0, sessionsCreated: 0, sessionReused: false, expiresAt },
        201,
      );
    }

    // Try to reuse an existing valid session covering all target wallets
    const defaultWallet = targetWallets[0]!;
    const targetWalletIds = targetWallets.map((w) => w.id);

    let sessionId: string;
    let sessionReused = false;
    let sessionsCreated = 1;
    let actualExpiresAt = expiresAt;

    // Find active sessions that cover all target wallets
    const candidateSessions = deps.db
      .select({
        id: sessions.id,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          isNull(sessions.revokedAt),
          ttl !== undefined
            ? gt(sessions.expiresAt, new Date((nowSec + Math.max(Math.floor(ttl * 0.1), 3600)) * 1000))
            : sql`(${sessions.expiresAt} = 0 OR ${sessions.expiresAt} > ${nowSec})`,
        ),
      )
      .all();

    let reusableSessionId: string | null = null;
    let reusableExpiresAt = 0;

    // NQ-03: batch linked count via single GROUP BY query instead of N individual queries
    const candidateIds = candidateSessions.map((c) => c.id);
    const linkedCounts = candidateIds.length > 0 && targetWalletIds.length > 0
      ? deps.db
          .select({
            sessionId: sessionWallets.sessionId,
            cnt: drizzleCount(),
          })
          .from(sessionWallets)
          .where(
            and(
              inArray(sessionWallets.sessionId, candidateIds),
              inArray(sessionWallets.walletId, targetWalletIds),
            ),
          )
          .groupBy(sessionWallets.sessionId)
          .all()
      : [];
    const countMap = new Map(linkedCounts.map((r) => [r.sessionId, r.cnt]));
    for (const candidate of candidateSessions) {
      if ((countMap.get(candidate.id) ?? 0) === targetWalletIds.length) {
        reusableSessionId = candidate.id;
        reusableExpiresAt = candidate.expiresAt instanceof Date
          ? Math.floor(candidate.expiresAt.getTime() / 1000)
          : (candidate.expiresAt as number);
        break;
      }
    }

    if (reusableSessionId) {
      // Reuse existing session
      sessionId = reusableSessionId;
      sessionReused = true;
      sessionsCreated = 0;
      actualExpiresAt = reusableExpiresAt;
    } else {
      // Create a new multi-wallet session
      sessionId = generateId();

      deps.db.insert(sessions).values({
        id: sessionId,
        tokenHash: '',
        expiresAt: new Date(expiresAt * 1000),
        absoluteExpiresAt: new Date(0), // unlimited
        createdAt: new Date(nowSec * 1000),
        renewalCount: 0,
        maxRenewals: 0, // unlimited
        constraints: null,
        source: 'api',
      }).run();

      // Insert N rows into session_wallets
      for (let i = 0; i < targetWallets.length; i++) {
        const w = targetWallets[i]!;
        deps.db.insert(sessionWallets).values({
          sessionId,
          walletId: w.id,
          createdAt: new Date(nowSec * 1000),
        }).run();
      }

      void deps.notificationService?.notify('SESSION_CREATED', defaultWallet.id, { sessionId });
    }

    // Sign JWT
    const jwtPayload: JwtPayload = {
      sub: sessionId,
      iat: nowSec,
      exp: actualExpiresAt > 0 ? actualExpiresAt : undefined,
    };
    const token = await deps.jwtSecretManager.signToken(jwtPayload);

    if (!sessionReused) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      deps.db.update(sessions).set({ tokenHash }).where(eq(sessions.id, sessionId)).run();
    }

    // Query per-wallet policies for prompt builder
    const promptWallets = targetWallets.map((w) => {
      const walletPolicies = deps.db
        .select({ type: policies.type })
        .from(policies)
        .where(and(eq(policies.walletId, w.id), eq(policies.enabled, true)))
        .all();

      const networks = getNetworksForEnvironment(
        w.chain as Parameters<typeof getNetworksForEnvironment>[0],
        w.environment as Parameters<typeof getNetworksForEnvironment>[1],
      );

      return {
        id: w.id,
        name: w.name,
        chain: w.chain,
        environment: w.environment,
        address: w.publicKey,
        networks: networks.map((n) => n),
        policies: walletPolicies,
      };
    });

    // Compute capabilities dynamically (same logic as connect-info)
    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];

    if (deps.settingsService) {
      try {
        if (deps.settingsService.get('signing_sdk.enabled') === 'true') {
          capabilities.push('sign');
        }
      } catch {
        // Setting key not found -- signing not available
      }
    }

    if (deps.settingsService && deps.actionProviderRegistry) {
      try {
        const providers = deps.actionProviderRegistry.listProviders();
        const hasAnyKey = providers.some(
          (p) => p.requiresApiKey && deps.settingsService!.hasApiKey(p.name),
        );
        if (hasAnyKey) {
          capabilities.push('actions');
        }
      } catch {
        // Settings service not available
      }
    }

    if (deps.daemonConfig?.x402?.enabled === true) {
      capabilities.push('x402');
    }

    // Read default-deny toggles
    const defaultDeny: DefaultDenyStatus = {
      tokenTransfers: deps.settingsService?.get('policy.default_deny_tokens') !== 'false',
      contractCalls: deps.settingsService?.get('policy.default_deny_contracts') !== 'false',
      tokenApprovals: deps.settingsService?.get('policy.default_deny_spenders') !== 'false',
      x402Domains: deps.settingsService?.get('policy.default_deny_x402_domains') !== 'false',
    };

    // Build prompt using shared prompt builder
    const host = c.req.header('Host') ?? 'localhost:3100';
    const protocol = c.req.header('X-Forwarded-Proto') ?? 'http';
    const baseUrl = `${protocol}://${host}`;

    const prompt = buildConnectInfoPrompt({
      wallets: promptWallets,
      capabilities,
      defaultDeny,
      baseUrl,
      version: deps.version,
    });

    // Append session token so the agent can start using it immediately
    const fullPrompt = `${prompt}\n\nSession Token: ${token}\nSession ID: ${sessionId}`;

    return c.json(
      {
        prompt: fullPrompt,
        walletCount: targetWallets.length,
        sessionsCreated,
        sessionReused,
        expiresAt: actualExpiresAt,
      },
      201,
    );
  });

  // POST /admin/sessions/:id/reissue -- Reissue session token
  const sessionReissueRoute = createRoute({
    method: 'post',
    path: '/admin/sessions/{id}/reissue',
    tags: ['Admin'],
    summary: 'Reissue session token (re-sign JWT for existing session)',
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Token reissued',
        content: { 'application/json': { schema: SessionReissueResponseSchema } },
      },
      ...buildErrorResponses(['SESSION_NOT_FOUND', 'SESSION_REVOKED']),
    },
  });

  router.openapi(sessionReissueRoute, async (c) => {
    if (!deps.jwtSecretManager) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', { message: 'JWT signing not available' });
    }

    const { id: sessionId } = c.req.valid('param');
    const nowSec = Math.floor(Date.now() / 1000);

    // Find session
    const session = deps.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();

    if (!session) {
      throw new WAIaaSError('SESSION_NOT_FOUND');
    }

    if (session.revokedAt) {
      throw new WAIaaSError('SESSION_REVOKED');
    }

    const expiresAtSec = session.expiresAt instanceof Date
      ? Math.floor(session.expiresAt.getTime() / 1000)
      : (session.expiresAt as number);

    if (expiresAtSec > 0 && expiresAtSec <= nowSec) {
      throw new WAIaaSError('SESSION_NOT_FOUND', { message: 'Session expired' });
    }

    // Re-sign JWT (no wallet claim needed -- walletId resolved at request time)
    const jwtPayload: JwtPayload = {
      sub: sessionId,
      iat: nowSec,
      ...(expiresAtSec > 0 ? { exp: expiresAtSec } : {}),
    };
    const token = await deps.jwtSecretManager.signToken(jwtPayload);

    // Increment token_issued_count
    const newCount = (session.tokenIssuedCount ?? 1) + 1;
    deps.db.update(sessions)
      .set({ tokenIssuedCount: newCount })
      .where(eq(sessions.id, sessionId))
      .run();

    return c.json({
      token,
      sessionId,
      tokenIssuedCount: newCount,
      expiresAt: expiresAtSec,
    }, 200);
  });

  // POST /admin/transactions/:id/cancel -- Cancel a QUEUED (DELAY) transaction
  const adminTxCancelRoute = createRoute({
    method: 'post',
    path: '/admin/transactions/{id}/cancel',
    tags: ['Admin'],
    summary: 'Cancel a delayed (QUEUED) transaction',
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Transaction cancelled',
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              status: z.literal('CANCELLED'),
            }),
          },
        },
      },
      ...buildErrorResponses(['TX_NOT_FOUND']),
    },
  });

  router.openapi(adminTxCancelRoute, async (c) => {
    const { id: txId } = c.req.valid('param');

    if (!deps.delayQueue) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'Delay queue not available',
      });
    }

    deps.delayQueue.cancelDelay(txId);

    return c.json({ id: txId, status: 'CANCELLED' as const }, 200);
  });

  // POST /admin/transactions/:id/reject -- Reject a pending (APPROVAL) transaction
  const adminTxRejectRoute = createRoute({
    method: 'post',
    path: '/admin/transactions/{id}/reject',
    tags: ['Admin'],
    summary: 'Reject a pending approval transaction',
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Transaction rejected',
        content: {
          'application/json': {
            schema: z.object({
              id: z.string(),
              status: z.literal('CANCELLED'),
              rejectedAt: z.number(),
            }),
          },
        },
      },
      ...buildErrorResponses(['TX_NOT_FOUND']),
    },
  });

  router.openapi(adminTxRejectRoute, async (c) => {
    const { id: txId } = c.req.valid('param');

    if (!deps.approvalWorkflow) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'Approval workflow not available',
      });
    }

    const result = deps.approvalWorkflow.reject(txId);

    return c.json({
      id: txId,
      status: 'CANCELLED' as const,
      rejectedAt: result.rejectedAt,
    }, 200);
  });

  // POST /admin/backup (create encrypted backup)
  const createBackupRoute = createRoute({
    method: 'post',
    path: '/admin/backup',
    tags: ['Admin'],
    summary: 'Create an encrypted backup',
    responses: {
      200: {
        description: 'Backup created successfully',
        content: { 'application/json': { schema: BackupInfoResponseSchema } },
      },
      401: {
        description: 'Master password not available',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      501: {
        description: 'Backup service not configured',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      ...buildErrorResponses(['INVALID_MASTER_PASSWORD']),
    },
  });

  router.openapi(createBackupRoute, async (c) => {
    if (!deps.encryptedBackupService) {
      return c.json({ code: 'NOT_CONFIGURED', message: 'Backup service not configured', retryable: false }, 501);
    }
    if (!deps.passwordRef?.password) {
      return c.json({ code: 'INVALID_MASTER_PASSWORD', message: 'Master password not available', retryable: false }, 401);
    }

    const info = await deps.encryptedBackupService.createBackup(deps.passwordRef.password);
    return c.json(info, 200);
  });

  // GET /admin/backups (list backups)
  const listBackupsRoute = createRoute({
    method: 'get',
    path: '/admin/backups',
    tags: ['Admin'],
    summary: 'List available backups',
    responses: {
      200: {
        description: 'Backup list',
        content: { 'application/json': { schema: BackupListResponseSchema } },
      },
      501: {
        description: 'Backup service not configured',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  router.openapi(listBackupsRoute, async (c) => {
    if (!deps.encryptedBackupService) {
      return c.json({ code: 'NOT_CONFIGURED', message: 'Backup service not configured', retryable: false }, 501);
    }

    const backups = deps.encryptedBackupService.listBackups();
    const retentionCount = deps.daemonConfig?.backup?.retention_count ?? 7;
    return c.json({ backups, total: backups.length, retention_count: retentionCount }, 200);
  });

  // GET /admin/stats -- 7-category operational statistics (STAT-01)
  const adminStatsRoute = createRoute({
    method: 'get',
    path: '/admin/stats',
    tags: ['Admin'],
    summary: 'Get operational statistics',
    responses: {
      200: {
        description: 'Operational statistics (7 categories)',
        content: { 'application/json': { schema: z.any() } },
      },
    },
  });

  router.openapi(adminStatsRoute, async (c) => {
    if (!deps.adminStatsService) {
      throw new WAIaaSError('STATS_NOT_CONFIGURED');
    }

    const stats = deps.adminStatsService.getStats();
    return c.json(stats, 200);
  });

  // GET /admin/autostop/rules -- List AutoStop rules with status (PLUG-03)
  const autostopRulesRoute = createRoute({
    method: 'get',
    path: '/admin/autostop/rules',
    tags: ['Admin'],
    summary: 'List AutoStop rules with status',
    responses: {
      200: {
        description: 'AutoStop rules list',
        content: { 'application/json': { schema: z.any() } },
      },
    },
  });

  router.openapi(autostopRulesRoute, async (c) => {
    if (!deps.autoStopService) {
      return c.json({ globalEnabled: false, rules: [] }, 200);
    }

    const status = deps.autoStopService.getStatus();
    const registry = deps.autoStopService.registry;
    const rules = registry.getRules().map((r) => {
      const ruleStatus = r.getStatus();
      return {
        id: r.id,
        displayName: r.displayName,
        description: r.description,
        enabled: r.enabled,
        subscribedEvents: r.subscribedEvents,
        config: ruleStatus.config,
        state: ruleStatus.state,
      };
    });

    return c.json({ globalEnabled: status.enabled, rules }, 200);
  });

  // PUT /admin/autostop/rules/:id -- Update AutoStop rule (PLUG-03)
  const autostopRuleUpdateRoute = createRoute({
    method: 'put',
    path: '/admin/autostop/rules/{id}',
    tags: ['Admin'],
    summary: 'Update AutoStop rule enabled/config',
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              enabled: z.boolean().optional(),
              config: z.record(z.unknown()).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Rule updated',
        content: { 'application/json': { schema: z.any() } },
      },
      404: {
        description: 'Rule not found',
        content: { 'application/json': { schema: z.any() } },
      },
    },
  });

  router.openapi(autostopRuleUpdateRoute, async (c) => {
    if (!deps.autoStopService) {
      throw new WAIaaSError('RULE_NOT_FOUND');
    }

    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const registry = deps.autoStopService.registry;
    const rule = registry.getRule(id);

    if (!rule) {
      throw new WAIaaSError('RULE_NOT_FOUND');
    }

    // Update enabled state
    if (body.enabled !== undefined) {
      registry.setEnabled(id, body.enabled);

      // Persist to Admin Settings
      if (deps.settingsService) {
        deps.settingsService.set(`autostop.rule.${id}.enabled`, String(body.enabled));
      }
    }

    // Update config
    if (body.config) {
      rule.updateConfig(body.config);
    }

    // Return updated rule info
    const ruleStatus = rule.getStatus();
    return c.json({
      id: rule.id,
      displayName: rule.displayName,
      description: rule.description,
      enabled: rule.enabled,
      subscribedEvents: rule.subscribedEvents,
      config: ruleStatus.config,
      state: ruleStatus.state,
    }, 200);
  });
}
