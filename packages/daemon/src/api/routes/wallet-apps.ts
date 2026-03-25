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
import { WAIaaSError, SignResponseSchema } from '@waiaas/core';
import { generateId } from '../../infrastructure/database/id.js';
import type { WalletAppService, WalletApp, WalletAppWithUsedBy } from '../../services/signing-sdk/wallet-app-service.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import { buildSignRequestPushPayload } from '../../services/signing-sdk/channels/index.js';
import {
  WalletAppListResponseSchema,
  WalletAppCreateRequestSchema,
  WalletAppUpdateRequestSchema,
  WalletAppResponseSchema,
  WalletAppTestNotificationResponseSchema,
  WalletAppTestSignRequestResponseSchema,
  buildErrorResponses,
  openApiValidationHook,
} from './openapi-schemas.js';

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface WalletAppsRouteDeps {
  walletAppService: WalletAppService;
  settingsService?: SettingsService;
}

// ---------------------------------------------------------------------------
// Response mapper
// ---------------------------------------------------------------------------

function toApiResponse(app: WalletApp | WalletAppWithUsedBy) {
  return {
    id: app.id,
    name: app.name,
    display_name: app.displayName,
    wallet_type: app.walletType,
    signing_enabled: app.signingEnabled,
    alerts_enabled: app.alertsEnabled,
    sign_topic: app.signTopic,
    notify_topic: app.notifyTopic,
    subscription_token: app.subscriptionToken,
    push_relay_url: app.pushRelayUrl,
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

const testNotificationRoute = createRoute({
  method: 'post',
  path: '/admin/wallet-apps/{id}/test-notification',
  tags: ['Admin'],
  summary: 'Send a test notification to a wallet app',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: 'Test notification result',
      content: { 'application/json': { schema: WalletAppTestNotificationResponseSchema } },
    },
    ...buildErrorResponses(['WALLET_APP_NOT_FOUND']),
  },
});

