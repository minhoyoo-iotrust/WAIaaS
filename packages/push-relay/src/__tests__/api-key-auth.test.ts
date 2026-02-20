import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { apiKeyAuth } from '../middleware/api-key-auth.js';

const API_KEY = 'my-secret-key';

function makeApp(): Hono {
  const app = new Hono();
  app.use('/*', apiKeyAuth(API_KEY));
  app.get('/protected', (c) => c.json({ ok: true }));
  return app;
}

describe('apiKeyAuth', () => {
  it('allows request with correct API key', async () => {
    const app = makeApp();
    const res = await app.request('/protected', {
      headers: { 'X-API-Key': API_KEY },
    });
    expect(res.status).toBe(200);
  });

  it('rejects request without API key', async () => {
    const app = makeApp();
    const res = await app.request('/protected');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('rejects request with wrong API key', async () => {
    const app = makeApp();
    const res = await app.request('/protected', {
      headers: { 'X-API-Key': 'wrong-key' },
    });
    expect(res.status).toBe(401);
  });
});
