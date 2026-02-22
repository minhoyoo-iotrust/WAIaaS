/**
 * Token registry route handlers: GET /v1/tokens, POST /v1/tokens, DELETE /v1/tokens.
 *
 * GET /v1/tokens?network=: list all tokens (builtin + custom) for the given EVM network.
 * POST /v1/tokens: add a custom token to the registry (masterAuth required).
 * DELETE /v1/tokens: remove a custom token from the registry (masterAuth required).
 *
 * Token registry is UX-only: adding/removing tokens does NOT affect ALLOWED_TOKENS policy.
 *
 * @see docs/56-spl-erc20-spec.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { EVM_NETWORK_TYPES, WAIaaSError } from '@waiaas/core';
import type { TokenRegistryService } from '../../infrastructure/token-registry/index.js';
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

function validateEvmNetwork(network: string): void {
  if (!(EVM_NETWORK_TYPES as readonly string[]).includes(network)) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: `Invalid EVM network '${network}'. Valid networks: ${EVM_NETWORK_TYPES.join(', ')}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create token registry route sub-router.
 *
 * GET  /tokens?network= -> list builtin + custom tokens for the network.
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

    validateEvmNetwork(network);

    const tokens = await deps.tokenRegistryService.getTokensForNetwork(network);

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
        })),
      },
      200,
    );
  });

  // ---------------------------------------------------------------------------
  // POST /tokens
  // ---------------------------------------------------------------------------

  router.openapi(addTokenRoute, async (c) => {
    const body = c.req.valid('json');

    validateEvmNetwork(body.network);

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

    validateEvmNetwork(body.network);

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
