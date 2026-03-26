import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { SignResponse } from '@waiaas/core';
import { sendViaTelegram } from '../channels/telegram.js';
import {
  sendViaRelay,
  registerDevice,
  unregisterDevice,
  getSubscriptionToken,
} from '../channels/relay.js';

function makeValidResponse(): SignResponse {
  return {
    version: '1',
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    action: 'approve',
    signature: '0xdeadbeef1234567890abcdef',
    signerAddress: 'So1addr1',
    signedAt: '2026-06-15T12:00:00.000Z',
  };
}

describe('sendViaTelegram', () => {
  it('should generate correct https://t.me URL with botUsername', () => {
    const response = makeValidResponse();
    const url = sendViaTelegram(response, 'waiaas_bot');

    expect(url).toMatch(/^https:\/\/t\.me\/waiaas_bot\?text=/);
  });

  it('should include /sign_response and base64url-encoded SignResponse in URL', () => {
    const response = makeValidResponse();
    const url = sendViaTelegram(response, 'waiaas_bot');

    // Decode the text parameter
    const textParam = decodeURIComponent(url.split('?text=')[1]!);
    expect(textParam).toMatch(/^\/sign_response /);

    // Extract and verify the encoded part
    const encoded = textParam.replace('/sign_response ', '');
    const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as SignResponse;
    expect(parsed.requestId).toBe(response.requestId);
    expect(parsed.action).toBe('approve');
    expect(parsed.signature).toBe('0xdeadbeef1234567890abcdef');
  });
});

describe('sendViaRelay', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should POST SignResponse to Push Relay /v1/sign-response endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const response = makeValidResponse();
    await sendViaRelay(response, 'https://relay.example.com', 'test-api-key');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/v1/sign-response');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json', 'X-API-Key': 'test-api-key' });

    const body = JSON.parse(opts.body as string) as {
      requestId: string;
      action: string;
      signature: string;
      signerAddress: string;
    };
    expect(body.requestId).toBe(response.requestId);
    expect(body.action).toBe('approve');
    expect(body.signature).toBe(response.signature);
    expect(body.signerAddress).toBe(response.signerAddress);
    expect(body).not.toHaveProperty('responseTopic');
  });

  it('should strip trailing slash from relay URL', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await sendViaRelay(makeValidResponse(), 'https://relay.example.com/', 'test-api-key');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://relay.example.com/v1/sign-response');
  });

  it('should omit signature for reject action', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const response: SignResponse = {
      ...makeValidResponse(),
      action: 'reject',
      signature: undefined,
    };
    await sendViaRelay(response, 'https://relay.example.com', 'test-api-key');

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as { signature?: string };
    expect(body.signature).toBeUndefined();
  });

  it('should throw Error on HTTP error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });

    await expect(
      sendViaRelay(makeValidResponse(), 'https://relay.example.com', 'test-api-key'),
    ).rejects.toThrow('Failed to send response via Push Relay: HTTP 502');
  });
});

describe('registerDevice', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should POST device info and return subscriptionToken', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ subscription_token: 'sub-tok-abc' }),
    });

    const result = await registerDevice(
      'https://relay.example.com',
      'my-api-key',
      { walletName: 'my-wallet', pushToken: 'device-token-123', platform: 'android' },
    );

    expect(result).toEqual({ subscriptionToken: 'sub-tok-abc' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/devices');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toEqual({
      'Content-Type': 'application/json',
      'X-API-Key': 'my-api-key',
    });
    const body = JSON.parse(opts.body as string) as {
      pushToken: string;
      walletName: string;
      platform: string;
    };
    expect(body.pushToken).toBe('device-token-123');
    expect(body.walletName).toBe('my-wallet');
    expect(body.platform).toBe('android');
  });

  it('should strip trailing slash from relay URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ subscription_token: 'tok' }),
    });

    await registerDevice(
      'https://relay.example.com/',
      'key',
      { walletName: 'w', pushToken: 'pt', platform: 'ios' },
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://relay.example.com/devices');
  });

  it('should throw on HTTP error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400 });

    await expect(
      registerDevice('https://relay.example.com', 'key', {
        walletName: 'w',
        pushToken: 'pt',
        platform: 'android',
      }),
    ).rejects.toThrow('Failed to register device with Push Relay: HTTP 400');
  });
});

describe('unregisterDevice', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send DELETE and resolve on 204', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });

    await unregisterDevice('https://relay.example.com', 'my-key', 'device-token-123');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/devices/device-token-123');
    expect(opts.method).toBe('DELETE');
    expect(opts.headers).toEqual({ 'X-API-Key': 'my-key' });
  });

  it('should throw on 404 (unknown token)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      unregisterDevice('https://relay.example.com', 'key', 'unknown-token'),
    ).rejects.toThrow('Failed to unregister device from Push Relay: HTTP 404');
  });
});

describe('getSubscriptionToken', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return subscription token on 200', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ subscription_token: 'sub-tok-xyz' }),
    });

    const token = await getSubscriptionToken(
      'https://relay.example.com',
      'my-key',
      'device-token-123',
    );

    expect(token).toBe('sub-tok-xyz');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/devices/device-token-123/subscription-token');
    expect(opts.method).toBe('GET');
    expect(opts.headers).toEqual({ 'X-API-Key': 'my-key' });
  });

  it('should return null on 404 (unregistered device)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const token = await getSubscriptionToken(
      'https://relay.example.com',
      'key',
      'unknown-device',
    );

    expect(token).toBeNull();
  });

  it('should throw on non-404 HTTP error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      getSubscriptionToken('https://relay.example.com', 'key', 'device'),
    ).rejects.toThrow('Failed to get subscription token from Push Relay: HTTP 500');
  });
});
