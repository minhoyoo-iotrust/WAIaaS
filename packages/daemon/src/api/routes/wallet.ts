/**
 * Wallet query routes: GET /v1/wallet/address and GET /v1/wallet/balance.
 *
 * Agent identification via X-Agent-Id header (v1.1 simplified, no sessionAuth).
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
 * Look up agent by X-Agent-Id header. Throws 400 if missing, 404 if not found.
 */
async function resolveAgent(
  db: BetterSQLite3Database<typeof schema>,
  agentId: string | undefined,
) {
  if (!agentId) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'X-Agent-Id header is required',
    });
  }

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
    const agentId = c.req.header('X-Agent-Id');
    const agent = await resolveAgent(deps.db, agentId);

    return c.json({
      agentId: agent.id,
      chain: agent.chain,
      network: agent.network,
      address: agent.publicKey,
    });
  });

  router.get('/wallet/balance', async (c) => {
    const agentId = c.req.header('X-Agent-Id');
    const agent = await resolveAgent(deps.db, agentId);

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
