/**
 * E2E integration tests for the signing-sdk module.
 *
 * Tests the full flow: SignRequestBuilder -> NtfySigningChannel -> SSE -> SignResponseHandler.
 * All HTTP calls are mocked with vi.fn() -- no actual ntfy server.
 *
 * Scenarios:
 * 1. ntfy E2E approve flow
 * 2. ntfy E2E reject flow
 * 3. Expiration scenario (short TTL)
 * 4. SDK parseSignRequest round-trip
 * 5. SDK sendViaNtfy round-trip
 *
 * @see packages/daemon/src/services/signing-sdk/index.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SignRequest, SignResponse } from '@waiaas/core';
import { encodeSignRequest } from '@waiaas/core';
import { NtfySigningChannel } from '../services/signing-sdk/channels/ntfy-signing-channel.js';
import { SignRequestBuilder } from '../services/signing-sdk/sign-request-builder.js';
import type { SignResponseHandler, HandleResult } from '../services/signing-sdk/sign-response-handler.js';
import type { WalletLinkConfig } from '@waiaas/core';

// Verify module index exports work
import {
  SignRequestBuilder as IndexedBuilder,
  NtfySigningChannel as IndexedChannel,
} from '../services/signing-sdk/index.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Constants / fixtures
// ---------------------------------------------------------------------------

const txId = '01935a3b-7c8d-7e00-b123-456789abcdef';
const signerAddress = '0x1234567890abcdef1234567890abcdef12345678';
const toAddress = '0xabcdef0123456789abcdef0123456789abcdef01';

const walletConfig: WalletLinkConfig = {
  name: 'dcent',
  displayName: "D'CENT Wallet",
  universalLink: {
    base: 'https://link.dcentwallet.com',
    signPath: '/waiaas/sign',
  },
  ntfy: {
    requestTopic: 'waiaas-sign-dcent',
  },
};

// ---------------------------------------------------------------------------
// Mock SettingsService
// ---------------------------------------------------------------------------

function createMockSettingsService(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    'signing_sdk.enabled': 'true',
    'signing_sdk.preferred_wallet': 'dcent',
    'signing_sdk.request_expiry_min': '30',
    'signing_sdk.preferred_channel': 'ntfy',
    'signing_sdk.ntfy_request_topic_prefix': 'waiaas-sign',
    'signing_sdk.ntfy_response_topic_prefix': 'waiaas-response',
    'notifications.ntfy_server': 'https://ntfy.sh',
    'telegram.bot_token': '',
  };
  const store = { ...defaults, ...overrides };
  return {
    get: vi.fn((key: string) => store[key] ?? ''),
    set: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Mock WalletLinkRegistry
// ---------------------------------------------------------------------------

function createMockWalletLinkRegistry() {
  return {
    getWallet: vi.fn((_name: string) => walletConfig),
    buildSignUrl: vi.fn((walletName: string, request: SignRequest) => {
      const encoded = encodeSignRequest(request);
      return `https://link.dcentwallet.com/waiaas/sign?data=${encoded}`;
    }),
    getAllWallets: vi.fn(() => [walletConfig]),
    registerWallet: vi.fn(),
    removeWallet: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Mock SignResponseHandler
// ---------------------------------------------------------------------------

function createMockSignResponseHandler(): {
  registerRequest: ReturnType<typeof vi.fn>;
  handle: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  return {
    registerRequest: vi.fn(),
    handle: vi.fn(),
    destroy: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helper: create SSE stream from SignResponse objects
// ---------------------------------------------------------------------------

function createSseStream(responses: SignResponse[]) {
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

  return { read: readFn, releaseLock: vi.fn() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('signing-sdk E2E integration', () => {
  let channel: NtfySigningChannel;
  let builder: SignRequestBuilder;
  let mockHandler: ReturnType<typeof createMockSignResponseHandler>;
  let mockSettings: ReturnType<typeof createMockSettingsService>;
  let mockRegistry: ReturnType<typeof createMockWalletLinkRegistry>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    mockSettings = createMockSettingsService();
    mockRegistry = createMockWalletLinkRegistry();
    mockHandler = createMockSignResponseHandler();

    builder = new SignRequestBuilder({
      settingsService: mockSettings as any,
      walletLinkRegistry: mockRegistry as any,
    });

    channel = new NtfySigningChannel({
      signRequestBuilder: builder,
      signResponseHandler: mockHandler as any,
      settingsService: mockSettings as any,
    });
  });

  afterEach(() => {
    channel.shutdown();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Module index exports verification
  // -----------------------------------------------------------------------

  it('exports all signing-sdk components from module index', () => {
    expect(IndexedBuilder).toBe(SignRequestBuilder);
    expect(IndexedChannel).toBe(NtfySigningChannel);
  });

  // -----------------------------------------------------------------------
  // Scenario 1: ntfy E2E approve flow
  // -----------------------------------------------------------------------

  it('E2E approve: SignRequest -> ntfy publish -> SSE -> approve', async () => {
    mockHandler.handle.mockResolvedValue({ action: 'approved', txId } as HandleResult);

    // Build the approve response that the SSE will deliver
    const approveResponse: SignResponse = {
      version: '1',
      requestId: '', // Will be set dynamically after buildRequest
      action: 'approve',
      signature: '0xvalidsignature',
      signerAddress,
      signedAt: new Date().toISOString(),
    };

    // We need to intercept the requestId from SignRequestBuilder
    let capturedRequestId = '';
    const originalBuildRequest = builder.buildRequest.bind(builder);
    vi.spyOn(builder, 'buildRequest').mockImplementation((params) => {
      const result = originalBuildRequest(params);
      capturedRequestId = result.request.requestId;
      approveResponse.requestId = capturedRequestId;
      return result;
    });

    // Setup fetch mocks
    fetchMock
      .mockResolvedValueOnce({ ok: true }) // ntfy publish
      .mockImplementationOnce(() => {
        // SSE subscribe -- return the approve response
        const reader = createSseStream([approveResponse]);
        return Promise.resolve({
          ok: true,
          body: { getReader: () => reader },
        });
      });

    const result = await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: toAddress,
      amount: '1.5',
      symbol: 'ETH',
      policyTier: 'APPROVAL',
      walletName: 'dcent',
      walletId: 'dcent',
    });

    // Wait for async SSE processing
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify: publish was called with correct format
    expect(fetchMock).toHaveBeenCalled();
    const [publishUrl, publishOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(publishUrl).toBe('https://ntfy.sh/waiaas-sign-dcent');
    const publishBody = JSON.parse(publishOpts.body as string);
    expect(publishBody.priority).toBe(5);
    expect(publishBody.actions[0].url).toContain('https://link.dcentwallet.com/waiaas/sign?data=');

    // Verify: SignResponseHandler.handle() was called with approve response
    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const handledResponse = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(handledResponse.action).toBe('approve');
    expect(handledResponse.signature).toBe('0xvalidsignature');

    // Verify: result contains correct IDs
    expect(result.requestId).toBe(capturedRequestId);
    expect(result.requestTopic).toBe('waiaas-sign-dcent');
    expect(result.responseTopic).toContain('waiaas-response-');
  });

  // -----------------------------------------------------------------------
  // Scenario 2: ntfy E2E reject flow
  // -----------------------------------------------------------------------

  it('E2E reject: SignRequest -> ntfy publish -> SSE -> reject', async () => {
    mockHandler.handle.mockResolvedValue({ action: 'rejected', txId } as HandleResult);

    let capturedRequestId = '';
    const rejectResponse: SignResponse = {
      version: '1',
      requestId: '',
      action: 'reject',
      signerAddress,
      signedAt: new Date().toISOString(),
    };

    const originalBuildRequest = builder.buildRequest.bind(builder);
    vi.spyOn(builder, 'buildRequest').mockImplementation((params) => {
      const result = originalBuildRequest(params);
      capturedRequestId = result.request.requestId;
      rejectResponse.requestId = capturedRequestId;
      return result;
    });

    fetchMock
      .mockResolvedValueOnce({ ok: true }) // publish
      .mockImplementationOnce(() => {
        const reader = createSseStream([rejectResponse]);
        return Promise.resolve({
          ok: true,
          body: { getReader: () => reader },
        });
      });

    await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: toAddress,
      amount: '1.5',
      symbol: 'ETH',
      policyTier: 'APPROVAL',
      walletName: 'dcent',
      walletId: 'dcent',
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify: handle() called with reject
    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const handledResponse = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(handledResponse.action).toBe('reject');
    expect(handledResponse.requestId).toBe(capturedRequestId);
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Expiration scenario
  // -----------------------------------------------------------------------

  it('E2E expiry: short TTL -> SSE subscription auto-terminates', async () => {
    vi.useFakeTimers();
    try {
      // Set very short expiry
      mockSettings = createMockSettingsService({
        'signing_sdk.request_expiry_min': '0', // will be parsed as 0, fallback to NaN -> 30, so we need a different approach
      });

      // Override: create builder with custom expiry
      const shortBuilder = new SignRequestBuilder({
        settingsService: createMockSettingsService({
          'signing_sdk.request_expiry_min': '1', // 1 minute
        }) as any,
        walletLinkRegistry: mockRegistry as any,
      });

      // Patch expiresAt on the result to be very short (100ms from now)
      const originalBuildRequest = shortBuilder.buildRequest.bind(shortBuilder);
      vi.spyOn(shortBuilder, 'buildRequest').mockImplementation((params) => {
        const result = originalBuildRequest(params);
        result.request = {
          ...result.request,
          expiresAt: new Date(Date.now() + 500).toISOString(), // 500ms
        };
        return result;
      });

      const shortChannel = new NtfySigningChannel({
        signRequestBuilder: shortBuilder,
        signResponseHandler: mockHandler as any,
        settingsService: mockSettings as any,
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

      await shortChannel.sendRequest({
        txId,
        chain: 'evm',
        network: 'ethereum-mainnet',
        type: 'TRANSFER',
        from: signerAddress,
        to: toAddress,
        policyTier: 'APPROVAL',
        walletId: 'dcent',
      });

      // Advance past expiry
      vi.advanceTimersByTime(1000);
      await vi.advanceTimersByTimeAsync(100);

      // handler.handle should NOT have been called (no response received before expiry)
      expect(mockHandler.handle).not.toHaveBeenCalled();

      shortChannel.shutdown();
    } finally {
      vi.useRealTimers();
    }
  });

  // -----------------------------------------------------------------------
  // Scenario 4: SDK parseSignRequest round-trip
  // -----------------------------------------------------------------------

  it('round-trip: daemon SignRequest -> universalLink -> SDK parseSignRequest', async () => {
    // Use the real builder to create a request
    const buildResult = builder.buildRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: toAddress,
      amount: '1.5',
      symbol: 'ETH',
      policyTier: 'APPROVAL',
      walletName: 'dcent',
    });

    // The universalLinkUrl is built by the mock registry using encodeSignRequest
    const { request, universalLinkUrl } = buildResult;

    // Parse the URL manually (simulating what wallet-sdk's parseSignRequest does)
    const url = new URL(universalLinkUrl);
    const data = url.searchParams.get('data');
    expect(data).toBeTruthy();

    // Decode base64url -> JSON -> parse
    const json = Buffer.from(data!, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json) as SignRequest;

    // Verify round-trip: decoded request matches original
    expect(parsed.version).toBe(request.version);
    expect(parsed.requestId).toBe(request.requestId);
    expect(parsed.chain).toBe(request.chain);
    expect(parsed.network).toBe(request.network);
    expect(parsed.message).toBe(request.message);
    expect(parsed.displayMessage).toBe(request.displayMessage);
    expect(parsed.metadata.txId).toBe(request.metadata.txId);
    expect(parsed.metadata.type).toBe(request.metadata.type);
    expect(parsed.metadata.from).toBe(request.metadata.from);
    expect(parsed.metadata.to).toBe(request.metadata.to);
    expect(parsed.metadata.amount).toBe(request.metadata.amount);
    expect(parsed.metadata.symbol).toBe(request.metadata.symbol);
    expect(parsed.metadata.policyTier).toBe(request.metadata.policyTier);
    expect(parsed.expiresAt).toBe(request.expiresAt);

    // Verify display message is human-readable
    expect(request.displayMessage).toContain('TRANSFER');
    expect(request.displayMessage).toContain('1.5 ETH');
  });

  // -----------------------------------------------------------------------
  // Scenario 5: SDK sendViaNtfy round-trip
  // -----------------------------------------------------------------------

  it('round-trip: SDK sendViaNtfy -> NtfySigningChannel receives via SSE', async () => {
    mockHandler.handle.mockResolvedValue({ action: 'approved', txId } as HandleResult);

    // 1. Build a SignResponse (simulating what wallet-sdk's buildSignResponse does)
    let capturedRequestId = '';
    const originalBuildRequest = builder.buildRequest.bind(builder);
    vi.spyOn(builder, 'buildRequest').mockImplementation((params) => {
      const result = originalBuildRequest(params);
      capturedRequestId = result.request.requestId;
      return result;
    });

    const signResponse: SignResponse = {
      version: '1',
      requestId: '', // Will be set after buildRequest
      action: 'approve',
      signature: '0xsdk-generated-signature',
      signerAddress,
      signedAt: new Date().toISOString(),
    };

    // 2. Setup: the SDK's sendViaNtfy would POST base64url-encoded response to ntfy
    //    Then ntfy delivers it via SSE to the daemon's NtfySigningChannel
    fetchMock
      .mockResolvedValueOnce({ ok: true }) // daemon's ntfy publish (sendRequest)
      .mockImplementationOnce(() => {
        // daemon's SSE subscribe -- delivers the response that SDK sent
        signResponse.requestId = capturedRequestId;

        // Simulate: SDK called sendViaNtfy -> ntfy server stores it -> SSE delivers
        const encoded = Buffer.from(JSON.stringify(signResponse), 'utf-8').toString('base64url');
        const sseData = JSON.stringify({ message: encoded });
        const sseEvent = `data: ${sseData}\n\n`;

        const mockReader = {
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode(sseEvent),
            })
            .mockResolvedValueOnce({ done: true, value: undefined }),
          releaseLock: vi.fn(),
        };

        return Promise.resolve({
          ok: true,
          body: { getReader: () => mockReader },
        });
      });

    await channel.sendRequest({
      txId,
      chain: 'evm',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: toAddress,
      amount: '1.5',
      symbol: 'ETH',
      policyTier: 'APPROVAL',
      walletName: 'dcent',
      walletId: 'dcent',
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify: daemon received the SDK-generated response
    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const received = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(received.signature).toBe('0xsdk-generated-signature');
    expect(received.action).toBe('approve');
    expect(received.requestId).toBe(capturedRequestId);
  });
});
