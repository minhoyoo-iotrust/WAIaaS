import { Hono } from 'hono';
import { z } from 'zod';
import { debug } from '../logger.js';

const SignResponseRelaySchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  signature: z.string().optional(),
  signerAddress: z.string().min(1),
  responseTopic: z.string().min(1),
});

export interface SignResponseRoutesOpts {
  ntfyServer: string;
}

export function createSignResponseRoutes(opts: SignResponseRoutesOpts): Hono {
  const app = new Hono();

  // POST /v1/sign-response — relay a signing response to ntfy
  app.post('/v1/sign-response', async (c) => {
    const body: unknown = await c.req.json();
    const parsed = SignResponseRelaySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400);
    }

    const { requestId, action, signature, signerAddress, responseTopic } = parsed.data;
    debug(`POST /v1/sign-response: requestId=${requestId}, action=${action}, topic=${responseTopic}`);

    // Build a full SignResponse object
    const signResponse = {
      version: '1' as const,
      requestId,
      action,
      ...(signature !== undefined ? { signature } : {}),
      signerAddress,
      signedAt: new Date().toISOString(),
    };

    // base64url encode and POST to ntfy response topic
    const json = JSON.stringify(signResponse);
    const encoded = Buffer.from(json, 'utf-8').toString('base64url');
    const ntfyUrl = `${opts.ntfyServer}/${responseTopic}`;

    const ntfyRes = await fetch(ntfyUrl, {
      method: 'POST',
      body: encoded,
    });

    if (!ntfyRes.ok) {
      debug(`ntfy relay failed: HTTP ${ntfyRes.status}, url=${ntfyUrl}`);
      return c.json(
        { error: 'Failed to relay response to ntfy', status: ntfyRes.status },
        502,
      );
    }

    debug(`Sign response relayed: requestId=${requestId}`);
    return c.json({ status: 'relayed', requestId }, 200);
  });

  return app;
}
