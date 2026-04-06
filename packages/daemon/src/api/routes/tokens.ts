/**
 * Token registry route handlers: GET /v1/tokens, POST /v1/tokens, DELETE /v1/tokens,
 * GET /v1/tokens/resolve.
 *
 * GET /v1/tokens?network=: list all tokens (builtin + custom) for the given EVM network.
 * POST /v1/tokens: add a custom token to the registry (masterAuth required).
 * DELETE /v1/tokens: remove a custom token from the registry (masterAuth required).
 * GET /v1/tokens/resolve?network=&address=: resolve ERC-20 token metadata on-chain.
 *
 * Token registry is UX-only: adding/removing tokens does NOT affect ALLOWED_TOKENS policy.
 *
 * @see docs/56-spl-erc20-spec.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { createPublicClient, http, type Address } from 'viem';
import { EVM_NETWORK_TYPES, RIPPLE_NETWORK_TYPES, WAIaaSError, networkToCaip2 } from '@waiaas/core';
import type { NetworkType } from '@waiaas/core';
import type { TokenRegistryService } from '../../infrastructure/token-registry/index.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';

/** Minimal ERC-20 ABI for on-chain metadata resolution (symbol, name, decimals). */
const ERC20_METADATA_ABI = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
] as const;
import {
  TokenRegistryListResponseSchema,
  AddTokenRequestSchema,
  AddTokenResponseSchema,
  RemoveTokenRequestSchema,
  RemoveTokenResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

export interface TokenRegistryRouteDeps {
  tokenRegistryService: TokenRegistryService;
  rpcConfig?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const listTokensRoute = createRoute({
  method: 'get',
  path: '/tokens',
  tags: ['Tokens'],
  summary: 'List tokens for a network',
  request: {
    query: z.object({
      network: z.string().openapi({ example: 'ethereum-mainnet' }),
    }),
  },
  responses: {
    200: {
      description: 'Token list',
      content: { 'application/json': { schema: TokenRegistryListResponseSchema } },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED']),
  },
});

const addTokenRoute = createRoute({
  method: 'post',
  path: '/tokens',
  tags: ['Tokens'],
  summary: 'Add a custom token to the registry',
  request: {
    body: {
      content: {
        'application/json': { schema: AddTokenRequestSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Token added',
      content: { 'application/json': { schema: AddTokenResponseSchema } },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED']),
  },
});

const removeTokenRoute = createRoute({
  method: 'delete',
  path: '/tokens',
  tags: ['Tokens'],
  summary: 'Remove a custom token from the registry',
  request: {
    body: {
      content: {
        'application/json': { schema: RemoveTokenRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Token removal result',
      content: { 'application/json': { schema: RemoveTokenResponseSchema } },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED']),
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN_REGISTRY_NETWORKS: readonly string[] = [...EVM_NETWORK_TYPES, ...RIPPLE_NETWORK_TYPES];

function validateTokenRegistryNetwork(network: string): void {
  if (!TOKEN_REGISTRY_NETWORKS.includes(network)) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: `Invalid network '${network}'. Valid networks: ${TOKEN_REGISTRY_NETWORKS.join(', ')}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

const resolveTokenRoute = createRoute({
  method: 'get',
  path: '/tokens/resolve',
  tags: ['Tokens'],
  summary: 'Resolve ERC-20 token metadata on-chain',
  request: {
    query: z.object({
      network: z.string().openapi({ example: 'ethereum-mainnet' }),
      address: z.string().openapi({ example: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }),
    }),
  },
  responses: {
    200: {
      description: 'Resolved token metadata',
      content: {
        'application/json': {
          schema: z.object({
            symbol: z.string(),
            name: z.string(),
            decimals: z.number(),
            address: z.string(),
            network: z.string(),
          }),
        },
      },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED']),
  },
});

/**
 * Create token registry route sub-router.
 *
 * GET  /tokens?network= -> list builtin + custom tokens for the network.
 * GET  /tokens/resolve?network=&address= -> resolve ERC-20 metadata on-chain.
 * POST /tokens -> add custom token (409 on duplicate).
 * DELETE /tokens -> remove custom token.
 */
export function tokenRegistryRoutes(deps: TokenRegistryRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // ---------------------------------------------------------------------------
  // GET /tokens?network=
  // ---------------------------------------------------------------------------

  router.openapi(listTokensRoute, async (c) => {
    const { network } = c.req.valid('query');

    validateTokenRegistryNetwork(network);

    const tokens = await deps.tokenRegistryService.getTokensForNetwork(network);

    // CAIP-2 chainId for tokens response (graceful)
    let tokensChainId: string | undefined;
    try { tokensChainId = networkToCaip2(network as NetworkType); } catch { /* graceful */ }

    return c.json(
      {
        network,
        tokens: tokens.map((t) => ({
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          source: t.source,
          assetId: t.assetId ?? null,
          ...(tokensChainId ? { chainId: tokensChainId } : {}),
        })),
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // GET /tokens/resolve?network=&address=
  // ---------------------------------------------------------------------------

  router.openapi(resolveTokenRoute, async (c) => {
    const { network, address } = c.req.valid('query');

    // Resolve is EVM-only (ERC-20 ABI call)
    if (!(EVM_NETWORK_TYPES as readonly string[]).includes(network)) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `Token resolve is only supported for EVM networks. Got '${network}'.`,
      });
    }

    const rpcConfig = deps.rpcConfig ?? {};
    const rpcUrl = resolveRpcUrl(rpcConfig, 'ethereum', network);
    if (!rpcUrl) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `No RPC URL configured for network '${network}'. Set rpc.evm_${network.replace(/-/g, '_')} in config.`,
      });
    }

    try {
      const client = createPublicClient({ transport: http(rpcUrl) });
      const contractAddress = address as Address;

      const [symbol, name, decimals] = await Promise.all([
        client.readContract({ address: contractAddress, abi: ERC20_METADATA_ABI, functionName: 'symbol' }),
        client.readContract({ address: contractAddress, abi: ERC20_METADATA_ABI, functionName: 'name' }),
        client.readContract({ address: contractAddress, abi: ERC20_METADATA_ABI, functionName: 'decimals' }),
      ]);

      return c.json({ symbol: symbol as string, name: name as string, decimals: Number(decimals), address, network }, 200);
    } catch (err) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `Failed to resolve token at address '${address}' on '${network}': ${err instanceof Error ? err.message : 'unknown error'}`,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /tokens
  // ---------------------------------------------------------------------------

  router.openapi(addTokenRoute, async (c) => {
    const body = c.req.valid('json');

    validateTokenRegistryNetwork(body.network);

    try {
      const result = await deps.tokenRegistryService.addCustomToken(body.network, {
        address: body.address,
        symbol: body.symbol,
        name: body.name,
        decimals: body.decimals,
      });

      return c.json(
        {
          id: result.id,
          network: body.network,
          address: body.address,
          symbol: body.symbol,
        },
        201,
      );
    } catch (err) {
      // UNIQUE constraint violation -> 409 Conflict
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
          message: 'Token already exists in registry',
        });
      }
      throw err;
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /tokens
  // ---------------------------------------------------------------------------

  router.openapi(removeTokenRoute, async (c) => {
    const body = c.req.valid('json');

    validateTokenRegistryNetwork(body.network);

    const removed = await deps.tokenRegistryService.removeCustomToken(body.network, body.address);

    return c.json(
      {
        removed,
        network: body.network,
        address: body.address,
      },
      200,
    );
  });

  return router;
}
