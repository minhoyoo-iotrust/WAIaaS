/**
 * Agent route handlers: POST /v1/agents, GET /v1/agents, GET /v1/agents/:id,
 * PUT /v1/agents/:id/owner.
 *
 * POST /v1/agents: create an agent with Solana key pair.
 * GET /v1/agents: list all agents (masterAuth).
 * GET /v1/agents/:id: get agent detail including ownerState (masterAuth).
 * PUT /v1/agents/:id/owner: register/change owner address (masterAuth).
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
import { WAIaaSError, validateChainNetwork } from '@waiaas/core';
import type { ChainType, NetworkType } from '@waiaas/core';
import { agents } from '../../infrastructure/database/schema.js';
import { generateId } from '../../infrastructure/database/id.js';
import type { LocalKeyStore } from '../../infrastructure/keystore/keystore.js';
import type { DaemonConfig } from '../../infrastructure/config/loader.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { resolveOwnerState, OwnerLifecycleService } from '../../workflow/owner-state.js';
import {
  CreateAgentRequestOpenAPI,
  SetOwnerRequestSchema,
  UpdateAgentRequestSchema,
  AgentResponseSchema,
  AgentOwnerResponseSchema,
  AgentListResponseSchema,
  AgentDetailResponseSchema,
  AgentDeleteResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

export interface AgentRouteDeps {
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

const createAgentRoute = createRoute({
  method: 'post',
  path: '/agents',
  tags: ['Agents'],
  summary: 'Create a new agent',
  request: {
    body: {
      content: {
        'application/json': { schema: CreateAgentRequestOpenAPI },
      },
    },
  },
  responses: {
    201: {
      description: 'Agent created',
      content: { 'application/json': { schema: AgentResponseSchema } },
    },
    ...buildErrorResponses(['AGENT_NOT_FOUND', 'ACTION_VALIDATION_FAILED']),
  },
});

const setOwnerRoute = createRoute({
  method: 'put',
  path: '/agents/{id}/owner',
  tags: ['Agents'],
  summary: 'Set agent owner address',
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
      content: { 'application/json': { schema: AgentOwnerResponseSchema } },
    },
    ...buildErrorResponses(['AGENT_NOT_FOUND', 'OWNER_ALREADY_CONNECTED']),
  },
});

const listAgentsRoute = createRoute({
  method: 'get',
  path: '/agents',
  tags: ['Agents'],
  summary: 'List all agents',
  responses: {
    200: {
      description: 'Agent list',
      content: { 'application/json': { schema: AgentListResponseSchema } },
    },
  },
});

const agentDetailRoute = createRoute({
  method: 'get',
  path: '/agents/{id}',
  tags: ['Agents'],
  summary: 'Get agent details',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Agent detail with owner state',
      content: { 'application/json': { schema: AgentDetailResponseSchema } },
    },
    ...buildErrorResponses(['AGENT_NOT_FOUND']),
  },
});

const updateAgentRoute = createRoute({
  method: 'put',
  path: '/agents/{id}',
  tags: ['Agents'],
  summary: 'Update agent name',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: {
        'application/json': { schema: UpdateAgentRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Agent updated',
      content: { 'application/json': { schema: AgentResponseSchema } },
    },
    ...buildErrorResponses(['AGENT_NOT_FOUND']),
  },
});

const deleteAgentRoute = createRoute({
  method: 'delete',
  path: '/agents/{id}',
  tags: ['Agents'],
  summary: 'Terminate agent',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Agent terminated',
      content: { 'application/json': { schema: AgentDeleteResponseSchema } },
    },
    ...buildErrorResponses(['AGENT_NOT_FOUND', 'AGENT_TERMINATED']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create agent route sub-router.
 *
 * GET  /agents -> list all agents (masterAuth).
 * GET  /agents/:id -> get agent detail with ownerState (masterAuth).
 * POST /agents -> creates agent with Solana key pair, inserts to DB, returns 201.
 * PUT  /agents/:id/owner -> register/change owner address (masterAuth).
 */
