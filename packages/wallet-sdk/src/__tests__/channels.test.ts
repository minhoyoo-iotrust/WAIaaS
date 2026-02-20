import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { SignRequest, SignResponse } from '@waiaas/core';
import { encodeSignRequest } from '@waiaas/core';
import { sendViaNtfy } from '../channels/ntfy.js';
import { sendViaTelegram } from '../channels/telegram.js';
import { subscribeToRequests } from '../channels/ntfy.js';
import {
  parseNotification,
  subscribeToNotifications,
} from '../channels/ntfy.js';

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

function makeValidRequest(overrides?: Partial<SignRequest>): SignRequest {
  return {
    version: '1',
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    chain: 'solana',
    network: 'devnet',
    message: 'SGVsbG8gV29ybGQ=',
    displayMessage: 'Transfer 1 SOL',
    metadata: {
      txId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'TRANSFER',
      from: 'So1addr1',
      to: 'So1addr2',
      amount: '1.0',
      symbol: 'SOL',
      policyTier: 'APPROVAL',
    },
    responseChannel: {
      type: 'ntfy',
      responseTopic: 'waiaas-resp-abc123',
    },
    expiresAt: new Date(Date.now() + 600_000).toISOString(), // 10 min from now
    ...overrides,
  };
}

describe('sendViaNtfy', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should POST base64url-encoded SignResponse to correct ntfy URL', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    const response = makeValidResponse();
    await sendViaNtfy(response, 'waiaas-resp-abc123', 'https://ntfy.sh');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ntfy.sh/waiaas-resp-abc123');
    expect(options.method).toBe('POST');

    // Verify body is base64url-encoded SignResponse
    const decoded = Buffer.from(options.body as string, 'base64url').toString(
      'utf-8',
    );
    const parsed = JSON.parse(decoded) as SignResponse;
    expect(parsed.requestId).toBe(response.requestId);
    expect(parsed.action).toBe('approve');
  });

  it('should use default server URL when not specified', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await sendViaNtfy(makeValidResponse(), 'my-topic');

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://ntfy.sh/my-topic');
  });

  it('should throw Error on HTTP error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      sendViaNtfy(makeValidResponse(), 'my-topic'),
    ).rejects.toThrow('Failed to send response to ntfy: HTTP 500');
  });
});

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

