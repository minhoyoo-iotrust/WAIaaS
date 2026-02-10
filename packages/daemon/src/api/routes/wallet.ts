/**
 * Wallet query routes: GET /v1/wallet/address, GET /v1/wallet/balance,
 * GET /v1/wallet/assets.
 *
 * v1.2: Protected by sessionAuth middleware (Authorization: Bearer wai_sess_<token>),
 *       applied at server level in createApp().
 * Agent identification via JWT payload agentId (set by sessionAuth on context).
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { IChainAdapter } from '@waiaas/core';
import { agents } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';
import {
  WalletAddressResponseSchema,
  WalletBalanceResponseSchema,
  WalletAssetsResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

export interface WalletRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter | null;
}

/**
 * Resolve agent by ID from database. Throws 404 if not found.
 */
async function resolveAgentById(
  db: BetterSQLite3Database<typeof schema>,
  agentId: string,
) {
  const agent = await db.select().from(agents).where(eq(agents.id, agentId)).get();

  if (!agent) {
    throw new WAIaaSError('AGENT_NOT_FOUND', {
      message: `Agent '${agentId}' not found`,
    });
  }

  return agent;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const walletAddressRoute = createRoute({
  method: 'get',
  path: '/wallet/address',
  tags: ['Wallet'],
  summary: 'Get wallet address',
  responses: {
    200: {
      description: 'Agent wallet address',
      content: { 'application/json': { schema: WalletAddressResponseSchema } },
    },
    ...buildErrorResponses(['AGENT_NOT_FOUND']),
  },
});

const walletBalanceRoute = createRoute({
  method: 'get',
  path: '/wallet/balance',
  tags: ['Wallet'],
  summary: 'Get wallet balance',
  responses: {
    200: {
      description: 'Agent wallet balance',
      content: { 'application/json': { schema: WalletBalanceResponseSchema } },
    },
    ...buildErrorResponses(['AGENT_NOT_FOUND', 'CHAIN_ERROR']),
  },
});

const walletAssetsRoute = createRoute({
  method: 'get',
  path: '/wallet/assets',
  tags: ['Wallet'],
  summary: 'Get wallet assets',
  responses: {
    200: {
      description: 'All assets (native + tokens) held by agent wallet',
      content: { 'application/json': { schema: WalletAssetsResponseSchema } },
    },
    ...buildErrorResponses(['AGENT_NOT_FOUND', 'CHAIN_ERROR']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create wallet route sub-router.
 *
 * GET /wallet/address -> returns agent's public key
 * GET /wallet/balance -> calls adapter.getBalance() and returns lamports
 * GET /wallet/assets  -> calls adapter.getAssets() and returns all token balances
 */
export function walletRoutes(deps: WalletRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(walletAddressRoute, async (c) => {
    // Get agentId from sessionAuth context (set by middleware at server level)
    const agentId = c.get('agentId' as never) as string;
    const agent = await resolveAgentById(deps.db, agentId);

    return c.json(
      {
        agentId: agent.id,
        chain: agent.chain,
        network: agent.network,
        address: agent.publicKey,
      },
      200,
    );
  });

  router.openapi(walletBalanceRoute, async (c) => {
    const agentId = c.get('agentId' as never) as string;
    const agent = await resolveAgentById(deps.db, agentId);

    if (!deps.adapter) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: 'Chain adapter not available',
      });
    }

    const balanceInfo = await deps.adapter.getBalance(agent.publicKey);

    return c.json(
      {
        agentId: agent.id,
        chain: agent.chain,
        network: agent.network,
        address: agent.publicKey,
        balance: balanceInfo.balance.toString(),
        decimals: balanceInfo.decimals,
        symbol: balanceInfo.symbol,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /wallet/assets
  // ---------------------------------------------------------------------------

  router.openapi(walletAssetsRoute, async (c) => {
    const agentId = c.get('agentId' as never) as string;
    const agent = await resolveAgentById(deps.db, agentId);

    if (!deps.adapter) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: 'Chain adapter not available',
      });
    }

    const assets = await deps.adapter.getAssets(agent.publicKey);

    return c.json(
      {
        agentId: agent.id,
        chain: agent.chain,
        network: agent.network,
        assets: assets.map((a) => ({
          mint: a.mint,
          symbol: a.symbol,
          name: a.name,
          balance: a.balance.toString(),
          decimals: a.decimals,
          isNative: a.isNative,
          usdValue: a.usdValue,
        })),
      },
      200,
    );
  });

  return router;
}
