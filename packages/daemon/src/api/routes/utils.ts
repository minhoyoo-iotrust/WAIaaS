/**
 * Utils routes: stateless utility endpoints.
 *
 * POST /utils/encode-calldata - Encode EVM function call into calldata hex.
 * Wraps viem's encodeFunctionData(). No DB, keystore, or adapter dependencies.
 */

import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { encodeFunctionData, type Abi } from 'viem';
import { WAIaaSError } from '@waiaas/core';
import {
  EncodeCalldataRequestSchema,
  EncodeCalldataResponseSchema,
  openApiValidationHook,
  buildErrorResponses,
} from './openapi-schemas.js';

const encodeCalldataRoute = createRoute({
  method: 'post',
  path: '/utils/encode-calldata',
  tags: ['Utils'],
  summary: 'Encode EVM function call into calldata hex',
  request: {
    body: {
      content: {
        'application/json': { schema: EncodeCalldataRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Encoded calldata',
      content: { 'application/json': { schema: EncodeCalldataResponseSchema } },
    },
    ...buildErrorResponses(['ABI_ENCODING_FAILED']),
  },
});

export function utilsRoutes(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(encodeCalldataRoute, (c) => {
    const { abi, functionName, args } = c.req.valid('json');
    try {
      const calldata = encodeFunctionData({
        abi: abi as unknown as Abi,
        functionName,
        args: args ?? [],
      });
      const selector = calldata.slice(0, 10); // first 4 bytes = function selector
      return c.json({ calldata, selector, functionName }, 200);
    } catch (err) {
      throw new WAIaaSError('ABI_ENCODING_FAILED', {
        message: err instanceof Error ? err.message : 'ABI encoding failed',
      });
    }
  });

  return router;
}
