/**
 * Tests for SignRequestBuilder service.
 *
 * Tests cover:
 * 1. TRANSFER transaction -> SignRequest with universal link URL
 * 2. TOKEN_TRANSFER (amount + symbol) message format
 * 3. CONTRACT_CALL (no amount) message format -- "Amount:" line omitted
 * 4. signing_sdk.enabled=false -> SIGNING_SDK_DISABLED error
 * 5. preferred_wallet not set + walletName not specified -> error
 * 6. expiresAt reflects request_expiry_min setting
 * 7. ntfy response channel with custom server URL
 *
 * SettingsService and WalletLinkRegistry are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import type { WalletLinkConfig } from '@waiaas/core';
import { SignRequestBuilder } from '../services/signing-sdk/sign-request-builder.js';

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

function createMockWalletLinkRegistry() {
  return {
    getWallet: vi.fn((name: string) => {
      if (name === 'dcent') return walletConfig;
      throw new WAIaaSError('WALLET_NOT_REGISTERED', {
        message: `Wallet '${name}' not registered`,
      });
    }),
    buildSignUrl: vi.fn(
      (_walletName: string, _request: unknown) =>
        'https://link.dcentwallet.com/waiaas/sign?data=mock-base64url-encoded',
    ),
    getAllWallets: vi.fn(() => [walletConfig]),
    registerWallet: vi.fn(),
    removeWallet: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseParams = {
  txId: '01935a3b-7c8d-7e00-b123-456789abcdef',
  chain: 'evm' as const,
  network: 'ethereum-mainnet',
  type: 'TRANSFER',
  from: '0x1234567890abcdef1234567890abcdef12345678',
  to: '0xabcdef0123456789abcdef0123456789abcdef01',
  policyTier: 'APPROVAL' as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SignRequestBuilder', () => {
  let builder: SignRequestBuilder;
  let mockSettings: ReturnType<typeof createMockSettingsService>;
  let mockRegistry: ReturnType<typeof createMockWalletLinkRegistry>;

  beforeEach(() => {
    mockSettings = createMockSettingsService();
    mockRegistry = createMockWalletLinkRegistry();
    builder = new SignRequestBuilder({
      settingsService: mockSettings as any,
      walletLinkRegistry: mockRegistry as any,
    });
  });

  // -----------------------------------------------------------------------
  // 1. TRANSFER -> SignRequest with universal link URL
  // -----------------------------------------------------------------------

  it('builds SignRequest for TRANSFER transaction with universal link URL', () => {
    const result = builder.buildRequest({
      ...baseParams,
      amount: '1.5',
      symbol: 'ETH',
    });

    // SignRequest structure
    expect(result.request.version).toBe('1');
    expect(result.request.requestId).toBeDefined();
    expect(result.request.chain).toBe('evm');
    expect(result.request.network).toBe('ethereum-mainnet');
    expect(result.request.metadata.txId).toBe(baseParams.txId);
    expect(result.request.metadata.type).toBe('TRANSFER');
    expect(result.request.metadata.from).toBe(baseParams.from);
    expect(result.request.metadata.to).toBe(baseParams.to);
    expect(result.request.metadata.amount).toBe('1.5');
    expect(result.request.metadata.symbol).toBe('ETH');
    expect(result.request.metadata.policyTier).toBe('APPROVAL');
    expect(result.request.expiresAt).toBeDefined();

    // Universal link URL
    expect(result.universalLinkUrl).toContain('https://link.dcentwallet.com');
    expect(mockRegistry.buildSignUrl).toHaveBeenCalledWith('dcent', result.request);

    // Request topic
    expect(result.requestTopic).toBe('waiaas-sign-dcent');
  });

  // -----------------------------------------------------------------------
  // 2. TOKEN_TRANSFER message format (amount + symbol)
  // -----------------------------------------------------------------------

  it('builds signing message with Amount line for TOKEN_TRANSFER', () => {
    const result = builder.buildRequest({
      ...baseParams,
      type: 'TOKEN_TRANSFER',
      amount: '100',
      symbol: 'USDC',
    });

    expect(result.request.message).toContain('Type: TOKEN_TRANSFER');
    expect(result.request.message).toContain('Amount: 100 USDC');
    expect(result.request.message).toContain('WAIaaS Transaction Approval');
    expect(result.request.message).toContain(`Transaction: ${baseParams.txId}`);
    expect(result.request.message).toContain(`From: ${baseParams.from}`);
    expect(result.request.message).toContain(`To: ${baseParams.to}`);
    expect(result.request.message).toContain('Network: ethereum-mainnet');
    expect(result.request.message).toContain('Policy Tier: APPROVAL');
    expect(result.request.message).toContain('Approve this transaction by signing this message.');
    expect(result.request.message).toMatch(/Nonce: [0-9a-f-]+/);
  });

  // -----------------------------------------------------------------------
  // 3. CONTRACT_CALL message format -- no "Amount:" line
  // -----------------------------------------------------------------------

  it('omits Amount line for CONTRACT_CALL without amount', () => {
    const result = builder.buildRequest({
      ...baseParams,
      type: 'CONTRACT_CALL',
      // No amount, no symbol
    });

    expect(result.request.message).toContain('Type: CONTRACT_CALL');
    expect(result.request.message).not.toContain('Amount:');
    expect(result.request.metadata.amount).toBeUndefined();
    expect(result.request.metadata.symbol).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 4. signing_sdk.enabled=false -> SIGNING_SDK_DISABLED error
  // -----------------------------------------------------------------------

  it('throws SIGNING_SDK_DISABLED when signing SDK is disabled', () => {
    mockSettings = createMockSettingsService({ 'signing_sdk.enabled': 'false' });
    builder = new SignRequestBuilder({
      settingsService: mockSettings as any,
      walletLinkRegistry: mockRegistry as any,
    });

    expect(() => builder.buildRequest(baseParams)).toThrow(WAIaaSError);
    try {
      builder.buildRequest(baseParams);
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('SIGNING_SDK_DISABLED');
    }
  });

  // -----------------------------------------------------------------------
  // 5. No preferred_wallet + no walletName -> error
  // -----------------------------------------------------------------------

  it('throws error when no wallet name specified and no preferred_wallet configured', () => {
    mockSettings = createMockSettingsService({ 'signing_sdk.preferred_wallet': '' });
    builder = new SignRequestBuilder({
      settingsService: mockSettings as any,
      walletLinkRegistry: mockRegistry as any,
    });

    expect(() => builder.buildRequest(baseParams)).toThrow(WAIaaSError);
    try {
      builder.buildRequest(baseParams);
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('WALLET_NOT_REGISTERED');
    }
  });

  // -----------------------------------------------------------------------
  // 6. expiresAt reflects request_expiry_min setting
  // -----------------------------------------------------------------------

  it('calculates expiresAt based on request_expiry_min setting', () => {
    mockSettings = createMockSettingsService({ 'signing_sdk.request_expiry_min': '15' });
    builder = new SignRequestBuilder({
      settingsService: mockSettings as any,
      walletLinkRegistry: mockRegistry as any,
    });

    const before = Date.now();
    const result = builder.buildRequest({ ...baseParams, amount: '1', symbol: 'ETH' });
    const after = Date.now();

    const expiresAtMs = new Date(result.request.expiresAt).getTime();
    // Should be ~15 minutes (900,000 ms) from now
    const expectedMin = before + 15 * 60 * 1000 - 1000; // 1s tolerance
    const expectedMax = after + 15 * 60 * 1000 + 1000;
    expect(expiresAtMs).toBeGreaterThan(expectedMin);
    expect(expiresAtMs).toBeLessThan(expectedMax);
  });

  // -----------------------------------------------------------------------
  // 7. ntfy response channel with custom server URL
  // -----------------------------------------------------------------------

  it('includes serverUrl in ntfy response channel when not default', () => {
    mockSettings = createMockSettingsService({
      'notifications.ntfy_server': 'https://ntfy.example.com',
    });
    builder = new SignRequestBuilder({
      settingsService: mockSettings as any,
      walletLinkRegistry: mockRegistry as any,
    });

    const result = builder.buildRequest({ ...baseParams, amount: '1', symbol: 'ETH' });

    expect(result.request.responseChannel.type).toBe('ntfy');
    if (result.request.responseChannel.type === 'ntfy') {
      expect(result.request.responseChannel.serverUrl).toBe('https://ntfy.example.com');
      expect(result.request.responseChannel.responseTopic).toContain('waiaas-response-');
    }
  });

  // -----------------------------------------------------------------------
  // 8. Uses walletName parameter over preferred_wallet setting
  // -----------------------------------------------------------------------

  it('uses explicit walletName parameter over preferred_wallet setting', () => {
    const result = builder.buildRequest({
      ...baseParams,
      amount: '1',
      symbol: 'ETH',
      walletName: 'dcent',
    });

    expect(mockRegistry.getWallet).toHaveBeenCalledWith('dcent');
    expect(result.request).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // 9. Display message is concise
  // -----------------------------------------------------------------------

  it('generates concise display message', () => {
    const result = builder.buildRequest({
      ...baseParams,
      amount: '1.5',
      symbol: 'ETH',
    });

    expect(result.request.displayMessage).toContain('TRANSFER');
    expect(result.request.displayMessage).toContain('1.5 ETH');
    expect(result.request.displayMessage).toContain('0x123456');
  });

  // -----------------------------------------------------------------------
  // 10. ntfy response channel omits serverUrl when default ntfy.sh
  // -----------------------------------------------------------------------

  it('omits serverUrl when using default ntfy.sh', () => {
    const result = builder.buildRequest({ ...baseParams, amount: '1', symbol: 'ETH' });

    expect(result.request.responseChannel.type).toBe('ntfy');
    if (result.request.responseChannel.type === 'ntfy') {
      expect(result.request.responseChannel.serverUrl).toBeUndefined();
    }
  });
});
