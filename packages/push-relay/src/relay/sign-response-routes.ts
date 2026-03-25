import { Hono } from 'hono';
import { z } from 'zod';
import { debug } from '../logger.js';
import type { DeviceRegistry } from '../registry/device-registry.js';
import type { IPushProvider } from '../providers/push-provider.js';
import type { IPayloadTransformer } from '../transformer/payload-transformer.js';

const SignResponseStoreSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  signature: z.string().optional(),
  signerAddress: z.string().min(1),
});

const PushRequestSchema = z.object({
  subscriptionToken: z.string().min(1),
  category: z.string().min(1),
  payload: z.record(z.unknown()),
});

export interface SignResponseRoutesOpts {
  registry: DeviceRegistry;
  provider: IPushProvider;
  apiKey: string;
  transformer?: IPayloadTransformer;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSignResponseRoutes(opts: SignResponseRoutesOpts): Hono {
  const app = new Hono();
  const { registry, provider, apiKey } = opts;

  // POST /v1/sign-response -- store response in DB (requires API key)
  app.post('/v1/sign-response', async (c) => {
    const reqKey = c.req.header('X-API-Key');
    if (!reqKey || reqKey !== apiKey) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body: unknown = await c.req.json();
    const parsed = SignResponseStoreSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }

    const { requestId, action, signature, signerAddress } = parsed.data;
    debug(`POST /v1/sign-response: requestId=${requestId}, action=${action}, signerAddress=${signerAddress}${signature ? `, signature=${signature.slice(0, 20)}...` : ''}`);


    // Build a full SignResponse object
    const signResponse = {
      version: '1' as const,
      requestId,
      action,
      ...(signature !== undefined ? { signature } : {}),
      signerAddress,
      signedAt: new Date().toISOString(),
    };

    const json = JSON.stringify(signResponse);
    registry.saveSignResponse(requestId, json, 300);

    debug(`Sign response stored: requestId=${requestId}`);
    return c.json({ status: 'stored', requestId }, 200);
  });

  // GET /v1/sign-response/:requestId -- long-polling
  app.get('/v1/sign-response/:requestId', async (c) => {
    const requestId = c.req.param('requestId');
    const timeoutParam = c.req.query('timeout');
    const timeout = Math.min(Math.max(parseInt(timeoutParam || '30', 10) || 30, 1), 120);

    debug(`GET /v1/sign-response/${requestId}: timeout=${timeout}s`);

    // Check immediately
    const immediate = registry.getSignResponse(requestId);
    if (immediate) {
      registry.deleteSignResponse(requestId);
      const parsed = JSON.parse(immediate) as Record<string, unknown>;
      debug(`GET /v1/sign-response/${requestId}: found (immediate), action=${parsed.action}, signerAddress=${parsed.signerAddress}`);
      return c.json(parsed, 200);
    }

    // Poll every 1 second until timeout
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      await sleep(1000);
      const response = registry.getSignResponse(requestId);
      if (response) {
        registry.deleteSignResponse(requestId);
        const parsed = JSON.parse(response) as Record<string, unknown>;
        debug(`GET /v1/sign-response/${requestId}: found (polled), action=${parsed.action}, signerAddress=${parsed.signerAddress}`);
        return c.json(parsed, 200);
      }
    }

    return c.body(null, 204);
  });

  // POST /v1/push -- direct push notification (no API key — subscriptionToken is the credential)
  app.post('/v1/push', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = PushRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }

    const { subscriptionToken, category, payload } = parsed.data;
    debug(`POST /v1/push: subscriptionToken=${subscriptionToken}, category=${category}, payload=${JSON.stringify(payload)}`);

    const device = registry.getBySubscriptionToken(subscriptionToken);
    if (!device) {
      return c.json({ error: 'Device not found for subscription token' }, 404);
    }

    // Build push payload
    const pushPayload = {
      title: (payload.title as string) || category,
      body: (payload.body as string) || (category === 'sign_request' ? 'Transaction approval required' : 'WAIaaS notification'),
      data: Object.fromEntries(
        Object.entries(payload).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
      ),
      category: category as 'sign_request' | 'notification',
      priority: (category === 'sign_request' ? 'high' : 'normal') as 'high' | 'normal',
    };

    const finalPayload = opts.transformer ? opts.transformer.transform(pushPayload) : pushPayload;
    debug(`POST /v1/push: finalPayload=${JSON.stringify(finalPayload)}`);

    const result = await provider.send([device.pushToken], finalPayload);
    debug(`POST /v1/push: provider=${provider.name}, sent=${result.sent}, failed=${result.failed}${result.invalidTokens.length > 0 ? `, invalidTokens=${result.invalidTokens.length}` : ''}`);
    if (result.invalidTokens.length > 0) {
      registry.removeTokens(result.invalidTokens);
    }

    return c.json({ status: 'sent', sent: result.sent, failed: result.failed }, 200);
  });

  return app;
}