describe('subscribeToRequests', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call callback when valid SignRequest received via SSE', async () => {
    const request = makeValidRequest();
    const encoded = encodeSignRequest(request);
    const sseData = JSON.stringify({ message: encoded });
    const sseEvent = `data: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseEvent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('my-topic', callback);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(request);

    unsubscribe();
  });

  it('should not call callback for expired requests', async () => {
    const expiredRequest = makeValidRequest({
      expiresAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
    });
    const encoded = encodeSignRequest(expiredRequest);
    const sseData = JSON.stringify({ message: encoded });
    const sseEvent = `data: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseEvent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('my-topic', callback);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('should close SSE connection when unsubscribe is called', async () => {
    // Create a reader that hangs indefinitely until aborted
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(abortError);
          });
        }),
    );

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('my-topic', callback);

    // Unsubscribe immediately
    unsubscribe();

    // Wait a bit and verify no callback
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(callback).not.toHaveBeenCalled();
  });

  it('should connect to correct SSE URL', async () => {
    const mockReader = {
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const { unsubscribe } = subscribeToRequests(
      'my-topic',
      vi.fn(),
      'https://custom.ntfy.sh',
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom.ntfy.sh/my-topic/sse',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    unsubscribe();
  });

  it('parses daemon base64url-encoded SignRequest in message field (ENCODE-03 compatibility)', async () => {
    // Simulates the new daemon publish format: message = base64url(SignRequest)
    const request = makeValidRequest();
    const encoded = Buffer.from(JSON.stringify(request), 'utf-8').toString('base64url');
    const sseData = JSON.stringify({ message: encoded });
    const sseEvent = `data: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseEvent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('waiaas-sign-dcent', callback);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).toHaveBeenCalledOnce();
    const receivedRequest = callback.mock.calls[0][0] as SignRequest;
    expect(receivedRequest.requestId).toBe(request.requestId);
    expect(receivedRequest.displayMessage).toBe(request.displayMessage);
    expect(receivedRequest.chain).toBe('solana');

    unsubscribe();
  });

  it('should ignore malformed SSE messages', async () => {
    const sseEvents = [
      'data: not-json\n\n',
      'data: {"message": "not-base64url!!!"}\n\n',
      'data: {}\n\n',
    ].join('');

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseEvents),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('my-topic', callback);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).not.toHaveBeenCalled();

    unsubscribe();
  });
});

describe('parseNotification', () => {
  it('decodes a valid base64url NotificationMessage', () => {
    const msg = {
      version: '1',
      eventType: 'TX_CONFIRMED',
      walletId: '01958f3a-1234-7000-8000-abcdef123456',
      walletName: 'trading-bot',
      category: 'transaction',
      title: 'Transaction Confirmed',
      body: 'Your transaction was confirmed on-chain',
      timestamp: 1707000000,
    };
    const encoded = Buffer.from(JSON.stringify(msg), 'utf-8').toString(
      'base64url',
    );
    const result = parseNotification(encoded);
    expect(result.version).toBe('1');
    expect(result.eventType).toBe('TX_CONFIRMED');
    expect(result.walletName).toBe('trading-bot');
    expect(result.category).toBe('transaction');
  });

  it('throws on invalid base64url', () => {
    expect(() => parseNotification('!!!invalid!!!')).toThrow();
  });

  it('throws on valid base64url but invalid JSON', () => {
    const encoded = Buffer.from('not-json', 'utf-8').toString('base64url');
    expect(() => parseNotification(encoded)).toThrow();
  });

  it('throws on valid JSON but schema mismatch', () => {
    const encoded = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf-8').toString(
      'base64url',
    );
    expect(() => parseNotification(encoded)).toThrow();
  });

  it('accepts optional details field', () => {
    const msg = {
      version: '1',
      eventType: 'KILL_SWITCH_ACTIVATED',
      walletId: '01958f3a-0000-7000-8000-000000000000',
      walletName: 'main-wallet',
      category: 'security_alert',
      title: 'Kill Switch',
      body: 'Kill switch was activated',
      details: { triggeredBy: 'admin' },
      timestamp: 1707000000,
    };
    const encoded = Buffer.from(JSON.stringify(msg), 'utf-8').toString(
      'base64url',
    );
    const result = parseNotification(encoded);
    expect(result.details).toEqual({ triggeredBy: 'admin' });
  });
});

describe('subscribeToNotifications', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an object with unsubscribe method', () => {
    // Mock fetch to return a never-resolving stream
    fetchMock.mockReturnValue(new Promise(() => {}));

    const sub = subscribeToNotifications('test-topic', () => {});
    expect(sub).toHaveProperty('unsubscribe');
    expect(typeof sub.unsubscribe).toBe('function');
    sub.unsubscribe();
  });

  it('calls fetch with correct SSE URL', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));

    const sub = subscribeToNotifications(
      'my-topic',
      () => {},
      'https://custom.ntfy.sh',
    );
    // Give event loop time
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom.ntfy.sh/my-topic/sse',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    sub.unsubscribe();
  });

  it('should call callback when valid NotificationMessage received via SSE', async () => {
    const msg = {
      version: '1',
      eventType: 'TX_CONFIRMED',
      walletId: '01958f3a-1234-7000-8000-abcdef123456',
      walletName: 'trading-bot',
      category: 'transaction',
      title: 'Transaction Confirmed',
      body: 'Your transaction was confirmed on-chain',
      timestamp: 1707000000,
    };
    const encodedMsg = Buffer.from(JSON.stringify(msg), 'utf-8').toString(
      'base64url',
    );
    const sseData = JSON.stringify({ message: encodedMsg });
    const sseEvent = `data: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseEvent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToNotifications('my-topic', callback);

    // Wait for async processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        version: '1',
        eventType: 'TX_CONFIRMED',
        walletName: 'trading-bot',
      }),
    );

    unsubscribe();
  });
});
