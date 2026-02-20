import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { SignRequest, SignResponse } from '@waiaas/core';
import { encodeSignRequest } from '@waiaas/core';
import { sendViaNtfy } from '../channels/ntfy.js';
import { sendViaTelegram } from '../channels/telegram.js';
import { subscribeToRequests } from '../channels/ntfy.js';

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
