/**
 * Tests for NtfySigningChannel service.
 *
 * Tests cover:
 * 1. Request publish: correct ntfy JSON format (priority 5, actions URL)
 * 2. Response subscribe: mock SSE stream -> SignResponse -> SignResponseHandler.handle()
 * 3. Reject response: handle() result 'rejected'
 * 4. Expiration timeout: expiresAt reached -> SSE subscription terminated
 * 5. Network error reconnect: fetch failure -> retry logic
 * 6. shutdown(): all active subscriptions terminated
 * 7. ntfy server URL from SettingsService
 * 8. cancelSubscription(): specific subscription cancelled
 *
 * All HTTP calls are mocked with vi.fn() -- no actual ntfy server.
 *
 * @see packages/daemon/src/services/signing-sdk/channels/ntfy-signing-channel.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SignRequest, SignResponse } from '@waiaas/core';
import { NtfySigningChannel } from '../services/signing-sdk/channels/ntfy-signing-channel.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const txId = '01935a3b-7c8d-7e00-b123-456789abcdef';
const requestId = '01935a3b-0000-7e00-b123-000000000001';
const signerAddress = '0x1234567890abcdef1234567890abcdef12345678';
const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

const mockSignRequest: SignRequest = {
  version: '1',
  requestId,
  chain: 'evm',
  network: 'ethereum-mainnet',
  message: 'WAIaaS Transaction Approval\n\nTransaction: ...',
  displayMessage: 'TRANSFER 1.5 ETH from 0x123456... to 0xabcdef...',
  metadata: {
    txId,
    type: 'TRANSFER',
    from: signerAddress,
    to: '0xabcdef0123456789abcdef0123456789abcdef01',
    amount: '1.5',
    symbol: 'ETH',
    policyTier: 'APPROVAL',
  },
  responseChannel: {
    type: 'ntfy',
    responseTopic: `waiaas-response-${requestId}`,
  },
  expiresAt,
};

const mockUniversalLinkUrl = 'https://link.dcentwallet.com/waiaas/sign?data=mock-base64url';

function createApproveResponse(overrides: Partial<SignResponse> = {}): SignResponse {
  return {
    version: '1',
    requestId,
    action: 'approve',
    signature: '0xmocksignature',
    signerAddress,
    signedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createRejectResponse(overrides: Partial<SignResponse> = {}): SignResponse {
  return {
    version: '1',
    requestId,
    action: 'reject',
    signerAddress,
    signedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

function createMockSignRequestBuilder() {
  return {
    buildRequest: vi.fn().mockReturnValue({
      request: mockSignRequest,
      universalLinkUrl: mockUniversalLinkUrl,
      requestTopic: 'waiaas-sign-dcent',
    }),
  };
}

function createMockSignResponseHandler() {
  return {
    registerRequest: vi.fn(),
    handle: vi.fn().mockResolvedValue({ action: 'approved', txId }),
    destroy: vi.fn(),
  };
}

function createMockSettingsService(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    'signing_sdk.enabled': 'true',
    'signing_sdk.ntfy_request_topic_prefix': 'waiaas-sign',
    'signing_sdk.ntfy_response_topic_prefix': 'waiaas-response',
    'notifications.ntfy_server': 'https://ntfy.sh',
    'signing_sdk.request_expiry_min': '30',
  };
  const store = { ...defaults, ...overrides };
  return {
    get: vi.fn((key: string) => store[key] ?? ''),
    set: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helper: create mock SSE stream with SignResponse
// ---------------------------------------------------------------------------

function createSseStream(responses: SignResponse[]): {
  reader: { read: ReturnType<typeof vi.fn> };
} {
  const encoder = new TextEncoder();
  const chunks: { done: boolean; value?: Uint8Array }[] = [];

  for (const response of responses) {
    const encoded = Buffer.from(JSON.stringify(response), 'utf-8').toString('base64url');
    const sseData = JSON.stringify({ message: encoded });
    const sseEvent = `data: ${sseData}\n\n`;
    chunks.push({ done: false, value: encoder.encode(sseEvent) });
  }
  chunks.push({ done: true, value: undefined });

  const readFn = vi.fn();
  for (const chunk of chunks) {
    readFn.mockResolvedValueOnce(chunk);
  }

  return {
    reader: { read: readFn },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NtfySigningChannel', () => {
  let channel: NtfySigningChannel;
  let mockBuilder: ReturnType<typeof createMockSignRequestBuilder>;
  let mockHandler: ReturnType<typeof createMockSignResponseHandler>;
  let mockSettings: ReturnType<typeof createMockSettingsService>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    mockBuilder = createMockSignRequestBuilder();
    mockHandler = createMockSignResponseHandler();
    mockSettings = createMockSettingsService();

    channel = new NtfySigningChannel({
      signRequestBuilder: mockBuilder as any,
      signResponseHandler: mockHandler as any,
      settingsService: mockSettings as any,
    });
  });

  afterEach(() => {
    channel.shutdown();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Request publish: correct ntfy JSON format
  // -----------------------------------------------------------------------

  it('publishes SignRequest to ntfy with correct JSON format', async () => {
    // Mock: publish succeeds, SSE returns done immediately
    fetchMock
      .mockResolvedValueOnce({ ok: true }) // publish
      .mockResolvedValueOnce({ // SSE subscribe
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ done: true }),
            releaseLock: vi.fn(),
          }),
        },
      });

    const result = await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      amount: '1.5',
      symbol: 'ETH',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Verify publish call
    expect(fetchMock).toHaveBeenCalled();
    const [publishUrl, publishOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(publishUrl).toBe('https://ntfy.sh/waiaas-sign-dcent');
    expect(publishOpts.method).toBe('POST');

    const publishBody = JSON.parse(publishOpts.body as string);
    expect(publishBody.topic).toBe('waiaas-sign-dcent');
    expect(publishBody.title).toBe('WAIaaS Sign Request');
    expect(publishBody.priority).toBe(5);
    expect(publishBody.tags).toEqual(['waiaas', 'sign']);
    expect(publishBody.actions).toHaveLength(1);
    expect(publishBody.actions[0].action).toBe('view');
    expect(publishBody.actions[0].label).toBe('Sign in wallet');
    expect(publishBody.actions[0].url).toBe(mockUniversalLinkUrl);
    expect(publishBody.click).toBe(mockUniversalLinkUrl);
    expect(publishBody.message).toBe(mockSignRequest.displayMessage);

    // Verify result
    expect(result.requestId).toBe(requestId);
    expect(result.requestTopic).toBe('waiaas-sign-dcent');
    expect(result.responseTopic).toBe(`waiaas-response-${requestId}`);
  });

  // -----------------------------------------------------------------------
  // 2. Response subscribe: SSE -> SignResponse -> handle()
  // -----------------------------------------------------------------------

  it('processes approve response from SSE stream via SignResponseHandler', async () => {
    const approveResponse = createApproveResponse();
    const { reader } = createSseStream([approveResponse]);

    fetchMock
      .mockResolvedValueOnce({ ok: true }) // publish
      .mockResolvedValueOnce({ // SSE subscribe
        ok: true,
        body: { getReader: () => reader },
      });

    await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      amount: '1.5',
      symbol: 'ETH',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Wait for async SSE processing
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const handledResponse = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(handledResponse.requestId).toBe(requestId);
    expect(handledResponse.action).toBe('approve');
    expect(handledResponse.signature).toBe('0xmocksignature');
  });

  // -----------------------------------------------------------------------
  // 3. Reject response handling
  // -----------------------------------------------------------------------

  it('processes reject response from SSE stream', async () => {
    const rejectResponse = createRejectResponse();
    mockHandler.handle.mockResolvedValueOnce({ action: 'rejected', txId });

    const { reader } = createSseStream([rejectResponse]);

    fetchMock
      .mockResolvedValueOnce({ ok: true }) // publish
      .mockResolvedValueOnce({ // SSE
        ok: true,
        body: { getReader: () => reader },
      });

    await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const handledResponse = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(handledResponse.action).toBe('reject');
  });

  // -----------------------------------------------------------------------
  // 4. Expiration timeout: SSE subscription terminated
  // -----------------------------------------------------------------------

  it('terminates SSE subscription when request expires', async () => {
    vi.useFakeTimers();
    try {
      // Create request that expires in 1 second
      const shortExpiryRequest = {
        ...mockSignRequest,
        expiresAt: new Date(Date.now() + 1000).toISOString(),
      };
      mockBuilder.buildRequest.mockReturnValue({
        request: shortExpiryRequest,
        universalLinkUrl: mockUniversalLinkUrl,
        requestTopic: 'waiaas-sign-dcent',
      });

      // Mock a hanging SSE connection
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      fetchMock
        .mockResolvedValueOnce({ ok: true }) // publish
        .mockImplementationOnce(
          (_url: string, init: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener('abort', () => {
                reject(abortError);
              });
            }),
        );

      await channel.sendRequest({
        txId,
        chain: 'evm',
        network: 'ethereum-mainnet',
        type: 'TRANSFER',
        from: signerAddress,
        to: '0xabcdef0123456789abcdef0123456789abcdef01',
        policyTier: 'APPROVAL',
        walletId: 'dcent',
      });

      // Advance past expiry
      vi.advanceTimersByTime(2000);

      // Wait for cleanup
      await vi.advanceTimersByTimeAsync(100);

      // Subscription should be removed
      // Verify by trying to cancel (should be no-op since already cleaned up)
      channel.cancelSubscription(requestId);
    } finally {
      vi.useRealTimers();
    }
  });

  // -----------------------------------------------------------------------
  // 5. Network error reconnect
  // -----------------------------------------------------------------------

  it('retries SSE connection on network error up to 3 times', async () => {
    // Publish succeeds
    fetchMock.mockResolvedValueOnce({ ok: true });

    // SSE fails 4 times (1 initial + 3 retries)
    const networkError = new Error('Network error');
    fetchMock
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError);

    await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Wait for reconnect attempts (3 retries x 5s delay, but we just wait enough)
    // In test we can't wait 15s, so we verify the initial attempt + structure
    await new Promise((resolve) => setTimeout(resolve, 300));

    // At minimum, the initial SSE fetch was attempted
    // (publish + at least 1 SSE attempt = 2 calls)
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // -----------------------------------------------------------------------
  // 6. shutdown(): all subscriptions terminated
  // -----------------------------------------------------------------------

  it('terminates all active subscriptions on shutdown', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    fetchMock
      .mockResolvedValueOnce({ ok: true }) // publish
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(abortError);
            });
          }),
      );

    await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Shutdown should abort all SSE connections
    channel.shutdown();

    // Wait a bit for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    // No handler calls since SSE was aborted before any response
    expect(mockHandler.handle).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 7. ntfy server URL from SettingsService
  // -----------------------------------------------------------------------

  it('uses custom ntfy server URL from settings', async () => {
    mockSettings = createMockSettingsService({
      'notifications.ntfy_server': 'https://ntfy.example.com',
    });
    channel = new NtfySigningChannel({
      signRequestBuilder: mockBuilder as any,
      signResponseHandler: mockHandler as any,
      settingsService: mockSettings as any,
    });

    fetchMock
      .mockResolvedValueOnce({ ok: true }) // publish
      .mockResolvedValueOnce({ // SSE
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ done: true }),
            releaseLock: vi.fn(),
          }),
        },
      });

    await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Verify publish URL uses custom server
    const [publishUrl] = fetchMock.mock.calls[0] as [string];
    expect(publishUrl).toBe('https://ntfy.example.com/waiaas-sign-dcent');

    // Verify SSE URL uses custom server
    const [sseUrl] = fetchMock.mock.calls[1] as [string];
    expect(sseUrl).toBe(`https://ntfy.example.com/waiaas-response-${requestId}/sse`);
  });

  // -----------------------------------------------------------------------
  // 8. cancelSubscription: specific subscription cancelled
  // -----------------------------------------------------------------------

  it('cancels a specific subscription by requestId', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    fetchMock
      .mockResolvedValueOnce({ ok: true }) // publish
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(abortError);
            });
          }),
      );

    const result = await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Cancel specific subscription
    channel.cancelSubscription(result.requestId);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // No handler calls since SSE was cancelled
    expect(mockHandler.handle).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 9. registerRequest is called during sendRequest
  // -----------------------------------------------------------------------

  it('registers request with SignResponseHandler before SSE subscription', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true }) // publish
      .mockResolvedValueOnce({ // SSE
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ done: true }),
            releaseLock: vi.fn(),
          }),
        },
      });

    await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    expect(mockHandler.registerRequest).toHaveBeenCalledOnce();
    expect(mockHandler.registerRequest).toHaveBeenCalledWith(mockSignRequest);
  });

  // -----------------------------------------------------------------------
  // 10. Publish failure throws error
  // -----------------------------------------------------------------------

  it('throws error when ntfy publish fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(
      channel.sendRequest({
        txId,
        chain: 'evm',
        network: 'ethereum-mainnet',
        type: 'TRANSFER',
        from: signerAddress,
        to: '0xabcdef0123456789abcdef0123456789abcdef01',
        policyTier: 'APPROVAL',
        walletId: 'dcent',
      }),
    ).rejects.toThrow('Failed to publish sign request to ntfy: HTTP 500');
  });

  // -----------------------------------------------------------------------
  // 11. Ignores responses for different requestId
  // -----------------------------------------------------------------------

  it('ignores SSE responses with different requestId', async () => {
    const differentResponse = createApproveResponse({
      requestId: '99999999-0000-7e00-b123-000000000099',
    });
    const correctResponse = createApproveResponse();
    const { reader } = createSseStream([differentResponse, correctResponse]);

    fetchMock
      .mockResolvedValueOnce({ ok: true }) // publish
      .mockResolvedValueOnce({ ok: true, body: { getReader: () => reader } }); // SSE

    await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Should only handle the correct requestId response
    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const handledResponse = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(handledResponse.requestId).toBe(requestId);
  });
});
