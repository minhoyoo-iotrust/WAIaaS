/**
 * E2E integration tests for the signing-sdk module.
 *
 * Tests the full flow: SignRequestBuilder -> PushRelaySigningChannel -> long-polling -> SignResponseHandler.
 * All HTTP calls are mocked with vi.fn() -- no actual Push Relay server.
 *
 * Scenarios:
 * 1. Push Relay E2E approve flow
 * 2. Push Relay E2E reject flow
 * 3. Expiration scenario (short TTL)
 * 4. SDK parseSignRequest round-trip
 * 5. SDK sendViaRelay round-trip
 *
 * @see packages/daemon/src/services/signing-sdk/index.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SignRequest, SignResponse } from '@waiaas/core';
import { encodeSignRequest } from '@waiaas/core';
import { PushRelaySigningChannel } from '../services/signing-sdk/channels/push-relay-signing-channel.js';
import { SignRequestBuilder } from '../services/signing-sdk/sign-request-builder.js';
import type { HandleResult } from '../services/signing-sdk/sign-response-handler.js';
import type { WalletLinkConfig } from '@waiaas/core';

// Verify module index exports work
import {
  SignRequestBuilder as IndexedBuilder,
  PushRelaySigningChannel as IndexedChannel,
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
};

// ---------------------------------------------------------------------------
// Mock SettingsService
// ---------------------------------------------------------------------------

function createMockSettingsService(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    'signing_sdk.enabled': 'true',
    'signing_sdk.preferred_wallet': 'dcent',
    'signing_sdk.request_expiry_min': '30',
    'signing_sdk.preferred_channel': 'push_relay',
    'signing_sdk.push_relay_api_key': 'test-api-key',
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
// Tests
// ---------------------------------------------------------------------------

describe('signing-sdk E2E integration', () => {
  let channel: PushRelaySigningChannel;
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

    channel = new PushRelaySigningChannel({
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
    expect(IndexedChannel).toBe(PushRelaySigningChannel);
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Push Relay E2E approve flow
  // -----------------------------------------------------------------------

  it('E2E approve: SignRequest -> Push Relay POST -> long-poll -> approve', async () => {
    mockHandler.handle.mockResolvedValue({ action: 'approved', txId } as HandleResult);

    const approveResponse: SignResponse = {
      version: '1',
      requestId: '',
      action: 'approve',
      signature: '0xvalidsignature',
      signerAddress,
      signedAt: new Date().toISOString(),
    };

    let capturedRequestId = '01935a3b-0001-7e00-b123-000000000001';
    approveResponse.requestId = capturedRequestId;

    vi.spyOn(builder, 'buildRequest').mockImplementation(() => {
      return {
        request: {
          version: '1',
          requestId: capturedRequestId,
          caip2ChainId: 'eip155:1',
          networkName: 'ethereum-mainnet',
          signerAddress,
          message: 'approve tx',
          displayMessage: 'TRANSFER 1.5 ETH',
          metadata: { txId, type: 'TRANSFER', from: signerAddress, to: toAddress, amount: '1.5', symbol: 'ETH', policyTier: 'APPROVAL' as const },
          responseChannel: { type: 'push_relay' as const, pushRelayUrl: 'https://relay.test.com', requestId: capturedRequestId },
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
        universalLinkUrl: 'https://link.dcentwallet.com/waiaas/sign?data=mock',
        requestTopic: 'dcent',
      };
    });

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockImplementationOnce(() => {
        const encodedResponse = Buffer.from(JSON.stringify(approveResponse), 'utf-8').toString('base64url');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ response: encodedResponse }),
        });
      });

    const result = await channel.sendRequest({
      txId,
      chain: 'ethereum',
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

    // Verify: POST was called with correct format
    expect(fetchMock).toHaveBeenCalled();
    const [postUrl, postOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(postUrl).toContain('/v1/push');
    const postBody = JSON.parse(postOpts.body as string);
    expect(postBody.category).toBe('sign_request');
    expect(postBody.payload.universalLinkUrl).toContain('https://link.dcentwallet.com/waiaas/sign?data=');

    // Verify: SignResponseHandler.handle() was called with approve response
    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const handledResponse = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(handledResponse.action).toBe('approve');
    expect(handledResponse.signature).toBe('0xvalidsignature');

    // Verify: result contains correct IDs
    expect(result.requestId).toBe(capturedRequestId);
    expect(result.requestTopic).toBe('dcent');
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Push Relay E2E reject flow
  // -----------------------------------------------------------------------

  it('E2E reject: SignRequest -> Push Relay POST -> long-poll -> reject', async () => {
    mockHandler.handle.mockResolvedValue({ action: 'rejected', txId } as HandleResult);

    let capturedRequestId = '01935a3b-0001-7e00-b123-000000000002';
    const rejectResponse: SignResponse = {
      version: '1',
      requestId: capturedRequestId,
      action: 'reject',
      signerAddress,
      signedAt: new Date().toISOString(),
    };

    vi.spyOn(builder, 'buildRequest').mockImplementation(() => {
      return {
        request: {
          version: '1',
          requestId: capturedRequestId,
          caip2ChainId: 'eip155:1',
          networkName: 'ethereum-mainnet',
          signerAddress,
          message: 'approve tx',
          displayMessage: 'TRANSFER 1.5 ETH',
          metadata: { txId, type: 'TRANSFER', from: signerAddress, to: toAddress, amount: '1.5', symbol: 'ETH', policyTier: 'APPROVAL' as const },
          responseChannel: { type: 'push_relay' as const, pushRelayUrl: 'https://relay.test.com', requestId: capturedRequestId },
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
        universalLinkUrl: 'https://link.dcentwallet.com/waiaas/sign?data=mock',
        requestTopic: 'dcent',
      };
    });

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST
      .mockImplementationOnce(() => {
        const encodedResponse = Buffer.from(JSON.stringify(rejectResponse), 'utf-8').toString('base64url');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ response: encodedResponse }),
        });
      });

    await channel.sendRequest({
      txId,
      chain: 'ethereum',
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

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const handledResponse = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(handledResponse.action).toBe('reject');
    expect(handledResponse.requestId).toBe(capturedRequestId);
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Expiration scenario
  // -----------------------------------------------------------------------

  it('E2E expiry: short TTL -> long-polling auto-terminates', async () => {
    vi.useFakeTimers();
    try {
      const shortBuilder = new SignRequestBuilder({
        settingsService: createMockSettingsService({
          'signing_sdk.request_expiry_min': '1',
        }) as any,
        walletLinkRegistry: mockRegistry as any,
      });

      vi.spyOn(shortBuilder, 'buildRequest').mockImplementation(() => {
        return {
          request: {
            version: '1',
            requestId: '01935a3b-0001-7e00-b123-000000000004',
            caip2ChainId: 'eip155:1',
            networkName: 'ethereum-mainnet',
            signerAddress,
            message: 'approve tx',
            displayMessage: 'TRANSFER',
            metadata: { txId, type: 'TRANSFER', from: signerAddress, to: toAddress, policyTier: 'APPROVAL' as const },
            responseChannel: { type: 'push_relay' as const, pushRelayUrl: 'https://relay.test.com', requestId: '01935a3b-0001-7e00-b123-000000000004' },
            expiresAt: new Date(Date.now() + 500).toISOString(),
          },
          universalLinkUrl: 'https://link.dcentwallet.com/waiaas/sign?data=mock',
          requestTopic: 'dcent',
        };
      });

      const shortChannel = new PushRelaySigningChannel({
        signRequestBuilder: shortBuilder,
        signResponseHandler: mockHandler as any,
        settingsService: mockSettings as any,
      });

      const abortError = new DOMException('The operation was aborted', 'AbortError');
      fetchMock
        .mockResolvedValueOnce({ ok: true, status: 200 }) // POST
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
        chain: 'ethereum',
        network: 'ethereum-mainnet',
        type: 'TRANSFER',
        from: signerAddress,
        to: toAddress,
        policyTier: 'APPROVAL',
        walletId: 'dcent',
      });

      vi.advanceTimersByTime(1000);
      await vi.advanceTimersByTimeAsync(100);

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
    const buildResult = builder.buildRequest({
      txId,
      chain: 'ethereum',
      network: 'ethereum-mainnet',
      type: 'TRANSFER',
      from: signerAddress,
      to: toAddress,
      amount: '1.5',
      symbol: 'ETH',
      policyTier: 'APPROVAL',
      walletName: 'dcent',
    });

    const { request, universalLinkUrl } = buildResult;

    const url = new URL(universalLinkUrl);
    const data = url.searchParams.get('data');
    expect(data).toBeTruthy();

    const json = Buffer.from(data!, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json) as SignRequest;

    expect(parsed.version).toBe(request.version);
    expect(parsed.requestId).toBe(request.requestId);
    expect(parsed.caip2ChainId).toBe(request.caip2ChainId);
    expect(parsed.networkName).toBe(request.networkName);
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
    expect(request.displayMessage).toContain('TRANSFER');
    expect(request.displayMessage).toContain('1.5 ETH');
  });

  // -----------------------------------------------------------------------
  // Scenario 5: SDK sendViaRelay round-trip
  // -----------------------------------------------------------------------

  it('round-trip: SDK sendViaRelay -> PushRelaySigningChannel receives via long-poll', async () => {
    mockHandler.handle.mockResolvedValue({ action: 'approved', txId } as HandleResult);

    let capturedRequestId = '01935a3b-0001-7e00-b123-000000000003';

    const signResponse: SignResponse = {
      version: '1',
      requestId: capturedRequestId,
      action: 'approve',
      signature: '0xsdk-generated-signature',
      signerAddress,
      signedAt: new Date().toISOString(),
    };

    vi.spyOn(builder, 'buildRequest').mockImplementation(() => {
      return {
        request: {
          version: '1',
          requestId: capturedRequestId,
          caip2ChainId: 'eip155:1',
          networkName: 'ethereum-mainnet',
          signerAddress,
          message: 'approve tx',
          displayMessage: 'TRANSFER 1.5 ETH',
          metadata: { txId, type: 'TRANSFER', from: signerAddress, to: toAddress, amount: '1.5', symbol: 'ETH', policyTier: 'APPROVAL' as const },
          responseChannel: { type: 'push_relay' as const, pushRelayUrl: 'https://relay.test.com', requestId: capturedRequestId },
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
        universalLinkUrl: 'https://link.dcentwallet.com/waiaas/sign?data=mock',
        requestTopic: 'dcent',
      };
    });

    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 }) // POST /v1/push
      .mockImplementationOnce(() => {
        const encodedResponse = Buffer.from(JSON.stringify(signResponse), 'utf-8').toString('base64url');
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ response: encodedResponse }),
        });
      });

    await channel.sendRequest({
      txId,
      chain: 'ethereum',
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

    expect(mockHandler.handle).toHaveBeenCalledOnce();
    const received = mockHandler.handle.mock.calls[0][0] as SignResponse;
    expect(received.signature).toBe('0xsdk-generated-signature');
    expect(received.action).toBe('approve');
    expect(received.requestId).toBe(capturedRequestId);
  });
});
