import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { apiKeyAuth } from './middleware/api-key-auth.js';
import { debug } from './logger.js';
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
  signTopicPrefix: string;
  notifyTopicPrefix: string;
  version?: string;
}

export function createServer(opts: ServerOpts): Hono {
  const app = new Hono();
  const { registry, subscriber, provider, apiKey, ntfyServer, signTopicPrefix, notifyTopicPrefix, version } = opts;

  // Request logging (debug mode)
  app.use('/*', async (c, next) => {
    debug(`→ ${c.req.method} ${c.req.path}`);
    await next();
  });

  // CORS — allow cross-origin requests from wallet apps
  app.use('/*', cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'X-API-Key'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  }));

  // Health check is public
  const deviceRoutes = createDeviceRoutes({ registry, subscriber, provider, signTopicPrefix, notifyTopicPrefix, version });

  // Sign response relay (public — wallet apps call this without API key)
  const signResponseRoutes = createSignResponseRoutes({ ntfyServer });

  // Apply API key auth to device registration/deletion endpoints only
  app.use('/devices/*', apiKeyAuth(apiKey));
  app.post('/devices', apiKeyAuth(apiKey));

  app.route('/', deviceRoutes);
  app.route('/', signResponseRoutes);

  return app;
}
