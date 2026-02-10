/**
 * Wallet query routes: GET /v1/wallet/address and GET /v1/wallet/balance.
 *
 * v1.2: Protected by sessionAuth middleware (Authorization: Bearer wai_sess_<token>),
 *       applied at server level in createApp().
 * Agent identification via JWT payload agentId (set by sessionAuth on context).
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { IChainAdapter } from '@waiaas/core';
import { agents } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';

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

/**
 * Create wallet route sub-router.
 *
 * GET /wallet/address -> returns agent's public key
 * GET /wallet/balance -> calls adapter.getBalance() and returns lamports
 */
export function walletRoutes(deps: WalletRouteDeps): Hono {
  const router = new Hono();

  router.get('/wallet/address', async (c) => {
    // Get agentId from sessionAuth context (set by middleware at server level)
    const agentId = c.get('agentId' as never) as string;
    const agent = await resolveAgentById(deps.db, agentId);

    return c.json({
      agentId: agent.id,
      chain: agent.chain,
      network: agent.network,
      address: agent.publicKey,
    });
  });

  router.get('/wallet/balance', async (c) => {
    const agentId = c.get('agentId' as never) as string;
    const agent = await resolveAgentById(deps.db, agentId);

    if (!deps.adapter) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: 'Chain adapter not available',
      });
    }

    const balanceInfo = await deps.adapter.getBalance(agent.publicKey);

    return c.json({
      agentId: agent.id,
      chain: agent.chain,
      network: agent.network,
      address: agent.publicKey,
      balance: balanceInfo.balance.toString(),
      decimals: balanceInfo.decimals,
      symbol: balanceInfo.symbol,
    });
  });

  return router;
}
