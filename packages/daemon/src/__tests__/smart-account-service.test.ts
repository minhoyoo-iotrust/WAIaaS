/**
 * SmartAccountService unit tests.
 *
 * Tests CREATE2 address prediction, EntryPoint configuration, factory address,
 * and custom entry point support using mocked permissionless.js functions.
 *
 * @see packages/daemon/src/infrastructure/smart-account/smart-account-service.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factory is hoisted -- must not reference top-level variables.
// Inline all constant values directly in the factory.
vi.mock('permissionless/accounts', () => ({
  toSimpleSmartAccount: vi.fn().mockResolvedValue({
    address: '0x1234567890abcdef1234567890abcdef12345678',
  }),
}));

vi.mock('viem/account-abstraction', () => ({
  entryPoint07Address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
}));

import {
  SmartAccountService,
  DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07,
  SOLADY_FACTORY_ADDRESS,
  FACTORY_SUPPORTED_NETWORKS,
  getFactorySupportedNetworks,
} from '../infrastructure/smart-account/smart-account-service.js';

// Constants for assertions (safe to use outside vi.mock factory)
const MOCK_SMART_ACCOUNT_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const MOCK_ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockOwner() {
  return {
    address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`,
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
    type: 'local' as const,
    source: 'privateKey' as const,
    publicKey: '0x' as `0x${string}`,
  } as any;
}

function mockClient() {
  return {
    chain: { id: 1 },
    transport: { type: 'http' },
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SmartAccountService', () => {
  let service: SmartAccountService;

  beforeEach(() => {
    service = new SmartAccountService();
    vi.clearAllMocks();
  });

  it('createSmartAccount returns SmartAccountInfo with predicted address', async () => {
    const result = await service.createSmartAccount({
      owner: mockOwner(),
      client: mockClient(),
    });

    expect(result.address).toBe(MOCK_SMART_ACCOUNT_ADDRESS);
    expect(result.signerKey).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result.entryPoint).toBe(MOCK_ENTRY_POINT_V07);
    expect(result.factoryAddress).toBe(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07);
    expect(result.account).toBeDefined();
    expect(result.account.address).toBe(MOCK_SMART_ACCOUNT_ADDRESS);
  });

  it('createSmartAccount uses custom entryPoint when provided', async () => {
    const customEntryPoint = '0x9999999999999999999999999999999999999999' as `0x${string}`;

    const result = await service.createSmartAccount({
      owner: mockOwner(),
      client: mockClient(),
      entryPoint: customEntryPoint,
    });

    expect(result.entryPoint).toBe(customEntryPoint);
  });

  it('createSmartAccount defaults to EntryPoint v0.7 when no entryPoint specified', async () => {
    const result = await service.createSmartAccount({
      owner: mockOwner(),
      client: mockClient(),
    });

    expect(result.entryPoint).toBe(MOCK_ENTRY_POINT_V07);
  });

  it('createSmartAccount uses custom factoryAddress when provided', async () => {
    const customFactory = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' as `0x${string}`;

    const result = await service.createSmartAccount({
      owner: mockOwner(),
      client: mockClient(),
      factoryAddress: customFactory,
    });

    expect(result.factoryAddress).toBe(customFactory);
  });

  it('createSmartAccount defaults to SimpleAccount v0.7 factory', async () => {
    const result = await service.createSmartAccount({
      owner: mockOwner(),
      client: mockClient(),
    });

    expect(result.factoryAddress).toBe(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07);
  });

  it('getDefaultEntryPoint returns v0.7 address constant', () => {
    const ep = service.getDefaultEntryPoint();
    expect(ep).toBe(MOCK_ENTRY_POINT_V07);
  });

  it('createSmartAccount calls toSimpleSmartAccount with correct parameters', async () => {
    const { toSimpleSmartAccount } = await import('permissionless/accounts');
    const owner = mockOwner();
    const client = mockClient();

    await service.createSmartAccount({ owner, client });

    expect(toSimpleSmartAccount).toHaveBeenCalledWith({
      client,
      owner,
      factoryAddress: DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07,
      entryPoint: {
        address: MOCK_ENTRY_POINT_V07,
        version: '0.7',
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Factory Supported Networks (static list)
// ---------------------------------------------------------------------------

describe('getFactorySupportedNetworks', () => {
  it('returns supported networks for v0.7 SimpleAccount factory', () => {
    const networks = getFactorySupportedNetworks(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07);
    expect(networks).toContain('ethereum-mainnet');
    expect(networks).toContain('base-mainnet');
    expect(networks).toContain('polygon-mainnet');
    expect(networks).toContain('arbitrum-mainnet');
    expect(networks).toContain('optimism-mainnet');
    expect(networks.length).toBeGreaterThanOrEqual(10);
  });

  it('returns limited networks for deprecated Solady factory', () => {
    const networks = getFactorySupportedNetworks(SOLADY_FACTORY_ADDRESS);
    expect(networks).toEqual(['ethereum-mainnet', 'ethereum-sepolia']);
  });

  it('returns empty array for unknown (custom) factory', () => {
    const networks = getFactorySupportedNetworks('0x0000000000000000000000000000000000000001');
    expect(networks).toEqual([]);
  });

  it('returns empty array for null factory address', () => {
    const networks = getFactorySupportedNetworks(null);
    expect(networks).toEqual([]);
  });

  it('is case-insensitive for factory address lookup', () => {
    const lower = getFactorySupportedNetworks(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07.toLowerCase());
    const upper = getFactorySupportedNetworks(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07.toUpperCase());
    expect(lower).toEqual(upper);
    expect(lower.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// FACTORY_SUPPORTED_NETWORKS constant
// ---------------------------------------------------------------------------

describe('FACTORY_SUPPORTED_NETWORKS', () => {
  it('contains v0.7 SimpleAccount factory', () => {
    const key = DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07.toLowerCase();
    expect(FACTORY_SUPPORTED_NETWORKS[key]).toBeDefined();
  });

  it('contains Solady factory', () => {
    const key = SOLADY_FACTORY_ADDRESS.toLowerCase();
    expect(FACTORY_SUPPORTED_NETWORKS[key]).toBeDefined();
  });

  it('all networks are valid format (chain-network pattern)', () => {
    for (const [, networks] of Object.entries(FACTORY_SUPPORTED_NETWORKS)) {
      for (const n of networks) {
        expect(n).toMatch(/^[a-z]+-[a-z]+$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Runtime Verification (eth_getCode cache)
// ---------------------------------------------------------------------------

describe('SmartAccountService.verifyFactoryOnNetwork', () => {
  let service: SmartAccountService;

  beforeEach(() => {
    service = new SmartAccountService();
  });

  it('returns true when factory has code deployed', async () => {
    const mockClient = { getCode: vi.fn().mockResolvedValue('0x608060') };
    const result = await service.verifyFactoryOnNetwork(
      DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07, 'ethereum-mainnet', mockClient,
    );
    expect(result).toBe(true);
    expect(mockClient.getCode).toHaveBeenCalledWith({
      address: DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07,
    });
  });

  it('returns false when factory has no code (0x)', async () => {
    const mockClient = { getCode: vi.fn().mockResolvedValue('0x') };
    const result = await service.verifyFactoryOnNetwork(
      DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07, 'ethereum-mainnet', mockClient,
    );
    expect(result).toBe(false);
  });

  it('returns null on RPC failure', async () => {
    const mockClient = { getCode: vi.fn().mockRejectedValue(new Error('RPC error')) };
    const result = await service.verifyFactoryOnNetwork(
      DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07, 'ethereum-mainnet', mockClient,
    );
    expect(result).toBe(null);
  });

  it('caches results and does not re-call RPC within TTL', async () => {
    const mockClient = { getCode: vi.fn().mockResolvedValue('0x608060') };

    // First call — hits RPC
    await service.verifyFactoryOnNetwork(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07, 'ethereum-mainnet', mockClient);
    expect(mockClient.getCode).toHaveBeenCalledTimes(1);

    // Second call — cached
    const result = await service.verifyFactoryOnNetwork(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07, 'ethereum-mainnet', mockClient);
    expect(result).toBe(true);
    expect(mockClient.getCode).toHaveBeenCalledTimes(1); // no additional call
  });

  it('separate cache keys for different networks', async () => {
    const mockClient = {
      getCode: vi.fn()
        .mockResolvedValueOnce('0x608060')
        .mockResolvedValueOnce('0x'),
    };

    const r1 = await service.verifyFactoryOnNetwork(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07, 'ethereum-mainnet', mockClient);
    const r2 = await service.verifyFactoryOnNetwork(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07, 'base-mainnet', mockClient);

    expect(r1).toBe(true);
    expect(r2).toBe(false);
    expect(mockClient.getCode).toHaveBeenCalledTimes(2);
  });

  it('clearExpiredCache removes stale entries', async () => {
    const mockClient = { getCode: vi.fn().mockResolvedValue('0x608060') };

    // Populate cache
    await service.verifyFactoryOnNetwork(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07, 'ethereum-mainnet', mockClient);
    expect(mockClient.getCode).toHaveBeenCalledTimes(1);

    // Manually expire the cache entry
    const cacheKey = `${DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07.toLowerCase()}:ethereum-mainnet`;
    (service as any)._verifyCache.set(cacheKey, { verified: true, timestamp: 0 }); // epoch = expired

    service.clearExpiredCache();

    // Next call should hit RPC again
    await service.verifyFactoryOnNetwork(DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07, 'ethereum-mainnet', mockClient);
    expect(mockClient.getCode).toHaveBeenCalledTimes(2);
  });
});
