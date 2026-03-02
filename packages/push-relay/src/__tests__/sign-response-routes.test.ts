import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { DeviceRegistry } from '../registry/device-registry.js';
import { createServer } from '../server.js';
import type { IPushProvider } from '../providers/push-provider.js';
import type { NtfySubscriber } from '../subscriber/ntfy-subscriber.js';

const API_KEY = 'test-api-key';
const NTFY_SERVER = 'https://ntfy.example.com';

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
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  tmpDir = join(tmpdir(), `push-relay-sign-resp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  registry = new DeviceRegistry(join(tmpDir, 'test.db'));
  app = createServer({
    registry,
    subscriber: makeMockSubscriber(),
    provider: makeMockProvider(),
    apiKey: API_KEY,
    ntfyServer: NTFY_SERVER,
    signTopicPrefix: 'waiaas-sign',
    notifyTopicPrefix: 'waiaas-notify',
  });

  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true });
  vi.restoreAllMocks();
});

describe('POST /v1/sign-response', () => {
  const validBody = {
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    action: 'approve',
    signature: '0xdeadbeef1234567890abcdef',
    signerAddress: 'So1addr1',
    responseTopic: 'waiaas-response-550e8400-e29b-41d4-a716-446655440000',
  };

  it('relays a valid approve response to ntfy', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const res = await app.request('/v1/sign-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; requestId: string };
    expect(body.status).toBe('relayed');
    expect(body.requestId).toBe(validBody.requestId);

    // Verify ntfy was called with correct URL
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${NTFY_SERVER}/${validBody.responseTopic}`);
    expect(opts.method).toBe('POST');

    // Verify body is base64url-encoded SignResponse
    const decoded = Buffer.from(opts.body as string, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as {
      version: string;
      requestId: string;
      action: string;
      signature: string;
      signerAddress: string;
      signedAt: string;
    };
    expect(parsed.version).toBe('1');
    expect(parsed.requestId).toBe(validBody.requestId);
    expect(parsed.action).toBe('approve');
    expect(parsed.signature).toBe(validBody.signature);
    expect(parsed.signerAddress).toBe(validBody.signerAddress);
    expect(parsed.signedAt).toBeDefined();
  });

  it('relays a reject response without signature', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const res = await app.request('/v1/sign-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: '550e8400-e29b-41d4-a716-446655440000',
        action: 'reject',
        signerAddress: 'So1addr1',
        responseTopic: 'waiaas-response-550e8400-e29b-41d4-a716-446655440000',
      }),
    });

    expect(res.status).toBe(200);

    const decoded = Buffer.from(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
      'base64url',
    ).toString('utf-8');
    const parsed = JSON.parse(decoded) as { action: string; signature?: string };
    expect(parsed.action).toBe('reject');
    expect(parsed.signature).toBeUndefined();
  });

  it('does not require API key (public endpoint)', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const res = await app.request('/v1/sign-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    // No X-API-Key header, should still succeed
    expect(res.status).toBe(200);
  });

  it('returns 400 for missing requestId', async () => {
    const res = await app.request('/v1/sign-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', signerAddress: 'x', responseTopic: 'topic' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid action', async () => {
    const res = await app.request('/v1/sign-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        action: 'invalid',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing responseTopic', async () => {
    const { responseTopic: _, ...bodyWithoutTopic } = validBody;
    const res = await app.request('/v1/sign-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyWithoutTopic),
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 for non-UUID requestId', async () => {
    const res = await app.request('/v1/sign-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        requestId: 'not-a-uuid',
      }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 502 when ntfy fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const res = await app.request('/v1/sign-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Failed to relay response to ntfy');
  });
});
