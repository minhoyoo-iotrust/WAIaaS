/**
 * Wallet Apps route handlers: Human Wallet Apps CRUD.
 *
 * GET    /admin/wallet-apps       - List all wallet apps with used_by (masterAuth)
 * POST   /admin/wallet-apps       - Register a new wallet app (masterAuth)
 * PUT    /admin/wallet-apps/:id   - Update app toggles (masterAuth)
 * DELETE /admin/wallet-apps/:id   - Remove a wallet app (masterAuth)
 *
 * @see internal/objectives/m29-07-dcent-owner-signing.md
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { WAIaaSError } from '@waiaas/core';
import type { WalletAppService, WalletApp, WalletAppWithUsedBy } from '../../services/signing-sdk/wallet-app-service.js';
import {
  WalletAppListResponseSchema,
  WalletAppCreateRequestSchema,
  WalletAppUpdateRequestSchema,
  WalletAppResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface WalletAppsRouteDeps {
  walletAppService: WalletAppService;
}

// ---------------------------------------------------------------------------
// Response mapper
// ---------------------------------------------------------------------------

function toApiResponse(app: WalletApp | WalletAppWithUsedBy) {
  return {
    id: app.id,
    name: app.name,
    display_name: app.displayName,
    signing_enabled: app.signingEnabled,
    alerts_enabled: app.alertsEnabled,
    sign_topic: app.signTopic,
    notify_topic: app.notifyTopic,
    used_by: 'usedBy' in app ? app.usedBy : [],
    created_at: app.createdAt,
    updated_at: app.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const listRoute = createRoute({
  method: 'get',
  path: '/admin/wallet-apps',
  tags: ['Admin'],
  summary: 'List all wallet apps',
  responses: {
    200: {
      description: 'Wallet apps list',
      content: { 'application/json': { schema: WalletAppListResponseSchema } },
    },
  },
});

const createAppRoute = createRoute({
  method: 'post',
  path: '/admin/wallet-apps',
  tags: ['Admin'],
  summary: 'Register a new wallet app',
  request: {
    body: { content: { 'application/json': { schema: WalletAppCreateRequestSchema } }, required: true },
  },
  responses: {
    201: {
      description: 'Wallet app created',
      content: { 'application/json': { schema: WalletAppResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_APP_DUPLICATE']),
  },
});

const updateAppRoute = createRoute({
  method: 'put',
  path: '/admin/wallet-apps/{id}',
  tags: ['Admin'],
  summary: 'Update wallet app toggles',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: WalletAppUpdateRequestSchema } }, required: true },
  },
  responses: {
    200: {
      description: 'Wallet app updated',
      content: { 'application/json': { schema: WalletAppResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_APP_NOT_FOUND']),
  },
});

const deleteAppRoute = createRoute({
  method: 'delete',
  path: '/admin/wallet-apps/{id}',
  tags: ['Admin'],
  summary: 'Remove a wallet app',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: 'Wallet app removed',
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } },
    },
    ...buildErrorResponses(['WALLET_APP_NOT_FOUND']),
  },
});

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export function createWalletAppsRoutes(deps: WalletAppsRouteDeps): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  // GET /admin/wallet-apps
  router.openapi(listRoute, (c) => {
    const apps = deps.walletAppService.listWithUsedBy();
    return c.json({ apps: apps.map(toApiResponse) }, 200);
  });

  // POST /admin/wallet-apps
  router.openapi(createAppRoute, (c) => {
    const body = c.req.valid('json');
    try {
      const app = deps.walletAppService.register(body.name, body.display_name, {
        signTopic: body.sign_topic,
        notifyTopic: body.notify_topic,
      });
      return c.json({ app: toApiResponse(app) }, 201);
    } catch (err) {
      if (err instanceof WAIaaSError && err.code === 'WALLET_APP_DUPLICATE') {
        throw err;
      }
      throw err;
    }
  });

  // PUT /admin/wallet-apps/:id
  router.openapi(updateAppRoute, (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const app = deps.walletAppService.update(id, {
        signingEnabled: body.signing_enabled,
        alertsEnabled: body.alerts_enabled,
        signTopic: body.sign_topic,
        notifyTopic: body.notify_topic,
      });
      // Re-fetch with usedBy info
      const appWithUsedBy = deps.walletAppService.listWithUsedBy().find((a) => a.id === app.id);
      return c.json({ app: toApiResponse(appWithUsedBy ?? app) }, 200);
    } catch (err) {
      if (err instanceof WAIaaSError && err.code === 'WALLET_APP_NOT_FOUND') {
        throw err;
      }
      throw err;
    }
  });

  // DELETE /admin/wallet-apps/:id
  router.openapi(deleteAppRoute, (c) => {
    const { id } = c.req.valid('param');
    try {
      deps.walletAppService.remove(id);
      return c.json({ ok: true }, 200);
    } catch (err) {
      if (err instanceof WAIaaSError && err.code === 'WALLET_APP_NOT_FOUND') {
        throw err;
      }
      throw err;
    }
  });

  return router;
}
