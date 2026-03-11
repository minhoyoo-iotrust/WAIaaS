/**
 * ERC-8004 read-only REST API routes.
 *
 * 4 GET endpoints for querying on-chain ERC-8004 registry data:
 * 1. GET /erc8004/agent/:agentId - Agent identity info
 * 2. GET /erc8004/agent/:agentId/reputation - Reputation summary
 * 3. GET /erc8004/registration-file/:walletId - Auto-generated registration file
 * 4. GET /erc8004/validation/:requestHash - Validation status
 *
 * All endpoints require sessionAuth.
 *
 * @see Phase 319-01
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { createPublicClient, http, type Hex } from 'viem';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import {
  buildRegistrationFile,
  ERC8004_DEFAULTS,
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  VALIDATION_REGISTRY_ABI,
} from '@waiaas/actions';
import type { SettingsService } from '../../infrastructure/settings/index.js';
import type * as schema from '../../infrastructure/database/schema.js';
import { wallets, agentIdentities } from '../../infrastructure/database/schema.js';
import {
  Erc8004AgentInfoResponseSchema,
  Erc8004ReputationResponseSchema,
  Erc8004RegistrationFileResponseSchema,
  Erc8004ValidationResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Erc8004RouteDeps {
  db: BetterSQLite3Database<typeof schema>;
  settingsService?: SettingsService;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Erc8004RouteConfig {
  identityRegistryAddress: string;
  reputationRegistryAddress: string;
  validationRegistryAddress: string;
  registrationFileBaseUrl: string;
}

function getErc8004Config(settingsService?: SettingsService): Erc8004RouteConfig {
  const get = (key: string, fallback: string): string => {
    if (!settingsService) return fallback;
    try {
      return settingsService.get(key) || fallback;
    } catch {
      return fallback;
    }
  };

  return {
    identityRegistryAddress: get('actions.erc8004_identity_registry', ERC8004_DEFAULTS.identityRegistryAddress),
    reputationRegistryAddress: get('actions.erc8004_reputation_registry', ERC8004_DEFAULTS.reputationRegistryAddress),
    validationRegistryAddress: get('actions.erc8004_validation_registry', ERC8004_DEFAULTS.validationRegistryAddress),
    registrationFileBaseUrl: get('actions.erc8004_registration_file_base_url', ERC8004_DEFAULTS.registrationFileBaseUrl),
  };
}

function createRpcClient(settingsService?: SettingsService) {
  // ERC-8004 registries are deployed on Ethereum mainnet
  let rpcUrl = '';
  if (settingsService) {
    try {
      rpcUrl = settingsService.get('rpc.evm_ethereum_mainnet') || '';
    } catch {
      // key not found
    }
  }
  if (!rpcUrl) {
    rpcUrl = 'https://eth.llamarpc.com'; // Public fallback
  }
  return createPublicClient({ transport: http(rpcUrl) });
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const agentInfoRoute = createRoute({
  method: 'get',
  path: '/erc8004/agent/{agentId}',
  tags: ['ERC-8004'],
  summary: 'Get agent identity info from on-chain Identity Registry',
  request: {
    params: z.object({
      agentId: z.string().openapi({ description: 'On-chain agent ID (uint256)', example: '42' }),
    }),
  },
  responses: {
    200: {
      description: 'Agent identity info',
      content: { 'application/json': { schema: Erc8004AgentInfoResponseSchema } },
    },
    ...buildErrorResponses(['INVALID_TOKEN', 'CHAIN_ERROR']),
  },
});

const reputationRoute = createRoute({
  method: 'get',
  path: '/erc8004/agent/{agentId}/reputation',
  tags: ['ERC-8004'],
  summary: 'Get agent reputation summary from on-chain Reputation Registry',
  request: {
    params: z.object({
      agentId: z.string().openapi({ description: 'On-chain agent ID (uint256)', example: '42' }),
    }),
    query: z.object({
      tag1: z.string().default('').openapi({ description: 'Tag1 filter' }),
      tag2: z.string().default('').openapi({ description: 'Tag2 filter' }),
    }),
  },
  responses: {
    200: {
      description: 'Agent reputation summary',
      content: { 'application/json': { schema: Erc8004ReputationResponseSchema } },
    },
    ...buildErrorResponses(['INVALID_TOKEN', 'CHAIN_ERROR']),
  },
});

const registrationFileRoute = createRoute({
  method: 'get',
  path: '/erc8004/registration-file/{walletId}',
  tags: ['ERC-8004'],
  summary: 'Get auto-generated registration file for a wallet',
  request: {
    params: z.object({
      walletId: z.string().uuid().openapi({ description: 'Wallet UUID' }),
    }),
  },
  responses: {
    200: {
      description: 'ERC-8004 registration file JSON',
      content: { 'application/json': { schema: Erc8004RegistrationFileResponseSchema } },
    },
    ...buildErrorResponses(['INVALID_TOKEN', 'WALLET_NOT_FOUND']),
  },
});

const validationRoute = createRoute({
  method: 'get',
  path: '/erc8004/validation/{requestHash}',
  tags: ['ERC-8004'],
  summary: 'Get validation status from on-chain Validation Registry',
  request: {
    params: z.object({
      requestHash: z.string().openapi({ description: 'Validation request hash (bytes32)', example: '0x1234...' }),
    }),
  },
  responses: {
    200: {
      description: 'Validation status',
      content: { 'application/json': { schema: Erc8004ValidationResponseSchema } },
    },
    ...buildErrorResponses(['INVALID_TOKEN', 'CHAIN_ERROR', 'ADAPTER_NOT_AVAILABLE']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create ERC-8004 read-only route sub-router.
 *
 * All 4 endpoints require sessionAuth (registered on the main app).
 */
