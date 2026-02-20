import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { DeviceRegistry } from '../registry/device-registry.js';
import { createServer } from '../server.js';
import type { IPushProvider } from '../providers/push-provider.js';
import type { NtfySubscriber } from '../subscriber/ntfy-subscriber.js';

const API_KEY = 'test-api-key';

function makeMockProvider(): IPushProvider {
  return {
    name: 'mock',
    send: vi.fn().mockResolvedValue({ sent: 0, failed: 0, invalidTokens: [] }),
    validateConfig: vi.fn().mockResolvedValue(true),
  };
}

function makeMockSubscriber(): NtfySubscriber {
  return { connected: true, topicCount: 2 } as unknown as NtfySubscriber;
}

let registry: DeviceRegistry;
let tmpDir: string;
let app: ReturnType<typeof createServer>;

beforeEach(() => {
  tmpDir = join(tmpdir(), `push-relay-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  registry = new DeviceRegistry(join(tmpDir, 'test.db'));
  app = createServer({
    registry,
    subscriber: makeMockSubscriber(),
    provider: makeMockProvider(),
    apiKey: API_KEY,
  });
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true });
});

describe('POST /devices', () => {
  it('registers a device token with valid request', async () => {
    const res = await app.request('/devices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        walletName: 'dcent',
        pushToken: 'test-token-123',
        platform: 'ios',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('registered');
    expect(registry.count()).toBe(1);
  });

  it('rejects invalid platform', async () => {
    const res = await app.request('/devices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({
        walletName: 'dcent',
        pushToken: 'test-token',
        platform: 'windows',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects missing fields', async () => {
    const res = await app.request('/devices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify({ walletName: 'dcent' }),
    });

    expect(res.status).toBe(400);
  });

  it('rejects request without API key', async () => {
    const res = await app.request('/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletName: 'dcent',
        pushToken: 'token',
        platform: 'ios',
      }),
    });

    expect(res.status).toBe(401);
  });

  it('rejects request with wrong API key', async () => {
    const res = await app.request('/devices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'wrong-key',
      },
      body: JSON.stringify({
        walletName: 'dcent',
        pushToken: 'token',
        platform: 'ios',
      }),
    });

    expect(res.status).toBe(401);
  });
});

describe('DELETE /devices/:token', () => {
  it('removes an existing device token', async () => {
    registry.register('dcent', 'token-to-delete', 'ios');

    const res = await app.request('/devices/token-to-delete', {
      method: 'DELETE',
      headers: { 'X-API-Key': API_KEY },
    });

    expect(res.status).toBe(204);
    expect(registry.count()).toBe(0);
  });

  it('returns 404 for non-existent token', async () => {
    const res = await app.request('/devices/nonexistent', {
      method: 'DELETE',
      headers: { 'X-API-Key': API_KEY },
    });

    expect(res.status).toBe(404);
  });
});

describe('GET /health', () => {
  it('returns health status without auth', async () => {
    registry.register('dcent', 'token-1', 'ios');

    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      status: string;
      ntfy: { connected: boolean; topics: number };
      push: { provider: string; configured: boolean };
      devices: number;
    };
    expect(body.status).toBe('ok');
    expect(body.ntfy.connected).toBe(true);
    expect(body.ntfy.topics).toBe(2);
    expect(body.push.provider).toBe('mock');
    expect(body.push.configured).toBe(true);
    expect(body.devices).toBe(1);
  });
});
