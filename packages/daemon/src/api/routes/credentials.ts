/**
 * Per-wallet credential CRUD routes.
 *
 * 4 endpoints:
 *   - GET    /wallets/:walletId/credentials       (masterAuth) - list per-wallet credentials
 *   - POST   /wallets/:walletId/credentials       (masterAuth) - create per-wallet credential
 *   - DELETE /wallets/:walletId/credentials/:ref   (masterAuth) - delete credential
 *   - PUT    /wallets/:walletId/credentials/:ref/rotate (masterAuth) - rotate credential value
 *
 * All responses return CredentialMetadata (never the decrypted value).
 *
 * @see docs/81-external-action-design.md D3.6
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute, z } from '@hono/zod-openapi';
import {
  CredentialMetadataSchema,
  CreateCredentialParamsSchema,
} from '@waiaas/core';
import type { ICredentialVault } from '../../infrastructure/credential/index.js';
import { openApiValidationHook, buildErrorResponses } from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CredentialRouteDeps {
  credentialVault: ICredentialVault;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const walletIdParam = z.object({ walletId: z.string() });
const refParam = z.object({ walletId: z.string(), ref: z.string() });

const listRoute = createRoute({
  method: 'get',
  path: '/wallets/{walletId}/credentials',
  tags: ['Credentials'],
  summary: 'List per-wallet credentials',
  request: { params: walletIdParam },
  responses: {
    200: {
      description: 'Credential metadata list (value never included)',
      content: { 'application/json': { schema: z.array(CredentialMetadataSchema) } },
    },
  },
});

const createRouteSpec = createRoute({
  method: 'post',
  path: '/wallets/{walletId}/credentials',
  tags: ['Credentials'],
  summary: 'Create per-wallet credential',
  request: {
    params: walletIdParam,
    body: {
      content: { 'application/json': { schema: CreateCredentialParamsSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Created credential metadata (value never included)',
      content: { 'application/json': { schema: CredentialMetadataSchema } },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED', 'CREDENTIAL_NOT_FOUND']),
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/wallets/{walletId}/credentials/{ref}',
  tags: ['Credentials'],
  summary: 'Delete per-wallet credential',
  request: { params: refParam },
  responses: {
    204: { description: 'Credential deleted' },
    ...buildErrorResponses(['CREDENTIAL_NOT_FOUND']),
  },
});

const rotateRoute = createRoute({
  method: 'put',
  path: '/wallets/{walletId}/credentials/{ref}/rotate',
  tags: ['Credentials'],
  summary: 'Rotate per-wallet credential value',
  request: {
    params: refParam,
    body: {
      content: {
        'application/json': {
          schema: z.object({ value: z.string().min(1) }),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Rotated credential metadata (value never included)',
      content: { 'application/json': { schema: CredentialMetadataSchema } },
    },
    ...buildErrorResponses(['CREDENTIAL_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function credentialRoutes(deps: CredentialRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(listRoute, async (c) => {
    const { walletId } = c.req.valid('param');
    const list = await deps.credentialVault.list(walletId);
    return c.json(list, 200);
  });

  router.openapi(createRouteSpec, async (c) => {
    const { walletId } = c.req.valid('param');
    const params = c.req.valid('json');
    const meta = await deps.credentialVault.create(walletId, params);
    return c.json(meta, 201);
  });

  router.openapi(deleteRoute, async (c) => {
    const { ref } = c.req.valid('param');
    await deps.credentialVault.delete(ref);
    return c.body(null, 204);
  });

  router.openapi(rotateRoute, async (c) => {
    const { ref } = c.req.valid('param');
    const { value } = c.req.valid('json');
    const meta = await deps.credentialVault.rotate(ref, value);
    return c.json(meta, 200);
  });

  return router;
}
