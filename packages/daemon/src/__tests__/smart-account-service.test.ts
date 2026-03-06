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

import { SmartAccountService, DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07 } from '../infrastructure/smart-account/smart-account-service.js';

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
