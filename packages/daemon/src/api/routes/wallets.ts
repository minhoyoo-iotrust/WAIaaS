/**
 * Wallet route handlers: POST /v1/wallets, GET /v1/wallets, GET /v1/wallets/:id,
 * PUT /v1/wallets/:id/owner.
 *
 * POST /v1/wallets: create a wallet with key pair.
 * GET /v1/wallets: list all wallets (masterAuth).
 * GET /v1/wallets/:id: get wallet detail including ownerState (masterAuth).
 * PUT /v1/wallets/:id/owner: register/change owner address (masterAuth).
 *
 * v1.2: Protected by masterAuth middleware (X-Master-Password header required),
 *       applied at server level in createApp().
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { WAIaaSError, getDefaultNetwork, getNetworksForEnvironment, validateNetworkEnvironment } from '@waiaas/core';
import type { ChainType, EnvironmentType, NetworkType, EventBus } from '@waiaas/core';
import { wallets, sessions, sessionWallets, transactions } from '../../infrastructure/database/schema.js';
import { generateId } from '../../infrastructure/database/id.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { JwtSecretManager, JwtPayload } from '../../infrastructure/jwt/index.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveOwnerState, OwnerLifecycleService } from '../../workflow/owner-state.js';
import { validateOwnerAddress } from '../middleware/address-validation.js';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import {
  CreateWalletRequestOpenAPI,
  WalletCreateResponseSchema,
  SetOwnerRequestSchema,
  UpdateWalletRequestSchema,
  UpdateDefaultNetworkRequestSchema,
  UpdateDefaultNetworkResponseSchema,
  WalletNetworksResponseSchema,
  WalletCrudResponseSchema,
  WalletOwnerResponseSchema,
  OwnerVerifyResponseSchema,
  WalletListResponseSchema,
  WalletDetailResponseSchema,
  WalletDeleteResponseSchema,
  WithdrawResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

export interface WalletCrudRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: SQLiteDatabase;
  keyStore: LocalKeyStore;
  masterPassword: string;
  config: DaemonConfig;
  adapterPool?: AdapterPool;
  notificationService?: NotificationService;
  eventBus?: EventBus;
  jwtSecretManager?: JwtSecretManager;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const createWalletRoute = createRoute({
  method: 'post',
  path: '/wallets',
  tags: ['Wallets'],
  summary: 'Create a new wallet',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateWalletRequestOpenAPI },
      },
    },
  },
  responses: {
    201: {
      description: 'Wallet created (with optional auto-created session)',
      content: { 'application/json': { schema: WalletCreateResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'ACTION_VALIDATION_FAILED']),
  },
});

const setOwnerRoute = createRoute({
  method: 'put',
  path: '/wallets/{id}/owner',
  tags: ['Wallets'],
  summary: 'Set wallet owner address',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: SetOwnerRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Owner updated',
      content: { 'application/json': { schema: WalletOwnerResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'OWNER_ALREADY_CONNECTED']),
  },
});

const verifyOwnerRoute = createRoute({
  method: 'post',
  path: '/wallets/{id}/owner/verify',
  tags: ['Wallets'],
  summary: 'Verify owner via signature (GRACE -> LOCKED)',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Owner verified',
      content: { 'application/json': { schema: OwnerVerifyResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'OWNER_NOT_CONNECTED', 'INVALID_SIGNATURE']),
  },
});

const listWalletsRoute = createRoute({
  method: 'get',
  path: '/wallets',
  tags: ['Wallets'],
  summary: 'List all wallets',
  responses: {
    200: {
      description: 'Wallet list',
      content: { 'application/json': { schema: WalletListResponseSchema } },
    },
  },
});

const walletDetailRoute = createRoute({
  method: 'get',
  path: '/wallets/{id}',
  tags: ['Wallets'],
  summary: 'Get wallet details',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Wallet detail with owner state',
      content: { 'application/json': { schema: WalletDetailResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const updateWalletRoute = createRoute({
  method: 'put',
  path: '/wallets/{id}',
  tags: ['Wallets'],
  summary: 'Update wallet name',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: UpdateWalletRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Wallet updated',
      content: { 'application/json': { schema: WalletCrudResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

const deleteWalletRoute = createRoute({
  method: 'delete',
  path: '/wallets/{id}',
  tags: ['Wallets'],
  summary: 'Terminate wallet',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Wallet terminated',
      content: { 'application/json': { schema: WalletDeleteResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'WALLET_TERMINATED']),
  },
});

const updateDefaultNetworkRoute = createRoute({
  method: 'put',
  path: '/wallets/{id}/default-network',
  tags: ['Wallets'],
  summary: 'Update wallet default network',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: UpdateDefaultNetworkRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Default network updated',
      content: { 'application/json': { schema: UpdateDefaultNetworkResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND', 'WALLET_TERMINATED', 'ENVIRONMENT_NETWORK_MISMATCH']),
  },
});

const walletNetworksRoute = createRoute({
  method: 'get',
  path: '/wallets/{id}/networks',
  tags: ['Wallets'],
  summary: 'List available networks for wallet',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Available networks',
      content: { 'application/json': { schema: WalletNetworksResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create wallet CRUD route sub-router.
 *
 * GET  /wallets -> list all wallets (masterAuth).
 * GET  /wallets/:id -> get wallet detail with ownerState (masterAuth).
 * POST /wallets -> creates wallet with key pair, inserts to DB, returns 201.
 * PUT  /wallets/:id/owner -> register/change owner address (masterAuth).
 */
