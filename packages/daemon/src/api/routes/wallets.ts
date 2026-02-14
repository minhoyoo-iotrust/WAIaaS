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
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { WAIaaSError, getDefaultNetwork } from '@waiaas/core';
import type { ChainType, EnvironmentType } from '@waiaas/core';
import { wallets } from '../../infrastructure/database/schema.js';
import { generateId } from '../../infrastructure/database/id.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveOwnerState, OwnerLifecycleService } from '../../workflow/owner-state.js';
import { validateOwnerAddress } from '../middleware/address-validation.js';
import {
  CreateWalletRequestOpenAPI,
  SetOwnerRequestSchema,
  UpdateWalletRequestSchema,
  WalletCrudResponseSchema,
  WalletOwnerResponseSchema,
  WalletListResponseSchema,
  WalletDetailResponseSchema,
  WalletDeleteResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

export interface WalletCrudRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: SQLiteDatabase;
  keyStore: LocalKeyStore;
  masterPassword: string;
  config: DaemonConfig;
  notificationService?: NotificationService;
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
      description: 'Wallet created',
      content: { 'application/json': { schema: WalletCrudResponseSchema } },
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
        createdAt: Math.floor(now.getTime() / 1000),
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

    // Fire-and-forget: notify owner set
    void deps.notificationService?.notify('OWNER_SET', walletId, {
      ownerAddress: normalizedAddress,
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
        updatedAt: updated!.updatedAt ? Math.floor(updated!.updatedAt.getTime() / 1000) : null,
      },
      200,
    );
  });

  return router;
}
