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
  signTopicPrefix: string;
  notifyTopicPrefix: string;
  version?: string;
}

export function createDeviceRoutes(opts: DeviceRoutesOpts): Hono {
  const app = new Hono();
  const { registry, subscriber, provider, signTopicPrefix, notifyTopicPrefix, version } = opts;

  // POST /devices — register device token
  app.post('/devices', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = DeviceRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }

    const { walletName, pushToken, platform } = parsed.data;
    const result = registry.register(walletName, pushToken, platform);
    const token = result.subscriptionToken;

    // Dynamically subscribe to subscription-token-based topics
    subscriber.addTopics(
      walletName,
      `${signTopicPrefix}-${walletName}-${token}`,
      `${notifyTopicPrefix}-${walletName}-${token}`,
    );

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

    // Look up device before deletion to get topic info
    const device = registry.getByPushToken(pushToken);
    const removed = registry.unregister(pushToken);
    if (!removed) {
      return c.json({ error: 'Token not found' }, 404);
    }

    // Dynamically unsubscribe from subscription-token-based topics
    if (device?.subscriptionToken) {
      subscriber.removeTopics(
        `${signTopicPrefix}-${device.walletName}-${device.subscriptionToken}`,
        `${notifyTopicPrefix}-${device.walletName}-${device.subscriptionToken}`,
      );
    }

    return c.body(null, 204);
  });

  // GET /health — health check
  app.get('/health', async (c) => {
    const providerValid = await provider.validateConfig();
    return c.json({
      status: 'ok',
      version: version ?? 'unknown',
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