export function erc8004Routes(deps: Erc8004RouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // Route 1: GET /erc8004/agent/:agentId
  router.openapi(agentInfoRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const config = getErc8004Config(deps.settingsService);

    if (!config.identityRegistryAddress) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'Identity Registry not configured',
      });
    }

    const client = createRpcClient(deps.settingsService);
    const registryAddress = config.identityRegistryAddress as Hex;

    try {
      const agentIdBigInt = BigInt(agentId);

      const [walletAddress, uri] = await Promise.all([
        client.readContract({
          address: registryAddress,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'getAgentWallet',
          args: [agentIdBigInt],
        }),
        client.readContract({
          address: registryAddress,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'tokenURI',
          args: [agentIdBigInt],
        }),
      ]);

      // Check local DB for additional metadata
      const localIdentity = deps.db
        .select({
          chainId: agentIdentities.chainId,
          status: agentIdentities.status,
          registryAddress: agentIdentities.registryAddress,
        })
        .from(agentIdentities)
        .where(eq(agentIdentities.chainAgentId, agentId))
        .get();

      const chainId = localIdentity?.chainId ?? 1;
      const metadata: Record<string, unknown> = {};
      if (localIdentity) {
        metadata.status = localIdentity.status;
      }

      return c.json({
        agentId,
        wallet: walletAddress as string,
        uri: uri as string,
        metadata,
        registryAddress: config.identityRegistryAddress,
        chainId,
      }, 200);
    } catch (err) {
      if (err instanceof WAIaaSError) throw err;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to read Identity Registry: ${(err as Error).message}`,
      });
    }
  });

  // Route 2: GET /erc8004/agent/:agentId/reputation
  router.openapi(reputationRoute, async (c) => {
    const { agentId } = c.req.valid('param');
    const { tag1, tag2 } = c.req.valid('query');
    const config = getErc8004Config(deps.settingsService);

    if (!config.reputationRegistryAddress) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'Reputation Registry not configured',
      });
    }

    const client = createRpcClient(deps.settingsService);
    const registryAddress = config.reputationRegistryAddress as Hex;

    try {
      const agentIdBigInt = BigInt(agentId);

      const result = await client.readContract({
        address: registryAddress,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getSummary',
        args: [agentIdBigInt, [], tag1, tag2],
      });

      // getSummary returns: [count: bigint, summaryValue: bigint, summaryValueDecimals: number]
      const [count, summaryValue, summaryValueDecimals] = result as [bigint, bigint, number];

      return c.json({
        agentId,
        count: Number(count),
        score: String(summaryValue),
        decimals: Number(summaryValueDecimals),
        tag1,
        tag2,
      }, 200);
    } catch (err) {
      if (err instanceof WAIaaSError) throw err;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to read Reputation Registry: ${(err as Error).message}`,
      });
    }
  });

  // Route 3: GET /erc8004/registration-file/:walletId
  router.openapi(registrationFileRoute, async (c) => {
    const { walletId } = c.req.valid('param');
    const config = getErc8004Config(deps.settingsService);

    // Query wallet info
    const wallet = deps.db
      .select({
        id: wallets.id,
        name: wallets.name,
        chain: wallets.chain,
      })
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .get();

    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND');
    }

    // Query agent_identities for registration status
    const identity = deps.db
      .select({
        chainAgentId: agentIdentities.chainAgentId,
        registryAddress: agentIdentities.registryAddress,
        chainId: agentIdentities.chainId,
      })
      .from(agentIdentities)
      .where(eq(agentIdentities.walletId, walletId))
      .get();

    // Determine base URL from request or config
    const host = c.req.header('Host') ?? 'localhost:3100';
    const protocol = c.req.header('X-Forwarded-Proto') ?? 'http';
    const baseUrl = config.registrationFileBaseUrl || `${protocol}://${host}`;

    const file = buildRegistrationFile({
      name: wallet.name,
      baseUrl,
      ...(identity ? {
        agentId: identity.chainAgentId,
        identityRegistryAddress: identity.registryAddress,
        chainId: identity.chainId,
      } : {}),
    });

    return c.json(file, 200);
  });

  // Route 4: GET /erc8004/validation/:requestHash
  router.openapi(validationRoute, async (c) => {
    const { requestHash } = c.req.valid('param');
    const config = getErc8004Config(deps.settingsService);

    if (!config.validationRegistryAddress) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'Validation Registry not configured',
      });
    }

    const client = createRpcClient(deps.settingsService);
    const registryAddress = config.validationRegistryAddress as Hex;

    try {
      const result = await client.readContract({
        address: registryAddress,
        abi: VALIDATION_REGISTRY_ABI,
        functionName: 'getValidationStatus',
        args: [requestHash as Hex],
      });

      // getValidationStatus returns: [validator, agentId, response, responseHash, tag, lastUpdate]
      const [validator, agentIdVal, response, responseHash, tag, lastUpdate] = result as [
        string, bigint, number, string, string, bigint
      ];

      return c.json({
        requestHash,
        validator,
        agentId: String(agentIdVal),
        response: Number(response),
        responseHash,
        tag,
        lastUpdate: Number(lastUpdate),
      }, 200);
    } catch (err) {
      if (err instanceof WAIaaSError) throw err;
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to read Validation Registry: ${(err as Error).message}`,
      });
    }
  });

  return router;
}