export function walletCrudRoutes(deps: WalletCrudRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });
  const ownerLifecycle = new OwnerLifecycleService({ db: deps.db, sqlite: deps.sqlite });

  // ---------------------------------------------------------------------------
  // GET /wallets (list)
  // ---------------------------------------------------------------------------

  router.openapi(listWalletsRoute, async (c) => {
    const allWallets = await deps.db.select().from(wallets);

    return c.json(
      {
        items: allWallets.map((a) => ({
          id: a.id,
          name: a.name,
          chain: a.chain,
          network: a.defaultNetwork!,
          environment: a.environment!,
          publicKey: a.publicKey,
          status: a.status,
          ownerAddress: a.ownerAddress ?? null,
          ownerState: resolveOwnerState({
            ownerAddress: a.ownerAddress,
            ownerVerified: a.ownerVerified,
          }),
          createdAt: a.createdAt ? Math.floor(a.createdAt.getTime() / 1000) : 0,
        })),
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /wallets/:id (detail)
  // ---------------------------------------------------------------------------

  router.openapi(walletDetailRoute, async (c) => {
    const { id: walletId } = c.req.valid('param');

    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    const ownerState = resolveOwnerState({
      ownerAddress: wallet.ownerAddress,
      ownerVerified: wallet.ownerVerified,
    });

    return c.json(
      {
        id: wallet.id,
        name: wallet.name,
        chain: wallet.chain,
        network: wallet.defaultNetwork!,
        environment: wallet.environment!,
        publicKey: wallet.publicKey,
        status: wallet.status,
        ownerAddress: wallet.ownerAddress,
        ownerVerified: wallet.ownerVerified,
        ownerState,
        approvalMethod: wallet.ownerApprovalMethod ?? null,
        createdAt: wallet.createdAt ? Math.floor(wallet.createdAt.getTime() / 1000) : 0,
        updatedAt: wallet.updatedAt ? Math.floor(wallet.updatedAt.getTime() / 1000) : null,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /wallets
  // ---------------------------------------------------------------------------

  router.openapi(createWalletRoute, async (c) => {
    // OpenAPIHono validates the body automatically via createRoute schema
    const parsed = c.req.valid('json');
    const chain = parsed.chain as ChainType;
    const environment = parsed.environment as EnvironmentType;

    // Derive default network from chain + environment
    const defaultNetwork = getDefaultNetwork(chain, environment);

    // Generate wallet ID
    const id = generateId();

    // Generate key pair via keystore
    const { publicKey } = await deps.keyStore.generateKeyPair(
      id,
      chain,
      defaultNetwork,
      deps.masterPassword,
    );

    // Insert into wallets table
    const now = new Date(Math.floor(Date.now() / 1000) * 1000); // truncate to seconds

    await deps.db.insert(wallets).values({
      id,
      name: parsed.name,
      chain: parsed.chain,
      environment,
      defaultNetwork,
      publicKey,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    // Auto-create session if requested (default: true)
    let session: { id: string; token: string; expiresAt: number } | null = null;

    if (parsed.createSession && deps.jwtSecretManager) {
      const nowSec = Math.floor(now.getTime() / 1000);
      const ttl = deps.config.security.session_ttl;
      const expiresAt = nowSec + ttl;
      const absoluteExpiresAt = nowSec + deps.config.security.session_absolute_lifetime;

      const sessionId = generateId();
      const jwtPayload: JwtPayload = {
        sub: sessionId,
        wlt: id,
        iat: nowSec,
        exp: expiresAt,
      };
      const token = await deps.jwtSecretManager.signToken(jwtPayload);
      const tokenHash = createHash('sha256').update(token).digest('hex');

      deps.db.insert(sessions).values({
        id: sessionId,
        tokenHash,
        expiresAt: new Date(expiresAt * 1000),
        absoluteExpiresAt: new Date(absoluteExpiresAt * 1000),
        createdAt: now,
        renewalCount: 0,
        maxRenewals: deps.config.security.session_max_renewals,
        constraints: null,
      }).run();

      // Insert session_wallets link (v26.4: 1:N session-wallet model)
      deps.db.insert(sessionWallets).values({
        sessionId,
        walletId: id,
        isDefault: true,
        createdAt: now,
      }).run();

      session = { id: sessionId, token, expiresAt };

      void deps.notificationService?.notify('SESSION_CREATED', id, { sessionId });
      deps.eventBus?.emit('wallet:activity', {
        walletId: id,
        activity: 'SESSION_CREATED',
        details: { sessionId },
        timestamp: Math.floor(Date.now() / 1000),
      });
    }

    // Return 201 with wallet JSON (network field for backward compatibility)
    return c.json(
      {
        id,
        name: parsed.name,
        chain: parsed.chain,
        network: defaultNetwork,
        environment,
        publicKey,
        status: 'ACTIVE',
        ownerAddress: null,
        ownerState: 'NONE' as const,
        createdAt: Math.floor(now.getTime() / 1000),
        session,
      },
      201,
    );
  });

  // ---------------------------------------------------------------------------
  // PUT /wallets/:id (update name)
  // ---------------------------------------------------------------------------

  router.openapi(updateWalletRoute, async (c) => {
    const { id: walletId } = c.req.valid('param');
    const body = c.req.valid('json');

    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    await deps.db
      .update(wallets)
      .set({ name: body.name, updatedAt: now })
      .where(eq(wallets.id, walletId))
      .run();

    return c.json(
      {
        id: wallet.id,
        name: body.name,
        chain: wallet.chain,
        network: wallet.defaultNetwork!,
        environment: wallet.environment!,
        publicKey: wallet.publicKey,
        status: wallet.status,
        ownerAddress: wallet.ownerAddress ?? null,
        ownerState: resolveOwnerState({
          ownerAddress: wallet.ownerAddress,
          ownerVerified: wallet.ownerVerified,
        }),
        createdAt: wallet.createdAt ? Math.floor(wallet.createdAt.getTime() / 1000) : 0,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // DELETE /wallets/:id (terminate)
  // ---------------------------------------------------------------------------

  router.openapi(deleteWalletRoute, async (c) => {
    const { id: walletId } = c.req.valid('param');

    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    if (wallet.status === 'TERMINATED') {
      throw new WAIaaSError('WALLET_TERMINATED', {
        message: `Wallet '${walletId}' is already terminated`,
      });
    }

    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    // --- Cascade defense: process session_wallets before wallet termination ---

    // Step 1: Find all session_wallets links for this wallet
    const linkedSessions = deps.db
      .select({
        sessionId: sessionWallets.sessionId,
        isDefault: sessionWallets.isDefault,
      })
      .from(sessionWallets)
      .where(eq(sessionWallets.walletId, walletId))
      .all();

    // Step 2: Per-session cascade defense (auto-promote or auto-revoke)
    for (const link of linkedSessions) {
      // Find other wallets still linked to this session
      const otherWallets = deps.db
        .select({
          walletId: sessionWallets.walletId,
          createdAt: sessionWallets.createdAt,
        })
        .from(sessionWallets)
        .where(and(
          eq(sessionWallets.sessionId, link.sessionId),
          sql`${sessionWallets.walletId} != ${walletId}`,
        ))
        .orderBy(sessionWallets.createdAt) // ASC: earliest-linked wallet first
        .all();

      if (otherWallets.length === 0) {
        // Last wallet in this session -> auto-revoke the session
        deps.db
          .update(sessions)
          .set({ revokedAt: now })
          .where(eq(sessions.id, link.sessionId))
          .run();
      } else if (link.isDefault) {
        // Default wallet being removed -> auto-promote earliest-linked wallet
        const promotee = otherWallets[0]!;
        deps.db
          .update(sessionWallets)
          .set({ isDefault: true })
          .where(and(
            eq(sessionWallets.sessionId, link.sessionId),
            eq(sessionWallets.walletId, promotee.walletId),
          ))
          .run();
      }
      // Non-default wallet with other wallets remaining: junction row removal suffices
    }

    // Step 3: Remove all session_wallets links for this wallet
    deps.db
      .delete(sessionWallets)
      .where(eq(sessionWallets.walletId, walletId))
      .run();

    // --- End cascade defense ---

    // 4. Cancel pending transactions
    await deps.db
      .update(transactions)
      .set({ status: 'CANCELLED' })
      .where(
        and(
          eq(transactions.walletId, walletId),
          inArray(transactions.status, ['PENDING', 'PENDING_APPROVAL']),
        ),
      )
      .run();

    // 5. Set status to TERMINATED
    await deps.db
      .update(wallets)
      .set({ status: 'TERMINATED', updatedAt: now })
      .where(eq(wallets.id, walletId))
      .run();

    return c.json(
      {
        id: walletId,
        status: 'TERMINATED' as const,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // PUT /wallets/:id/owner
  // ---------------------------------------------------------------------------

  router.openapi(setOwnerRoute, async (c) => {
    const { id: walletId } = c.req.valid('param');

    // Look up wallet
    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    // Check if LOCKED -- needs ownerAuth, not just masterAuth
    const state = resolveOwnerState({
      ownerAddress: wallet.ownerAddress,
      ownerVerified: wallet.ownerVerified,
    });

    if (state === 'LOCKED') {
      throw new WAIaaSError('OWNER_ALREADY_CONNECTED', {
        message: 'Use ownerAuth to change owner in LOCKED state',
      });
    }

    // Parse body via validated input
    const body = c.req.valid('json');
    const ownerAddress = body.owner_address;

    if (!ownerAddress || typeof ownerAddress !== 'string') {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: 'owner_address is required',
      });
    }

    // Validate owner_address format by chain type
    const validation = validateOwnerAddress(wallet.chain as ChainType, ownerAddress);
    if (!validation.valid) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `Invalid owner address for ${wallet.chain}: ${validation.error}`,
      });
    }

    // Use normalized address (EIP-55 for ethereum, as-is for solana)
    const normalizedAddress = validation.normalized!;

    // Set owner with normalized address
    ownerLifecycle.setOwner(walletId, normalizedAddress);

    // Update approval_method if explicitly provided (three-state protocol):
    //   undefined (omitted) = preserve existing value, no DB update
    //   null (explicit) = clear column to NULL (revert to Auto/global fallback)
    //   valid string = save value to DB
    if (body.approval_method !== undefined) {
      deps.sqlite.prepare(
        'UPDATE wallets SET owner_approval_method = ? WHERE id = ?',
      ).run(body.approval_method, walletId);
    }

    // Fire-and-forget: notify owner set
    void deps.notificationService?.notify('OWNER_SET', walletId, {
      ownerAddress: normalizedAddress,
    });

    // v1.6: emit wallet:activity OWNER_SET event
    deps.eventBus?.emit('wallet:activity', {
      walletId,
      activity: 'OWNER_SET',
      details: { ownerAddress: normalizedAddress },
      timestamp: Math.floor(Date.now() / 1000),
    });

    // Fetch updated wallet
    const updated = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    return c.json(
      {
        id: updated!.id,
        name: updated!.name,
        chain: updated!.chain,
        network: updated!.defaultNetwork!,
        environment: updated!.environment!,
        publicKey: updated!.publicKey,
        status: updated!.status,
        ownerAddress: updated!.ownerAddress,
        ownerVerified: updated!.ownerVerified,
        approvalMethod: updated!.ownerApprovalMethod ?? null,
        updatedAt: updated!.updatedAt ? Math.floor(updated!.updatedAt.getTime() / 1000) : null,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /wallets/:id/owner/verify
  // ---------------------------------------------------------------------------

  router.openapi(verifyOwnerRoute, async (c) => {
    const { id: walletId } = c.req.valid('param');

    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    const state = resolveOwnerState({
      ownerAddress: wallet.ownerAddress,
      ownerVerified: wallet.ownerVerified,
    });

    if (state === 'NONE') {
      throw new WAIaaSError('OWNER_NOT_CONNECTED', {
        message: 'No owner address registered for this wallet',
      });
    }

    if (state === 'LOCKED') {
      // Already verified, no-op
      return c.json(
        {
          ownerState: 'LOCKED' as const,
          ownerAddress: wallet.ownerAddress,
          ownerVerified: true,
        },
        200,
      );
    }

    // GRACE -> LOCKED: ownerAuth middleware already verified the signature
    ownerLifecycle.markOwnerVerified(walletId);

    return c.json(
      {
        ownerState: 'LOCKED' as const,
        ownerAddress: wallet.ownerAddress,
        ownerVerified: true,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // PUT /wallets/:id/default-network
  // ---------------------------------------------------------------------------

  router.openapi(updateDefaultNetworkRoute, async (c) => {
    const { id: walletId } = c.req.valid('param');
    const body = c.req.valid('json');

    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    if (wallet.status === 'TERMINATED') {
      throw new WAIaaSError('WALLET_TERMINATED', {
        message: `Wallet '${walletId}' is already terminated`,
      });
    }

    // Validate that the requested network is allowed for wallet's chain+environment
    try {
      validateNetworkEnvironment(
        wallet.chain as ChainType,
        wallet.environment as EnvironmentType,
        body.network as NetworkType,
      );
    } catch {
      throw new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
        message: `Network '${body.network}' is not allowed for chain '${wallet.chain}' in environment '${wallet.environment}'`,
      });
    }

    const previousNetwork = wallet.defaultNetwork;
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    await deps.db
      .update(wallets)
      .set({ defaultNetwork: body.network, updatedAt: now })
      .where(eq(wallets.id, walletId))
      .run();

    return c.json(
      {
        id: walletId,
        defaultNetwork: body.network,
        previousNetwork: previousNetwork ?? null,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /wallets/:id/networks
  // ---------------------------------------------------------------------------

  router.openapi(walletNetworksRoute, async (c) => {
    const { id: walletId } = c.req.valid('param');

    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    const networks = getNetworksForEnvironment(
      wallet.chain as ChainType,
      wallet.environment as EnvironmentType,
    );

    return c.json(
      {
        id: wallet.id,
        chain: wallet.chain,
        environment: wallet.environment!,
        defaultNetwork: wallet.defaultNetwork ?? null,
        availableNetworks: networks.map((n) => ({
          network: n,
          isDefault: n === wallet.defaultNetwork,
        })),
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /wallets/:id/withdraw
  // ---------------------------------------------------------------------------

  const withdrawRoute = createRoute({
    method: 'post',
    path: '/wallets/{id}/withdraw',
    tags: ['Wallets'],
    summary: 'Withdraw all assets to owner address',
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Sweep results per asset',
        content: { 'application/json': { schema: WithdrawResponseSchema } },
      },
      ...buildErrorResponses(['WALLET_NOT_FOUND', 'NO_OWNER', 'WITHDRAW_LOCKED_ONLY', 'SWEEP_TOTAL_FAILURE']),
    },
  });

  router.openapi(withdrawRoute, async (c) => {
    const { id: walletId } = c.req.valid('param');

    const wallet = await deps.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    // Validate owner state: must be LOCKED
    const ownerState = resolveOwnerState(wallet);
    if (ownerState === 'NONE') {
      throw new WAIaaSError('NO_OWNER');
    }
    if (ownerState !== 'LOCKED') {
      throw new WAIaaSError('WITHDRAW_LOCKED_ONLY');
    }

    if (!deps.adapterPool) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE');
    }

    // Resolve adapter
    const network = (wallet.defaultNetwork ?? wallet.environment) as string;
    const rpcUrl = resolveRpcUrl(
      deps.config.rpc as unknown as Record<string, string>,
      wallet.chain,
      network,
    );
    const adapter = await deps.adapterPool.resolve(
      wallet.chain as ChainType,
      network as NetworkType,
      rpcUrl,
    );

    // Decrypt private key
    const privateKey = await deps.keyStore.decryptPrivateKey(
      walletId,
      deps.masterPassword,
    );

    // Sweep all assets to owner address
    const sweepResult = await adapter.sweepAll(
      wallet.publicKey,
      wallet.ownerAddress!,
      privateKey,
    );

    if (sweepResult.succeeded === 0 && sweepResult.total > 0) {
      throw new WAIaaSError('SWEEP_TOTAL_FAILURE');
    }

    return c.json(
      {
        total: sweepResult.total,
        succeeded: sweepResult.succeeded,
        failed: sweepResult.failed,
        results: sweepResult.results.map((r) => ({
          asset: r.mint,
          amount: r.amount.toString(),
          txHash: r.txHash,
          error: r.error,
          status: r.txHash ? ('success' as const) : ('failed' as const),
        })),
      },
      200,
    );
  });

  return router;
}
