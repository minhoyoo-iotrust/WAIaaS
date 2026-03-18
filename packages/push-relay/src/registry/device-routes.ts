import { Hono } from 'hono';
import { z } from 'zod';
import type { DeviceRegistry } from './device-registry.js';
import type { IPushProvider } from '../providers/push-provider.js';
import { debug } from '../logger.js';

const DeviceRegistrationSchema = z.object({
  walletName: z.string().min(1),
  pushToken: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

export interface DeviceRoutesOpts {
  registry: DeviceRegistry;
  provider: IPushProvider;
  version?: string;
}

export function createDeviceRoutes(opts: DeviceRoutesOpts): Hono {
  const app = new Hono();
  const { registry, provider, version } = opts;

  // POST /devices — register device token
  app.post('/devices', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = DeviceRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }

    const { walletName, pushToken, platform } = parsed.data;
    debug(`POST /devices: wallet=${walletName}, platform=${platform}, pushToken=${pushToken.slice(0, 8)}...`);
    const result = registry.register(walletName, pushToken, platform);
    const token = result.subscriptionToken;
    debug(`Device registered: subscriptionToken=${token}`);

    return c.json({ status: 'registered', subscription_token: token }, 201);
  });

  // GET /devices/:token/subscription-token — get subscription token for a device
  app.get('/devices/:token/subscription-token', (c) => {
    const token = c.req.param('token');
    const subToken = registry.getSubscriptionToken(token);
    if (subToken === null) {
      return c.json({ error: 'Device not found' }, 404);
    }
    return c.json({ subscription_token: subToken });
  });

  // DELETE /devices/:token — unregister device token
  app.delete('/devices/:token', (c) => {
    const pushToken = c.req.param('token');
    debug(`DELETE /devices/${pushToken.slice(0, 8)}...`);

    const removed = registry.unregister(pushToken);
    if (!removed) {
      return c.json({ error: 'Token not found' }, 404);
    }

    return c.body(null, 204);
  });

  // GET /health — health check
  app.get('/health', async (c) => {
    const providerValid = await provider.validateConfig();
    return c.json({
      status: 'ok',
      version: version ?? 'unknown',
      push: {
        provider: provider.name,
        configured: providerValid,
      },
      devices: registry.count(),
      sign_responses: registry.signResponseCount(),
    });
  });

  return app;
}
