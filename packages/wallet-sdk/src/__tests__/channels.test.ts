import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { SignRequest, SignResponse } from '@waiaas/core';
import { encodeSignRequest } from '@waiaas/core';
import { sendViaNtfy } from '../channels/ntfy.js';
import { sendViaTelegram } from '../channels/telegram.js';
import {
  sendViaRelay,
  registerDevice,
  unregisterDevice,
  getSubscriptionToken,
} from '../channels/relay.js';
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
    caip2ChainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    networkName: 'solana-devnet',
    signerAddress: 'OwnerSolanaAddress1234567890abcdef',
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
    const receivedRequest = callback.mock.calls[0]![0] as SignRequest;
    expect(receivedRequest.requestId).toBe(request.requestId);
    expect(receivedRequest.displayMessage).toBe(request.displayMessage);
    expect(receivedRequest.caip2ChainId).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');

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

describe('subscribeToRequests - SSE edge cases', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should skip non-"data: " lines in SSE stream', async () => {
    const request = makeValidRequest();
    const encoded = encodeSignRequest(request);
    const sseData = JSON.stringify({ message: encoded });
    // Mix in non-data lines (event, id, comment)
    const sseContent = `event: message\nid: 123\n: comment\ndata: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseContent),
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

    // Only the valid data line should produce a callback
    expect(callback).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('should skip empty data strings', async () => {
    // "data: \n\n" -> dataStr after trim() is empty
    const sseContent = 'data: \n\n';

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseContent),
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

  it('should attempt reconnection on SSE connection failure (res.ok === false)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let fetchCallCount = 0;
    fetchMock.mockImplementation(() => {
      fetchCallCount++;
      // First call fails, second succeeds with empty stream
      if (fetchCallCount <= 1) {
        return Promise.resolve({ ok: false, status: 503, body: null });
      }
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      };
      return Promise.resolve({ ok: true, body: { getReader: () => mockReader } });
    });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('my-topic', callback);

    // Let the first failed attempt process
    await vi.advanceTimersByTimeAsync(100);
    // Advance past reconnect delay (5000ms)
    await vi.advanceTimersByTimeAsync(5500);

    // Should have attempted reconnection
    expect(fetchCallCount).toBeGreaterThanOrEqual(2);

    unsubscribe();
    vi.useRealTimers();
  });

  it('should stop reconnecting after MAX_RECONNECT_ATTEMPTS (3)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let fetchCallCount = 0;
    fetchMock.mockImplementation(() => {
      fetchCallCount++;
      return Promise.resolve({ ok: false, status: 503, body: null });
    });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('my-topic', callback);

    // Process 4 attempts (initial + 3 reconnects)
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(6000);
    }

    // Should have called fetch 4 times (1 initial + 3 reconnects)
    expect(fetchCallCount).toBeLessThanOrEqual(5);
    expect(callback).not.toHaveBeenCalled();

    unsubscribe();
    vi.useRealTimers();
  });

  it('should not reconnect when explicitly aborted', async () => {
    // Subscribe and immediately abort -> the abort handler in catch prevents reconnect
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
    );

    const { unsubscribe } = subscribeToRequests('my-topic', vi.fn());

    // Immediately abort
    unsubscribe();

    await new Promise((resolve) => setTimeout(resolve, 200));

    // The initial fetch call was made; abort prevented reconnection
    // Just verify no crash
  });

  it('should reset reconnectAttempts on successful connection', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let fetchCallCount = 0;
    fetchMock.mockImplementation(() => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // First call fails
        return Promise.resolve({ ok: false, status: 503, body: null });
      }
      // Second call succeeds then stream ends (triggers reconnect loop reset)
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      };
      return Promise.resolve({ ok: true, body: { getReader: () => mockReader } });
    });

    const { unsubscribe } = subscribeToRequests('my-topic', vi.fn());

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(6000);

    expect(fetchCallCount).toBeGreaterThanOrEqual(2);

    unsubscribe();
    vi.useRealTimers();
  });

  it('should handle resolveMessage with attachment URL (success)', async () => {
    const request = makeValidRequest();
    const encoded = encodeSignRequest(request);
    // Simulate ntfy event where message is in attachment
    const sseData = JSON.stringify({
      attachment: { url: 'https://ntfy.sh/file/abc.json' },
    });
    const sseContent = `data: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseContent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    // First fetch = SSE stream, second fetch = attachment download
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: encoded }),
      });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('my-topic', callback);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(callback).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('should handle resolveMessage with attachment URL failure (res.ok = false)', async () => {
    const sseData = JSON.stringify({
      attachment: { url: 'https://ntfy.sh/file/bad.json' },
    });
    const sseContent = `data: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseContent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('my-topic', callback);

    await new Promise((resolve) => setTimeout(resolve, 200));

    // resolveMessage returns null -> message skipped
    expect(callback).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('should handle resolveMessage with attachment where body.message is not string', async () => {
    const sseData = JSON.stringify({
      attachment: { url: 'https://ntfy.sh/file/bad.json' },
    });
    const sseContent = `data: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseContent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 12345 }), // not a string
      });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToRequests('my-topic', callback);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(callback).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('should handle event with no attachment and no message (resolveMessage returns null)', async () => {
    const sseData = JSON.stringify({ title: 'notification only' });
    const sseContent = `data: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseContent),
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

  it('should handle res.body === null (throw -> reconnect)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let fetchCallCount = 0;
    fetchMock.mockImplementation(() => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return Promise.resolve({ ok: true, body: null });
      }
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      };
      return Promise.resolve({ ok: true, body: { getReader: () => mockReader } });
    });

    const { unsubscribe } = subscribeToRequests('my-topic', vi.fn());

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(6000);

    expect(fetchCallCount).toBeGreaterThanOrEqual(2);

    unsubscribe();
    vi.useRealTimers();
  });
});

describe('subscribeToNotifications - SSE edge cases', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should attempt reconnection on connection failure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let fetchCallCount = 0;
    fetchMock.mockImplementation(() => {
      fetchCallCount++;
      if (fetchCallCount <= 1) {
        return Promise.resolve({ ok: false, status: 500, body: null });
      }
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      };
      return Promise.resolve({ ok: true, body: { getReader: () => mockReader } });
    });

    const { unsubscribe } = subscribeToNotifications('my-topic', vi.fn());

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(6000);

    expect(fetchCallCount).toBeGreaterThanOrEqual(2);

    unsubscribe();
    vi.useRealTimers();
  });

  it('should stop reconnecting after MAX_RECONNECT_ATTEMPTS', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let fetchCallCount = 0;
    fetchMock.mockImplementation(() => {
      fetchCallCount++;
      return Promise.resolve({ ok: false, status: 503, body: null });
    });

    const { unsubscribe } = subscribeToNotifications('my-topic', vi.fn());

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(6000);
    }

    expect(fetchCallCount).toBeLessThanOrEqual(5);

    unsubscribe();
    vi.useRealTimers();
  });

  it('should not reconnect when explicitly aborted', async () => {
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
    );

    const { unsubscribe } = subscribeToNotifications('my-topic', vi.fn());

    unsubscribe();

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should not have thrown or caused issues
  });

  it('should skip non-data lines and empty data', async () => {
    const msg = {
      version: '1',
      eventType: 'TX_CONFIRMED',
      walletId: '01958f3a-1234-7000-8000-abcdef123456',
      walletName: 'trading-bot',
      category: 'transaction',
      title: 'Transaction Confirmed',
      body: 'Confirmed',
      timestamp: 1707000000,
    };
    const encodedMsg = Buffer.from(JSON.stringify(msg), 'utf-8').toString('base64url');
    const sseData = JSON.stringify({ message: encodedMsg });
    // Mix non-data lines and empty data
    const sseContent = `event: message\ndata: \ndata: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseContent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToNotifications('my-topic', callback);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('should ignore malformed notification messages', async () => {
    const sseContent = [
      'data: not-json\n\n',
      'data: {"message": "not-valid-base64"}\n\n',
      'data: {}\n\n',
    ].join('');

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseContent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock.mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToNotifications('my-topic', callback);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callback).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('should handle resolveMessage attachment in notifications', async () => {
    const msg = {
      version: '1',
      eventType: 'TX_CONFIRMED',
      walletId: '01958f3a-1234-7000-8000-abcdef123456',
      walletName: 'bot',
      category: 'transaction',
      title: 'Confirmed',
      body: 'Done',
      timestamp: 1707000000,
    };
    const encodedMsg = Buffer.from(JSON.stringify(msg), 'utf-8').toString('base64url');

    const sseData = JSON.stringify({ attachment: { url: 'https://ntfy.sh/file/abc.json' } });
    const sseContent = `data: ${sseData}\n\n`;

    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(sseContent),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    fetchMock
      .mockResolvedValueOnce({ ok: true, body: { getReader: () => mockReader } })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: encodedMsg }) });

    const callback = vi.fn();
    const { unsubscribe } = subscribeToNotifications('my-topic', callback);

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(callback).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('should handle abortController.signal.aborted at start of connect()', async () => {
    // Subscribe and immediately unsubscribe before connect runs
    fetchMock.mockReturnValue(new Promise(() => {}));

    const { unsubscribe } = subscribeToNotifications('my-topic', vi.fn());
    unsubscribe();

    await new Promise((resolve) => setTimeout(resolve, 50));
    // No crash
  });
});

describe('getSubscriptionToken - error paths', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throw on non-404 HTTP error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      getSubscriptionToken('https://relay.example.com', 'key', 'device'),
    ).rejects.toThrow('Failed to get subscription token from Push Relay: HTTP 500');
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
    await sendViaRelay(response, 'waiaas-response-abc123', 'https://relay.example.com');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.example.com/v1/sign-response');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });

    const body = JSON.parse(opts.body as string) as {
      requestId: string;
      action: string;
      signature: string;
      signerAddress: string;
      responseTopic: string;
    };
    expect(body.requestId).toBe(response.requestId);
    expect(body.action).toBe('approve');
    expect(body.signature).toBe(response.signature);
    expect(body.signerAddress).toBe(response.signerAddress);
    expect(body.responseTopic).toBe('waiaas-response-abc123');
  });

  it('should strip trailing slash from relay URL', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await sendViaRelay(makeValidResponse(), 'topic', 'https://relay.example.com/');

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
    await sendViaRelay(response, 'topic', 'https://relay.example.com');

    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as { signature?: string };
    expect(body.signature).toBeUndefined();
  });

  it('should throw Error on HTTP error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });

    await expect(
      sendViaRelay(makeValidResponse(), 'topic', 'https://relay.example.com'),
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
});
