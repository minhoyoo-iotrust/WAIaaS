import { Hono } from 'hono';
import { apiKeyAuth } from './middleware/api-key-auth.js';
import { createDeviceRoutes } from './registry/device-routes.js';
import { createSignResponseRoutes } from './relay/sign-response-routes.js';
import type { DeviceRegistry } from './registry/device-registry.js';
import type { NtfySubscriber } from './subscriber/ntfy-subscriber.js';
import type { IPushProvider } from './providers/push-provider.js';

export interface ServerOpts {
  registry: DeviceRegistry;
  subscriber: NtfySubscriber;
  provider: IPushProvider;
  apiKey: string;
  ntfyServer: string;
}

export function createServer(opts: ServerOpts): Hono {
  const app = new Hono();
  const { registry, subscriber, provider, apiKey, ntfyServer } = opts;

  // Health check is public
  const deviceRoutes = createDeviceRoutes({ registry, subscriber, provider });

  // Sign response relay (public — wallet apps call this without API key)
  const signResponseRoutes = createSignResponseRoutes({ ntfyServer });

  // Apply API key auth to device registration/deletion endpoints only
  app.use('/devices/*', apiKeyAuth(apiKey));
  app.post('/devices', apiKeyAuth(apiKey));

  app.route('/', deviceRoutes);
  app.route('/', signResponseRoutes);

  return app;
}