const testSignRequestRoute = createRoute({
  method: 'post',
  path: '/admin/wallet-apps/{id}/test-sign-request',
  tags: ['Admin'],
  summary: 'Send a test sign request to a wallet app and wait for response',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: 'Test sign request result',
      content: { 'application/json': { schema: WalletAppTestSignRequestResponseSchema } },
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
        walletType: body.wallet_type,
        signTopic: body.sign_topic,
        notifyTopic: body.notify_topic,
        pushRelayUrl: body.push_relay_url,
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
        subscriptionToken: body.subscription_token,
        pushRelayUrl: body.push_relay_url,
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

  // POST /admin/wallet-apps/:id/test-notification
  router.openapi(testNotificationRoute, async (c) => {
    const { id } = c.req.valid('param');

    // Look up the wallet app
    const app = deps.walletAppService.getById(id);
    if (!app) {
      throw new WAIaaSError('WALLET_APP_NOT_FOUND', { message: `Wallet app ${id} not found` });
    }

    // Gate 1: Signing SDK enabled
    if (deps.settingsService) {
      const sdkEnabled = deps.settingsService.get('signing_sdk.enabled');
      if (sdkEnabled !== 'true') {
        return c.json({ success: false, error: 'Signing SDK is disabled' }, 200);
      }

      // Gate 2: Notifications enabled
      const notifEnabled = deps.settingsService.get('signing_sdk.notifications_enabled');
      if (notifEnabled !== 'true') {
        return c.json({ success: false, error: 'Wallet app notifications are disabled' }, 200);
      }
    }

    // Gate 3: App alerts enabled
    if (!app.alertsEnabled) {
      return c.json({ success: false, error: 'Alerts are disabled for this app' }, 200);
    }

    // Gate 4: Device registered (subscriptionToken exists)
    if (!app.subscriptionToken) {
      return c.json({
        success: false,
        error: 'No device registered for this wallet app. Register a device first.',
      }, 200);
    }

    // Gate 5: Push Relay URL configured
    if (!app.pushRelayUrl) {
      return c.json({ success: false, error: 'No Push Relay URL configured for this app' }, 200);
    }

    try {
      const message = {
        version: '1' as const,
        eventType: 'TEST',
        walletId: '',
        walletName: app.name,
        category: 'system' as const,
        title: 'Test Notification',
        body: `WAIaaS test notification for ${app.displayName}`,
        timestamp: Math.floor(Date.now() / 1000),
      };

      const pushRelayUrl = app.pushRelayUrl.replace(/\/$/, '');
      const res = await fetch(`${pushRelayUrl}/v1/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionToken: app.subscriptionToken,
          category: 'notification',
          payload: message,
        }),
      });
      if (!res.ok) {
        return c.json({ success: false, error: `Push Relay returned ${res.status}` }, 200);
      }
      return c.json({ success: true }, 200);
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'Unknown error';
      if (err instanceof Error && err.cause instanceof Error) {
        msg = `${msg}: ${err.cause.message}`;
      }
      return c.json({ success: false, error: msg }, 200);
    }
  });

  // POST /admin/wallet-apps/:id/test-sign-request
  router.openapi(testSignRequestRoute, async (c) => {
    const { id } = c.req.valid('param');

    const app = deps.walletAppService.getById(id);
    if (!app) {
      throw new WAIaaSError('WALLET_APP_NOT_FOUND', { message: `Wallet app ${id} not found` });
    }

    // Gate 1: Signing SDK enabled
    if (deps.settingsService) {
      const sdkEnabled = deps.settingsService.get('signing_sdk.enabled');
      if (sdkEnabled !== 'true') {
        return c.json({ success: false, error: 'Signing SDK is disabled' }, 200);
      }
    }

    // Gate 2: Signing enabled on app
    if (!app.signingEnabled) {
      return c.json({ success: false, error: 'Signing is disabled for this app' }, 200);
    }

    // Gate 3: Device registered
    if (!app.subscriptionToken) {
      return c.json({ success: false, error: 'No device registered for this wallet app' }, 200);
    }

    // Gate 4: Push Relay URL
    if (!app.pushRelayUrl) {
      return c.json({ success: false, error: 'No Push Relay URL configured for this app' }, 200);
    }

    try {
      const requestId = generateId();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30_000); // 30s timeout

      // Build a minimal test SignRequest
      const testRequest = {
        version: '1' as const,
        requestId,
        walletName: app.name,
        chain: 'evm' as const,
        chainId: 'eip155:1',
        signerAddress: '0x0000000000000000000000000000000000000000',
        message: `WAIaaS Test Sign Request for ${app.displayName}\nThis is a connectivity test. Approve or reject to verify the signing flow.`,
        displayMessage: `Test sign request for ${app.displayName}`,
        metadata: {
          txId: `test-${requestId.slice(0, 8)}`,
          type: 'SIGN',
          from: '0x0000000000000000000000000000000000000000',
          to: '0x0000000000000000000000000000000000000000',
          policyTier: 'APPROVAL' as const,
        },
        responseChannel: { type: 'push_relay' as const },
        expiresAt: expiresAt.toISOString(),
      };

      const pushRelayUrl = app.pushRelayUrl.replace(/\/$/, '');

      // Build flat-field payload (same format as PushRelaySigningChannel)
      const payload = buildSignRequestPushPayload(
        {
          version: testRequest.version,
          requestId: testRequest.requestId,
          caip2ChainId: testRequest.chainId,
          signerAddress: testRequest.signerAddress,
          message: testRequest.message,
          displayMessage: testRequest.displayMessage,
          expiresAt: testRequest.expiresAt,
          metadata: testRequest.metadata,
          responseChannel: testRequest.responseChannel,
        },
        { title: 'WAIaaS Test Sign Request' },
      );

      // Send sign request to Push Relay
      const pushRes = await fetch(`${pushRelayUrl}/v1/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionToken: app.subscriptionToken,
          category: 'sign_request',
          payload,
        }),
      });
      if (!pushRes.ok) {
        return c.json({ success: false, error: `Push Relay returned ${pushRes.status}` }, 200);
      }

      // Long-poll for response (30s timeout)
      const pollRes = await fetch(`${pushRelayUrl}/v1/sign-response/${requestId}?timeout=30`, {
        method: 'GET',
        signal: AbortSignal.timeout(35_000), // 35s to allow 30s server-side + network
      });

      if (pollRes.status === 204) {
        return c.json({ success: false, timeout: true, error: 'No response within 30 seconds' }, 200);
      }

      if (pollRes.status === 200) {
        const body = (await pollRes.json()) as { response: string };
        const json = Buffer.from(body.response, 'base64url').toString('utf-8');
        const parsed: unknown = JSON.parse(json);
        const signResponse = SignResponseSchema.parse(parsed);
        return c.json({
          success: true,
          result: {
            action: signResponse.action,
            signature: signResponse.signature,
            signerAddress: signResponse.signerAddress,
            signedAt: signResponse.signedAt,
          },
        }, 200);
      }

      return c.json({ success: false, error: `Unexpected response status ${pollRes.status}` }, 200);
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        return c.json({ success: false, timeout: true, error: 'No response within 30 seconds' }, 200);
      }
      let msg = err instanceof Error ? err.message : 'Unknown error';
      if (err instanceof Error && err.cause instanceof Error) {
        msg = `${msg}: ${err.cause.message}`;
      }
      return c.json({ success: false, error: msg }, 200);
    }
  });

  return router;
}
