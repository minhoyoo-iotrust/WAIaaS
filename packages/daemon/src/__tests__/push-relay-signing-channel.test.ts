/**
 * Tests for PushRelaySigningChannel service.
 *
 * Tests cover:
 * 1. sendRequest() POSTs signing request to Push Relay URL with API key header
 * 2. sendRequest() with missing pushRelayUrl throws error but tx stays PENDING_APPROVAL (ERR-01)
 * 3. sendRequest() POST failure logs error, does NOT throw (ERR-01)
 * 4. Long-polling receives sign response -> delegates to SignResponseHandler.handle()
 * 5. Long-polling connection failure retries with exponential backoff (ERR-02)
 * 6. Long-polling max retries exceeded -> subscription cleaned up (ERR-02)
 * 7. cancelSubscription() aborts active long-polling
 * 8. shutdown() aborts all active subscriptions
 *
 * All HTTP calls are mocked with vi.fn() -- no actual Push Relay server.
 *
 * @see packages/daemon/src/services/signing-sdk/channels/push-relay-signing-channel.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SignRequest, SignResponse } from '@waiaas/core';
import { PushRelaySigningChannel } from '../services/signing-sdk/channels/push-relay-signing-channel.js';

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
const pushRelayUrl = 'https://relay.example.com';

const mockSignRequest: SignRequest = {
  version: '1',
  requestId,
  caip2ChainId: 'eip155:1',
  networkName: 'ethereum-mainnet',
  signerAddress: '0xOwnerAddress1234567890abcdef12345678901234',
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
    type: 'push_relay',
    pushRelayUrl,
    requestId,
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

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

function createMockSignRequestBuilder() {
  return {
    buildRequest: vi.fn().mockReturnValue({
      request: mockSignRequest,
      universalLinkUrl: mockUniversalLinkUrl,
      requestTopic: 'dcent',
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
    // push_relay_api_key no longer needed for POST /v1/push
    'signing_sdk.request_expiry_min': '30',
  };
  const store = { ...defaults, ...overrides };
  return {
    get: vi.fn((key: string) => store[key] ?? ''),
    set: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PushRelaySigningChannel', () => {
  let channel: PushRelaySigningChannel;
  let mockBuilder: ReturnType<typeof createMockSignRequestBuilder>;
  let mockHandler: ReturnType<typeof createMockSignResponseHandler>;
  let mockSettings: ReturnType<typeof createMockSettingsService>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    mockBuilder = createMockSignRequestBuilder();
    mockHandler = createMockSignResponseHandler();
    mockSettings = createMockSettingsService();

    channel = new PushRelaySigningChannel({
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
  // Test 1: sendRequest() POSTs to Push Relay with API key
  // -----------------------------------------------------------------------

  it('sends signing request via HTTP POST to Push Relay with API key header', async () => {
    // POST succeeds, long-poll returns 204 then done (we abort via shutdown)
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockResolvedValueOnce({ ok: true, status: 204 }); // GET long-poll (no response)

    const result = await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      amount: '1.5',
      symbol: 'ETH',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Verify POST call
    expect(fetchMock).toHaveBeenCalled();
    const [postUrl, postOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(postUrl).toBe(`${pushRelayUrl}/v1/push`);
    expect(postOpts.method).toBe('POST');
    expect((postOpts.headers as Record<string, string>)['X-Api-Key']).toBeUndefined();
    expect((postOpts.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    const postBody = JSON.parse(postOpts.body as string);
    expect(postBody.subscriptionToken).toBe('dcent');
    expect(postBody.category).toBe('sign_request');
    expect(postBody.payload.universalLinkUrl).toBe(mockUniversalLinkUrl);

    // Decode base64url request payload
    const decodedRequest = JSON.parse(
      Buffer.from(postBody.payload.request, 'base64url').toString('utf-8'),
    );
    expect(decodedRequest.requestId).toBe(requestId);

    // Verify result
    expect(result.requestId).toBe(requestId);
    expect(result.requestTopic).toBe('dcent');
    expect(result.responseTopic).toBe('');
  });

  // -----------------------------------------------------------------------
  // Test 2: sendRequest() with missing pushRelayUrl
  // -----------------------------------------------------------------------

  it('logs error when pushRelayUrl is missing but does NOT throw (ERR-01)', async () => {
    // Build request with empty pushRelayUrl
    const requestWithEmptyUrl = {
      ...mockSignRequest,
      responseChannel: { type: 'push_relay' as const, pushRelayUrl: '', requestId },
    };
    mockBuilder.buildRequest.mockReturnValue({
      request: requestWithEmptyUrl,
      universalLinkUrl: mockUniversalLinkUrl,
      requestTopic: 'dcent',
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Should NOT throw -- transaction stays PENDING_APPROVAL
    expect(result.requestId).toBe(requestId);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[PushRelaySigningChannel]'),
      expect.anything(),
    );
    // fetch should NOT be called (no URL to POST to)
    expect(fetchMock).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Test 3: sendRequest() POST failure logs error, does NOT throw (ERR-01)
  // -----------------------------------------------------------------------

  it('POST failure logs error but does NOT throw (ERR-01)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Should NOT throw
    expect(result.requestId).toBe(requestId);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[PushRelaySigningChannel]'),
      expect.anything(),
    );

    consoleSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Test 4: Long-polling receives sign response -> handle()
  // -----------------------------------------------------------------------

  it('long-polling receives sign response and delegates to SignResponseHandler', async () => {
    const approveResponse = createApproveResponse();
    const encodedResponse = Buffer.from(JSON.stringify(approveResponse), 'utf-8').toString('base64url');

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: encodedResponse }),
      }); // GET long-poll returns response

    await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Wait for async long-polling to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const handledResponse = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(handledResponse.requestId).toBe(requestId);
    expect(handledResponse.action).toBe('approve');
    expect(handledResponse.signature).toBe('0xmocksignature');
  });

  // -----------------------------------------------------------------------
  // Test 5: Long-polling retries with exponential backoff on error (ERR-02)
  // -----------------------------------------------------------------------

  it('retries long-polling with exponential backoff on error', async () => {
    vi.useFakeTimers();

    const approveResponse = createApproveResponse();
    const encodedResponse = Buffer.from(JSON.stringify(approveResponse), 'utf-8').toString('base64url');

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockRejectedValueOnce(new Error('Connection error')) // GET attempt 1: error
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: encodedResponse }),
      }); // GET attempt 2: success

    await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Advance past first backoff (1s)
    await vi.advanceTimersByTimeAsync(1500);

    expect(mockHandler.handle).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 6: Long-polling max retries exceeded -> cleanup (ERR-02)
  // -----------------------------------------------------------------------

  it('cleans up subscription after max error retries exceeded', async () => {
    vi.useFakeTimers();

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockRejectedValueOnce(new Error('error 1'))
      .mockRejectedValueOnce(new Error('error 2'))
      .mockRejectedValueOnce(new Error('error 3'));

    const result = await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Advance timers to allow all retries (1s + 2s + 4s)
    await vi.advanceTimersByTimeAsync(8000);

    // handler.handle should NOT have been called (all retries failed)
    expect(mockHandler.handle).not.toHaveBeenCalled();

    // cancelSubscription should be a no-op (already cleaned up)
    channel.cancelSubscription(result.requestId);

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 7: cancelSubscription() aborts active long-polling
  // -----------------------------------------------------------------------

  it('cancelSubscription aborts active long-polling', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
          }),
      );

    const result = await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Cancel the subscription
    channel.cancelSubscription(result.requestId);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // handler should not have been called
    expect(mockHandler.handle).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Test 8: shutdown() aborts all active subscriptions
  // -----------------------------------------------------------------------

  it('shutdown aborts all active subscriptions', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
          }),
      );

    await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    channel.shutdown();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockHandler.handle).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Test 9: registerRequest is called during sendRequest
  // -----------------------------------------------------------------------

  it('registers request with SignResponseHandler before long-polling', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockResolvedValueOnce({ ok: true, status: 204 }); // GET long-poll

    await channel.sendRequest({
      txId,
      chain: 'ethereum',
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
  // Test 10: Long-polling 204 continues polling (not counted as error retry)
  // -----------------------------------------------------------------------

  it('continues polling on 204 without counting as error retry', async () => {
    const approveResponse = createApproveResponse();
    const encodedResponse = Buffer.from(JSON.stringify(approveResponse), 'utf-8').toString('base64url');

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockResolvedValueOnce({ ok: true, status: 204 }) // GET: 204 (no response yet)
      .mockResolvedValueOnce({ ok: true, status: 204 }) // GET: 204 (no response yet)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: encodedResponse }),
      }); // GET: 200 (response found)

    await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    // Wait for polling to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(mockHandler.handle).toHaveBeenCalledOnce();
    // 1 POST + 3 GET = 4 fetch calls total
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  // -----------------------------------------------------------------------
  // Test 11: POST non-2xx status logs error without throwing
  // -----------------------------------------------------------------------

  it('POST non-2xx logs error without throwing', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await channel.sendRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: '0xabcdef0123456789abcdef0123456789abcdef01',
      policyTier: 'APPROVAL',
      walletId: 'dcent',
    });

    expect(result.requestId).toBe(requestId);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
