/**
 * Global (admin) credential CRUD routes.
 *
 * 4 endpoints:
 *   - GET    /admin/credentials       (masterAuth) - list global credentials
 *   - POST   /admin/credentials       (masterAuth) - create global credential
 *   - DELETE /admin/credentials/:ref   (masterAuth) - delete global credential
 *   - PUT    /admin/credentials/:ref/rotate (masterAuth) - rotate global credential value
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

export interface AdminCredentialRouteDeps {
  credentialVault: ICredentialVault;
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const refParam = z.object({ ref: z.string() });

const listRoute = createRoute({
  method: 'get',
  path: '/admin/credentials',
  tags: ['Admin', 'Credentials'],
  summary: 'List global credentials',
  responses: {
    200: {
      description: 'Global credential metadata list (value never included)',
      content: { 'application/json': { schema: z.array(CredentialMetadataSchema) } },
    },
  },
});

const createRouteSpec = createRoute({
  method: 'post',
  path: '/admin/credentials',
  tags: ['Admin', 'Credentials'],
  summary: 'Create global credential',
  request: {
    body: {
      content: { 'application/json': { schema: CreateCredentialParamsSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Created global credential metadata (value never included)',
      content: { 'application/json': { schema: CredentialMetadataSchema } },
    },
    ...buildErrorResponses(['ACTION_VALIDATION_FAILED']),
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/admin/credentials/{ref}',
  tags: ['Admin', 'Credentials'],
  summary: 'Delete global credential',
  request: { params: refParam },
  responses: {
    204: { description: 'Credential deleted' },
    ...buildErrorResponses(['CREDENTIAL_NOT_FOUND']),
  },
});

const rotateRoute = createRoute({
  method: 'put',
  path: '/admin/credentials/{ref}/rotate',
  tags: ['Admin', 'Credentials'],
  summary: 'Rotate global credential value',
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

export function adminCredentialRoutes(deps: AdminCredentialRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(listRoute, async (c) => {
    const list = await deps.credentialVault.list();
    return c.json(list, 200);
  });

  router.openapi(createRouteSpec, async (c) => {
    const params = c.req.valid('json');
    const meta = await deps.credentialVault.create(null, params);
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
