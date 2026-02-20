/**
 * Tests for WalletLinkRegistry service.
 *
 * Tests cover:
 * 1. getWallet returns registered wallet config
 * 2. getWallet throws WALLET_NOT_REGISTERED for unregistered wallet
 * 3. getAllWallets returns empty array initially
 * 4. registerWallet adds wallet to settings
 * 5. registerWallet rejects duplicate names
 * 6. removeWallet removes wallet from settings
 * 7. removeWallet throws WALLET_NOT_REGISTERED for unregistered wallet
 * 8. buildSignUrl generates correct URL
 * 9. buildSignUrl throws WALLET_NOT_REGISTERED for unregistered wallet
 * 10. Handles invalid JSON in settings gracefully
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import type { WalletLinkConfig, SignRequest } from '@waiaas/core';
import { WalletLinkRegistry } from '../services/signing-sdk/wallet-link-registry.js';

// ---------------------------------------------------------------------------
// Mock SettingsService
// ---------------------------------------------------------------------------

function createMockSettingsService() {
  const store = new Map<string, string>();
  // Initialize with empty JSON array default
  store.set('signing_sdk.wallets', '[]');

  return {
    get: vi.fn((key: string) => store.get(key) ?? '[]'),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    _store: store,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const walletConfig: WalletLinkConfig = {
  name: 'dcent',
  displayName: "D'CENT Wallet",
  universalLink: {
    base: 'https://link.dcentwallet.com',
    signPath: '/waiaas/sign',
  },
  deepLink: {
    scheme: 'dcent-wallet',
    signPath: '/waiaas/sign',
  },
  ntfy: {
    requestTopic: 'waiaas-sign-dcent',
  },
};

const phantomConfig: WalletLinkConfig = {
  name: 'phantom',
  displayName: 'Phantom Wallet',
  universalLink: {
    base: 'https://phantom.app',
    signPath: '/sign',
  },
};

const validSignRequest: SignRequest = {
  version: '1',
  requestId: '01935a3b-7c8d-7e00-b123-456789abcdef',
  chain: 'solana',
  network: 'devnet',
  message: 'V0FJYWFTIFNpZ25pbmcgUmVxdWVzdA==',
  displayMessage: 'Transfer 1.5 SOL to GsbwXf...',
  metadata: {
    txId: '01935a3b-7c8d-7e00-b123-456789abcdef',
    type: 'TRANSFER',
    from: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    to: 'GsbwXfJraMomNxBcjYLcG3mxkBUiyWXAB32fGbSQQRJe',
    amount: '1.5',
    symbol: 'SOL',
    policyTier: 'APPROVAL',
  },
  responseChannel: {
    type: 'ntfy',
    responseTopic: 'waiaas-response-01935a3b-7c8d-7e00-b123-456789abcdef',
  },
  expiresAt: '2026-03-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WalletLinkRegistry', () => {
  let mockSettings: ReturnType<typeof createMockSettingsService>;
  let registry: WalletLinkRegistry;

  beforeEach(() => {
    mockSettings = createMockSettingsService();
    // Cast to SettingsService interface (we only use get/set)
    registry = new WalletLinkRegistry(mockSettings as unknown as import('../infrastructure/settings/settings-service.js').SettingsService);
  });

  // ---- getAllWallets ----

  it('getAllWallets returns empty array initially', () => {
    const wallets = registry.getAllWallets();
    expect(wallets).toEqual([]);
  });

  // ---- registerWallet ----

  it('registerWallet adds a wallet config', () => {
    registry.registerWallet(walletConfig);
    const wallets = registry.getAllWallets();
    expect(wallets).toHaveLength(1);
    expect(wallets[0]!.name).toBe('dcent');
    expect(wallets[0]!.displayName).toBe("D'CENT Wallet");
  });

  it('registerWallet can add multiple wallets', () => {
    registry.registerWallet(walletConfig);
    registry.registerWallet(phantomConfig);
    const wallets = registry.getAllWallets();
    expect(wallets).toHaveLength(2);
    expect(wallets.map((w) => w.name).sort()).toEqual(['dcent', 'phantom']);
  });

  it('registerWallet rejects duplicate names', () => {
    registry.registerWallet(walletConfig);
    expect(() => registry.registerWallet(walletConfig)).toThrow(WAIaaSError);
    try {
      registry.registerWallet(walletConfig);
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('SIGN_REQUEST_ALREADY_PROCESSED');
    }
  });

  // ---- getWallet ----

  it('getWallet returns registered wallet by name', () => {
    registry.registerWallet(walletConfig);
    const wallet = registry.getWallet('dcent');
    expect(wallet.name).toBe('dcent');
    expect(wallet.universalLink.base).toBe('https://link.dcentwallet.com');
  });

  it('getWallet throws WALLET_NOT_REGISTERED for unregistered wallet', () => {
    expect(() => registry.getWallet('nonexistent')).toThrow(WAIaaSError);
    try {
      registry.getWallet('nonexistent');
    } catch (err) {
      const waiaasErr = err as WAIaaSError;
      expect(waiaasErr.code).toBe('WALLET_NOT_REGISTERED');
      expect(waiaasErr.httpStatus).toBe(404);
    }
  });

  // ---- removeWallet ----

  it('removeWallet removes an existing wallet', () => {
    registry.registerWallet(walletConfig);
    registry.registerWallet(phantomConfig);
    expect(registry.getAllWallets()).toHaveLength(2);

    registry.removeWallet('dcent');
    const wallets = registry.getAllWallets();
    expect(wallets).toHaveLength(1);
    expect(wallets[0]!.name).toBe('phantom');
  });

  it('removeWallet throws WALLET_NOT_REGISTERED for nonexistent wallet', () => {
    expect(() => registry.removeWallet('nonexistent')).toThrow(WAIaaSError);
    try {
      registry.removeWallet('nonexistent');
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('WALLET_NOT_REGISTERED');
    }
  });

  // ---- buildSignUrl ----

  it('buildSignUrl generates correct URL for registered wallet', () => {
    registry.registerWallet(walletConfig);
    const url = registry.buildSignUrl('dcent', validSignRequest);
    expect(url).toMatch(/^https:\/\/link\.dcentwallet\.com\/waiaas\/sign\?data=/);
    expect(url.split('?data=')[1]!.length).toBeGreaterThan(0);
  });

  it('buildSignUrl throws WALLET_NOT_REGISTERED for unregistered wallet', () => {
    expect(() => registry.buildSignUrl('nonexistent', validSignRequest)).toThrow(WAIaaSError);
    try {
      registry.buildSignUrl('nonexistent', validSignRequest);
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('WALLET_NOT_REGISTERED');
    }
  });

  // ---- Edge cases ----

  it('handles invalid JSON in settings gracefully', () => {
    mockSettings._store.set('signing_sdk.wallets', 'not-valid-json');
    const wallets = registry.getAllWallets();
    expect(wallets).toEqual([]);
  });

  it('handles JSON that is not an array gracefully', () => {
    mockSettings._store.set('signing_sdk.wallets', '{"key": "value"}');
    const wallets = registry.getAllWallets();
    expect(wallets).toEqual([]);
  });

  it('persists wallets via SettingsService.set', () => {
    registry.registerWallet(walletConfig);
    expect(mockSettings.set).toHaveBeenCalledWith(
      'signing_sdk.wallets',
      expect.stringContaining('dcent'),
    );
  });

  it('reads wallets from SettingsService.get', () => {
    registry.registerWallet(walletConfig);
    registry.getAllWallets();
    expect(mockSettings.get).toHaveBeenCalledWith('signing_sdk.wallets');
  });
});
