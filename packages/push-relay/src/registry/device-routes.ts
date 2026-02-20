import { Hono } from 'hono';
import { z } from 'zod';
import type { DeviceRegistry } from './device-registry.js';
import type { NtfySubscriber } from '../subscriber/ntfy-subscriber.js';
import type { IPushProvider } from '../providers/push-provider.js';

const DeviceRegistrationSchema = z.object({
  walletName: z.string().min(1),
  pushToken: z.string().min(1),
  platform: z.enum(['ios', 'android']),
});

export interface DeviceRoutesOpts {
  registry: DeviceRegistry;
  subscriber: NtfySubscriber;
  provider: IPushProvider;
}

export function createDeviceRoutes(opts: DeviceRoutesOpts): Hono {
  const app = new Hono();
  const { registry, subscriber, provider } = opts;

  // POST /devices — register device token
  app.post('/devices', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = DeviceRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }

    const { walletName, pushToken, platform } = parsed.data;
    registry.register(walletName, pushToken, platform);
    return c.json({ status: 'registered' }, 201);
  });

  // DELETE /devices/:token — unregister device token
  app.delete('/devices/:token', (c) => {
    const token = c.req.param('token');
    const removed = registry.unregister(token);
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
      ntfy: {
        connected: subscriber.connected,
        topics: subscriber.topicCount,
      },
      push: {
        provider: provider.name,
        configured: providerValid,
      },
      devices: registry.count(),
    });
  });

  return app;
}
