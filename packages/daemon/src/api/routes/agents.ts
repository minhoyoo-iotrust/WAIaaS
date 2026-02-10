/**
 * POST /v1/agents route handler: create an agent with Solana key pair.
 *
 * Parses body with CreateAgentRequestSchema, generates UUID v7 ID,
 * calls keyStore.generateKeyPair(), inserts into agents table, returns 201.
 *
 * v1.1: No sessionAuth. Agent identification via X-Agent-Id header.
 *
 * @see docs/37-rest-api-complete-spec.md
 */

import { Hono } from 'hono';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { CreateAgentRequestSchema } from '@waiaas/core';
import type { ChainType } from '@waiaas/core';
import { agents } from '../../infrastructure/database/schema.js';
import { generateId } from '../../infrastructure/database/id.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type * as schema from '../../infrastructure/database/schema.js';

export interface AgentRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  keyStore: LocalKeyStore;
  masterPassword: string;
  config: DaemonConfig;
}

/**
 * Create agent route sub-router.
 *
 * POST /agents -> creates agent with Solana key pair, inserts to DB, returns 201.
 */
export function agentRoutes(deps: AgentRouteDeps): Hono {
  const router = new Hono();

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

  return router;
}