export function agentRoutes(deps: AgentRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });
  const ownerLifecycle = new OwnerLifecycleService({ db: deps.db, sqlite: deps.sqlite });

  // ---------------------------------------------------------------------------
  // GET /agents (list)
  // ---------------------------------------------------------------------------

  router.openapi(listAgentsRoute, async (c) => {
    const allAgents = await deps.db.select().from(agents);

    return c.json(
      {
        items: allAgents.map((a) => ({
          id: a.id,
          name: a.name,
          chain: a.chain,
          network: a.network,
          publicKey: a.publicKey,
          status: a.status,
          createdAt: a.createdAt ? Math.floor(a.createdAt.getTime() / 1000) : 0,
        })),
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /agents/:id (detail)
  // ---------------------------------------------------------------------------

  router.openapi(agentDetailRoute, async (c) => {
    const { id: agentId } = c.req.valid('param');

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

    const ownerState = resolveOwnerState({
      ownerAddress: agent.ownerAddress,
      ownerVerified: agent.ownerVerified,
    });

    return c.json(
      {
        id: agent.id,
        name: agent.name,
        chain: agent.chain,
        network: agent.network,
        publicKey: agent.publicKey,
        status: agent.status,
        ownerAddress: agent.ownerAddress,
        ownerVerified: agent.ownerVerified,
        ownerState,
        createdAt: agent.createdAt ? Math.floor(agent.createdAt.getTime() / 1000) : 0,
        updatedAt: agent.updatedAt ? Math.floor(agent.updatedAt.getTime() / 1000) : null,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /agents
  // ---------------------------------------------------------------------------

  router.openapi(createAgentRoute, async (c) => {
    // OpenAPIHono validates the body automatically via createRoute schema
    const parsed = c.req.valid('json');
    const chain = parsed.chain as ChainType;

    // Resolve default network if not specified
    let network: NetworkType;
    if (parsed.network) {
      network = parsed.network as NetworkType;
    } else if (chain === 'solana') {
      network = 'devnet';
    } else {
      // EVM: use config default (evm_default_network from config.toml)
      network = deps.config.rpc.evm_default_network as NetworkType;
    }

    // Cross-validate chain + network
    try {
      validateChainNetwork(chain, network);
    } catch (err) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // Generate agent ID
    const id = generateId();

    // Generate key pair via keystore
    const { publicKey } = await deps.keyStore.generateKeyPair(
      id,
      chain,
      network,
      deps.masterPassword,
    );

    // Insert into agents table
    const now = new Date(Math.floor(Date.now() / 1000) * 1000); // truncate to seconds

    await deps.db.insert(agents).values({
      id,
      name: parsed.name,
      chain: parsed.chain,
      network,
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
        network,
        publicKey,
        status: 'ACTIVE',
        createdAt: Math.floor(now.getTime() / 1000),
      },
      201,
    );
  });

  // ---------------------------------------------------------------------------
  // PUT /agents/:id (update name)
  // ---------------------------------------------------------------------------

  router.openapi(updateAgentRoute, async (c) => {
    const { id: agentId } = c.req.valid('param');
    const body = c.req.valid('json');

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

    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    await deps.db
      .update(agents)
      .set({ name: body.name, updatedAt: now })
      .where(eq(agents.id, agentId))
      .run();

    return c.json(
      {
        id: agent.id,
        name: body.name,
        chain: agent.chain,
        network: agent.network,
        publicKey: agent.publicKey,
        status: agent.status,
        createdAt: agent.createdAt ? Math.floor(agent.createdAt.getTime() / 1000) : 0,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // DELETE /agents/:id (terminate)
  // ---------------------------------------------------------------------------

  router.openapi(deleteAgentRoute, async (c) => {
    const { id: agentId } = c.req.valid('param');

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

    if (agent.status === 'TERMINATED') {
      throw new WAIaaSError('AGENT_TERMINATED', {
        message: `Agent '${agentId}' is already terminated`,
      });
    }

    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    await deps.db
      .update(agents)
      .set({ status: 'TERMINATED', updatedAt: now })
      .where(eq(agents.id, agentId))
      .run();

    return c.json(
      {
        id: agentId,
        status: 'TERMINATED' as const,
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // PUT /agents/:id/owner
  // ---------------------------------------------------------------------------

  router.openapi(setOwnerRoute, async (c) => {
    const { id: agentId } = c.req.valid('param');

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

    // Parse body via validated input
    const body = c.req.valid('json');
    const ownerAddress = body.owner_address;

    if (!ownerAddress || typeof ownerAddress !== 'string') {
      throw new WAIaaSError('AGENT_NOT_FOUND', {
        message: 'owner_address is required',
      });
    }

    // Set owner
    ownerLifecycle.setOwner(agentId, ownerAddress);

    // Fire-and-forget: notify owner set
    void deps.notificationService?.notify('OWNER_SET', agentId, {
      ownerAddress,
    });

    // Fetch updated agent
    const updated = await deps.db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .get();

    return c.json(
      {
        id: updated!.id,
        name: updated!.name,
        chain: updated!.chain,
        network: updated!.network,
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
