/**
 * BundlerClient/PaymasterClient factory unit tests.
 *
 * Tests URL resolution (chain-specific override priority), client creation,
 * and error handling when bundler URL is not configured.
 *
 * @see packages/daemon/src/infrastructure/smart-account/smart-account-clients.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock viem/account-abstraction
const mockCreateBundlerClient = vi.fn().mockReturnValue({ type: 'bundlerClient' });
const mockCreatePaymasterClient = vi.fn().mockReturnValue({
  type: 'paymasterClient',
  getPaymasterData: vi.fn(),
  getPaymasterStubData: vi.fn(),
});

vi.mock('viem/account-abstraction', () => ({
  createBundlerClient: (...args: unknown[]) => mockCreateBundlerClient(...args),
  createPaymasterClient: (...args: unknown[]) => mockCreatePaymasterClient(...args),
}));

// Mock viem
const mockHttp = vi.fn().mockReturnValue({ type: 'http' });
vi.mock('viem', () => ({
  http: (...args: unknown[]) => mockHttp(...args),
}));

import {
  resolveBundlerUrl,
  resolvePaymasterUrl,
  createSmartAccountBundlerClient,
  createSmartAccountPaymasterClient,
} from '../infrastructure/smart-account/smart-account-clients.js';
import { WAIaaSError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockSettingsService(overrides: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => {
      if (key in overrides) return overrides[key];
      // For keys not in overrides, return empty string (mimics default empty setting)
      return '';
    }),
    set: vi.fn(),
    getAll: vi.fn(),
    getAllMasked: vi.fn(),
    importFromConfig: vi.fn(),
    setMany: vi.fn(),
  } as any;
}

function mockSmartAccount() {
  return {
    address: '0x1234567890abcdef1234567890abcdef12345678' as const,
    type: 'smart' as const,
  } as any;
}

function mockPublicClient() {
  return {
    chain: { id: 11155111 },
    transport: { type: 'http' },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('smart-account-clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // resolveBundlerUrl
  // -------------------------------------------------------------------------

  describe('resolveBundlerUrl', () => {
    it('returns chain-specific URL when available', () => {
      const settings = mockSettingsService({
        'smart_account.bundler_url.ethereum-sepolia': 'https://sepolia-bundler.example.com',
        'smart_account.bundler_url': 'https://default-bundler.example.com',
      });

      const result = resolveBundlerUrl(settings, 'ethereum-sepolia');
      expect(result).toBe('https://sepolia-bundler.example.com');
    });

    it('returns default URL when chain-specific is empty', () => {
      const settings = mockSettingsService({
        'smart_account.bundler_url.ethereum-sepolia': '',
        'smart_account.bundler_url': 'https://default-bundler.example.com',
      });

      const result = resolveBundlerUrl(settings, 'ethereum-sepolia');
      expect(result).toBe('https://default-bundler.example.com');
    });

    it('returns null when no URL is configured', () => {
      const settings = mockSettingsService({
        'smart_account.bundler_url': '',
      });

      const result = resolveBundlerUrl(settings, 'ethereum-sepolia');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // resolvePaymasterUrl
  // -------------------------------------------------------------------------

  describe('resolvePaymasterUrl', () => {
    it('returns chain-specific URL when available', () => {
      const settings = mockSettingsService({
        'smart_account.paymaster_url.ethereum-sepolia': 'https://sepolia-pm.example.com',
        'smart_account.paymaster_url': 'https://default-pm.example.com',
      });

      const result = resolvePaymasterUrl(settings, 'ethereum-sepolia');
      expect(result).toBe('https://sepolia-pm.example.com');
    });

    it('returns default URL when chain-specific is not set', () => {
      const settings = mockSettingsService({
        'smart_account.paymaster_url': 'https://default-pm.example.com',
      });

      const result = resolvePaymasterUrl(settings, 'ethereum-sepolia');
      expect(result).toBe('https://default-pm.example.com');
    });

    it('returns null when paymaster_url is not set', () => {
      const settings = mockSettingsService({
        'smart_account.paymaster_url': '',
      });

      const result = resolvePaymasterUrl(settings, 'ethereum-sepolia');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // createSmartAccountBundlerClient
  // -------------------------------------------------------------------------

  describe('createSmartAccountBundlerClient', () => {
    it('creates BundlerClient when bundler_url is configured', () => {
      const settings = mockSettingsService({
        'smart_account.bundler_url': 'https://bundler.example.com',
        'smart_account.paymaster_url': '',
      });

      const result = createSmartAccountBundlerClient({
        client: mockPublicClient(),
        account: mockSmartAccount(),
        networkId: 'ethereum-sepolia',
        settingsService: settings,
      });

      expect(result).toBeDefined();
      expect(mockCreateBundlerClient).toHaveBeenCalledOnce();
      expect(mockHttp).toHaveBeenCalledWith('https://bundler.example.com');
    });

    it('throws CHAIN_ERROR when no bundler URL is set', () => {
      const settings = mockSettingsService({
        'smart_account.bundler_url': '',
      });

      expect(() =>
        createSmartAccountBundlerClient({
          client: mockPublicClient(),
          account: mockSmartAccount(),
          networkId: 'ethereum-sepolia',
          settingsService: settings,
        }),
      ).toThrow(WAIaaSError);

      try {
        createSmartAccountBundlerClient({
          client: mockPublicClient(),
          account: mockSmartAccount(),
          networkId: 'ethereum-sepolia',
          settingsService: settings,
        });
      } catch (err) {
        expect((err as WAIaaSError).code).toBe('CHAIN_ERROR');
      }
    });

    it('includes paymaster when paymaster_url is configured', () => {
      const settings = mockSettingsService({
        'smart_account.bundler_url': 'https://bundler.example.com',
        'smart_account.paymaster_url': 'https://paymaster.example.com',
      });

      createSmartAccountBundlerClient({
        client: mockPublicClient(),
        account: mockSmartAccount(),
        networkId: 'ethereum-sepolia',
        settingsService: settings,
      });

      // createPaymasterClient should be called for the paymaster URL
      expect(mockCreatePaymasterClient).toHaveBeenCalled();
      // createBundlerClient should have paymaster in its options
      const bundlerArgs = mockCreateBundlerClient.mock.calls[0][0];
      expect(bundlerArgs).toHaveProperty('paymaster');
    });
  });

  // -------------------------------------------------------------------------
  // createSmartAccountPaymasterClient
  // -------------------------------------------------------------------------

  describe('createSmartAccountPaymasterClient', () => {
    it('returns PaymasterClient when paymaster_url is set', () => {
      const settings = mockSettingsService({
        'smart_account.paymaster_url': 'https://paymaster.example.com',
      });

      const result = createSmartAccountPaymasterClient(settings, 'ethereum-sepolia');

      expect(result).toBeDefined();
      expect(mockCreatePaymasterClient).toHaveBeenCalled();
      expect(mockHttp).toHaveBeenCalledWith('https://paymaster.example.com');
    });

    it('returns null when paymaster_url is not set', () => {
      const settings = mockSettingsService({
        'smart_account.paymaster_url': '',
      });

      const result = createSmartAccountPaymasterClient(settings, 'ethereum-sepolia');

      expect(result).toBeNull();
      expect(mockCreatePaymasterClient).not.toHaveBeenCalled();
    });

    it('uses chain-specific paymaster URL over default', () => {
      const settings = mockSettingsService({
        'smart_account.paymaster_url.ethereum-sepolia': 'https://sepolia-pm.example.com',
        'smart_account.paymaster_url': 'https://default-pm.example.com',
      });

      createSmartAccountPaymasterClient(settings, 'ethereum-sepolia');

      expect(mockHttp).toHaveBeenCalledWith('https://sepolia-pm.example.com');
    });
  });
});
