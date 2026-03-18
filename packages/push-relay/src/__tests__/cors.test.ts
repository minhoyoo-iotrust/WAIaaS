import { describe, it, expect, vi } from 'vitest';
import { createServer } from '../server.js';
import type { DeviceRegistry } from '../registry/device-registry.js';
import type { IPushProvider } from '../providers/push-provider.js';

function makeServer() {
  const registry = { count: vi.fn().mockReturnValue(0), signResponseCount: vi.fn().mockReturnValue(0) } as unknown as DeviceRegistry;
  const provider = { name: 'test', validateConfig: vi.fn().mockResolvedValue(true) } as unknown as IPushProvider;
  return createServer({
    registry,
    provider,
    apiKey: 'test-key',
    version: '1.0.0',
  });
}

describe('CORS middleware', () => {
  it('responds to preflight OPTIONS with CORS headers', async () => {
    const app = makeServer();
    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('includes CORS headers on normal GET requests', async () => {
    const app = makeServer();
    const res = await app.request('/health', {
      headers: { 'Origin': 'http://192.168.0.101:5173' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('allows X-API-Key in Access-Control-Allow-Headers', async () => {
    const app = makeServer();
    const res = await app.request('/devices', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'X-API-Key,Content-Type',
      },
    });
    const allowHeaders = res.headers.get('Access-Control-Allow-Headers') ?? '';
    expect(allowHeaders.toLowerCase()).toContain('x-api-key');
    expect(allowHeaders.toLowerCase()).toContain('content-type');
  });
});
