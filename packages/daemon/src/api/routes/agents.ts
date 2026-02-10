/**
 * Agent route handlers: POST /v1/agents, PUT /v1/agents/:id/owner.
 *
 * POST /v1/agents: create an agent with Solana key pair.
 * PUT /v1/agents/:id/owner: register/change owner address (masterAuth).
 *
 * v1.2: Protected by masterAuth middleware (X-Master-Password header required),
 *       applied at server level in createApp().
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { CreateAgentRequestSchema, WAIaaSError } from '@waiaas/core';
import type { ChainType } from '@waiaas/core';
import { agents } from '../../infrastructure/database/schema.js';
import { generateId } from '../../infrastructure/database/id.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveOwnerState, OwnerLifecycleService } from '../../workflow/owner-state.js';

export interface AgentRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: SQLiteDatabase;
  keyStore: LocalKeyStore;
  masterPassword: string;
  config: DaemonConfig;
}

/**
 * Create agent route sub-router.
 *
 * POST /agents -> creates agent with Solana key pair, inserts to DB, returns 201.
 * PUT /agents/:id/owner -> register/change owner address (masterAuth).
 */
export function agentRoutes(deps: AgentRouteDeps): Hono {
  const router = new Hono();
  const ownerLifecycle = new OwnerLifecycleService({ db: deps.db, sqlite: deps.sqlite });

  // ---------------------------------------------------------------------------
  // POST /agents
  // ---------------------------------------------------------------------------

  router.post('/agents', async (c) => {
    // Parse and validate request body
    const body = await c.req.json();
    const parsed = CreateAgentRequestSchema.parse(body);

    // Generate agent ID
    const id = generateId();

    // Generate key pair via keystore
    const { publicKey } = await deps.keyStore.generateKeyPair(
      id,
      parsed.chain as ChainType,
      deps.masterPassword,
    );

    // Insert into agents table
    const now = new Date(Math.floor(Date.now() / 1000) * 1000); // truncate to seconds

    await deps.db.insert(agents).values({
      id,
      name: parsed.name,
      chain: parsed.chain,
      network: parsed.network,
      publicKey,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    // Return 201 with agent JSON
    return c.json(
      {
        id,
        name: parsed.name,
        chain: parsed.chain,
        network: parsed.network,
        publicKey,
        status: 'ACTIVE',
        createdAt: Math.floor(now.getTime() / 1000),
      },
      201,
    );
  });

  // ---------------------------------------------------------------------------
  // PUT /agents/:id/owner
  // ---------------------------------------------------------------------------

  router.put('/agents/:id/owner', async (c) => {
    const agentId = c.req.param('id');

    // Look up agent
    const agent = await deps.db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .get();

    if (!agent) {
      throw new WAIaaSError('AGENT_NOT_FOUND', {
        message: `Agent '${agentId}' not found`,
      });
    }

    // Check if LOCKED -- needs ownerAuth, not just masterAuth
    const state = resolveOwnerState({
      ownerAddress: agent.ownerAddress,
      ownerVerified: agent.ownerVerified,
    });

    if (state === 'LOCKED') {
      throw new WAIaaSError('OWNER_ALREADY_CONNECTED', {
        message: 'Use ownerAuth to change owner in LOCKED state',
      });
    }

    // Parse body
    const body = await c.req.json();
    const ownerAddress = body?.owner_address as string | undefined;

    if (!ownerAddress || typeof ownerAddress !== 'string') {
      throw new WAIaaSError('AGENT_NOT_FOUND', {
        message: 'owner_address is required',
      });
    }

    // Set owner
    ownerLifecycle.setOwner(agentId, ownerAddress);

    // Fetch updated agent
    const updated = await deps.db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .get();

    return c.json({
      id: updated!.id,
      name: updated!.name,
      chain: updated!.chain,
      network: updated!.network,
      publicKey: updated!.publicKey,
      status: updated!.status,
      ownerAddress: updated!.ownerAddress,
      ownerVerified: updated!.ownerVerified,
      updatedAt: updated!.updatedAt ? Math.floor(updated!.updatedAt.getTime() / 1000) : null,
    });
  });

  return router;
}
