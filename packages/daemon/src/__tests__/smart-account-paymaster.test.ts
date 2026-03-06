/**
 * Paymaster integration tests for smart account UserOperations.
 *
 * Tests:
 * - Paymaster sponsorship flow (configured vs not configured)
 * - Paymaster rejection error handling (PAYMASTER_REJECTED)
 * - Gas estimation safety margin (120% bigint arithmetic)
 * - Per-chain Paymaster URL resolution
 *
 * @see packages/daemon/src/pipeline/stages.ts (stage5ExecuteSmartAccount)
 * @see packages/daemon/src/infrastructure/smart-account/smart-account-clients.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock setup (hoisted) ---

const mockSendUserOperation = vi.fn().mockResolvedValue('0xuserophash123');
const mockWaitForUserOperationReceipt = vi.fn().mockResolvedValue({
  receipt: { transactionHash: '0xtxhash456' },
});
const mockPrepareUserOperation = vi.fn().mockResolvedValue({
  callGasLimit: 100000n,
  verificationGasLimit: 50000n,
  preVerificationGas: 21000n,
});

const mockCreateBundlerClient = vi.fn().mockReturnValue({
  sendUserOperation: (...args: unknown[]) => mockSendUserOperation(...args),
  waitForUserOperationReceipt: (...args: unknown[]) => mockWaitForUserOperationReceipt(...args),
  prepareUserOperation: (...args: unknown[]) => mockPrepareUserOperation(...args),
});
const mockCreatePaymasterClient = vi.fn().mockReturnValue({
  getPaymasterData: vi.fn(),
  getPaymasterStubData: vi.fn(),
});

vi.mock('permissionless/accounts', () => ({
  toSimpleSmartAccount: vi.fn().mockResolvedValue({
    address: '0xSmartAccountAddress1234567890abcdef12345678',
  }),
}));

vi.mock('viem/account-abstraction', () => ({
  createBundlerClient: (...args: unknown[]) => mockCreateBundlerClient(...args),
  createPaymasterClient: (...args: unknown[]) => mockCreatePaymasterClient(...args),
  entryPoint07Address: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  entryPoint07Abi: [{ type: 'function', name: 'handleOps' }],
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn().mockReturnValue({
    address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
  }),
}));

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    http: vi.fn().mockReturnValue({ type: 'http' }),
    createPublicClient: vi.fn().mockReturnValue({
      chain: { id: 11155111 },
      transport: { type: 'http' },
    }),
    toHex: (val: Uint8Array) => '0x' + Buffer.from(val).toString('hex'),
  };
});

// Mock AA provider crypto
vi.mock('../infrastructure/smart-account/aa-provider-crypto.js', () => ({
  decryptProviderApiKey: vi.fn().mockReturnValue('pk_test_mock_key'),
}));

import { stage5Execute } from '../pipeline/stages.js';
import {
  resolveWalletBundlerUrl,
  resolveWalletPaymasterUrl,
} from '../infrastructure/smart-account/smart-account-clients.js';
import type { WalletProviderData } from '../infrastructure/smart-account/smart-account-clients.js';
import { WAIaaSError } from '@waiaas/core';
import type { PipelineContext } from '../pipeline/stages.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const dbMock = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue({
            id: 'wallet-1',
            deployed: true,
            accountType: 'smart',
          }),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          run: vi.fn(),
        }),
      }),
    }),
  } as any;

  return {
    db: dbMock,
    adapter: {
      viemChain: { id: 11155111 },
      rpcUrl: 'https://sepolia.drpc.org',
    } as any,
    keyStore: {
      decryptPrivateKey: vi.fn().mockResolvedValue(new Uint8Array(32)),
      releaseKey: vi.fn(),
    } as any,
    policyEngine: {} as any,
    masterPassword: 'test-password',
    walletId: 'wallet-1',
    wallet: {
      publicKey: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chain: 'evm',
      environment: 'testnet',
      accountType: 'smart',
      aaProvider: 'pimlico',
      aaProviderApiKeyEncrypted: 'encrypted-mock-key',
      aaBundlerUrl: null,
      aaPaymasterUrl: null,
      aaPaymasterPolicyId: null,
    },
    resolvedNetwork: 'ethereum-sepolia',
    request: {
      type: 'TRANSFER' as const,
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amount: '1000000000000000000',
      network: 'ethereum-sepolia',
    },
    txId: 'tx-1',
    settingsService: {
      get: vi.fn(() => ''),
    } as any,
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Paymaster sponsorship flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendUserOperation.mockResolvedValue('0xuserophash123');
    mockWaitForUserOperationReceipt.mockResolvedValue({
      receipt: { transactionHash: '0xtxhash456' },
    });
    mockPrepareUserOperation.mockResolvedValue({
      callGasLimit: 100000n,
      verificationGasLimit: 50000n,
      preVerificationGas: 21000n,
    });
  });

  it('proceeds with Paymaster for preset provider (unified endpoint)', async () => {
    // Pimlico/alchemy uses unified endpoint: paymaster URL = bundler URL
    const ctx = createMockContext();

    await stage5Execute(ctx);

    // createPaymasterClient should have been called (unified endpoint for pimlico)
    expect(mockCreatePaymasterClient).toHaveBeenCalled();
    // createBundlerClient should have paymaster in options
    const bundlerArgs = mockCreateBundlerClient.mock.calls[0][0];
    expect(bundlerArgs).toHaveProperty('paymaster');
  });

  it('proceeds WITHOUT Paymaster when custom provider has no paymasterUrl', async () => {
    const ctx = createMockContext({
      wallet: {
        publicKey: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chain: 'evm',
        environment: 'testnet',
        accountType: 'smart',
        aaProvider: 'custom',
        aaProviderApiKeyEncrypted: null,
        aaBundlerUrl: 'https://bundler.example.com',
        aaPaymasterUrl: null,
      aaPaymasterPolicyId: null,
      },
    });

    await stage5Execute(ctx);

    // Transaction should still succeed (agent pays gas)
    expect(mockSendUserOperation).toHaveBeenCalledOnce();
    // createBundlerClient should NOT have paymaster in options
    const bundlerArgs = mockCreateBundlerClient.mock.calls[0][0];
    expect(bundlerArgs.paymaster).toBeUndefined();
  });
});

describe('Paymaster rejection error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareUserOperation.mockResolvedValue({
      callGasLimit: 100000n,
      verificationGasLimit: 50000n,
      preVerificationGas: 21000n,
    });
  });

  it('maps paymaster denial error to PAYMASTER_REJECTED', async () => {
    const paymasterError = new Error('paymaster denied: insufficient deposit');
    mockSendUserOperation.mockRejectedValueOnce(paymasterError);

    const ctx = createMockContext();

    try {
      await stage5Execute(ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('PAYMASTER_REJECTED');
      expect((err as WAIaaSError).message).toContain('paymaster denied');
    }
  });

  it('maps PM_ prefix error to PAYMASTER_REJECTED', async () => {
    const pmError = new Error('PM_DENIED: policy violation');
    mockSendUserOperation.mockRejectedValueOnce(pmError);

    const ctx = createMockContext();

    try {
      await stage5Execute(ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('PAYMASTER_REJECTED');
    }
  });

  it('maps generic RPC error to CHAIN_ERROR (not PAYMASTER_REJECTED)', async () => {
    const rpcError = new Error('RPC connection timeout');
    mockSendUserOperation.mockRejectedValueOnce(rpcError);

    const ctx = createMockContext();

    try {
      await stage5Execute(ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('CHAIN_ERROR');
      expect((err as WAIaaSError).code).not.toBe('PAYMASTER_REJECTED');
    }
  });
});

describe('gas safety margin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendUserOperation.mockResolvedValue('0xuserophash123');
    mockWaitForUserOperationReceipt.mockResolvedValue({
      receipt: { transactionHash: '0xtxhash456' },
    });
  });

  it('applies 120% safety margin to all gas fields from prepareUserOperation', async () => {
    mockPrepareUserOperation.mockResolvedValueOnce({
      callGasLimit: 100000n,
      verificationGasLimit: 50000n,
      preVerificationGas: 21000n,
    });

    const ctx = createMockContext();
    await stage5Execute(ctx);

    expect(mockPrepareUserOperation).toHaveBeenCalledOnce();
    const sendArgs = mockSendUserOperation.mock.calls[0][0];

    // Verify (estimated * 120n) / 100n bigint arithmetic
    expect(sendArgs.userOperation.callGasLimit).toBe((100000n * 120n) / 100n); // = 120000n
    expect(sendArgs.userOperation.verificationGasLimit).toBe((50000n * 120n) / 100n); // = 60000n
    expect(sendArgs.userOperation.preVerificationGas).toBe((21000n * 120n) / 100n); // = 25200n
  });

  it('handles non-round gas estimates correctly with bigint division', async () => {
    mockPrepareUserOperation.mockResolvedValueOnce({
      callGasLimit: 123456n,
      verificationGasLimit: 78901n,
      preVerificationGas: 45678n,
    });

    const ctx = createMockContext();
    await stage5Execute(ctx);

    const sendArgs = mockSendUserOperation.mock.calls[0][0];

    // Bigint arithmetic: (123456n * 120n) / 100n = 148147n (integer division)
    expect(sendArgs.userOperation.callGasLimit).toBe((123456n * 120n) / 100n);
    expect(sendArgs.userOperation.verificationGasLimit).toBe((78901n * 120n) / 100n);
    expect(sendArgs.userOperation.preVerificationGas).toBe((45678n * 120n) / 100n);
  });
});

describe('wallet-based URL resolution', () => {
  it('resolves bundler URL for preset provider (pimlico)', () => {
    const wallet: WalletProviderData = {
      aaProvider: 'pimlico',
      aaProviderApiKey: 'pk_test_key',
      aaBundlerUrl: null,
      aaPaymasterUrl: null,
      aaPaymasterPolicyId: null,
    };

    const url = resolveWalletBundlerUrl(wallet, 'ethereum-sepolia');
    expect(url).toContain('pimlico');
    expect(url).toContain('pk_test_key');
  });

  it('resolves paymaster URL as same as bundler for preset provider (unified endpoint)', () => {
    const wallet: WalletProviderData = {
      aaProvider: 'pimlico',
      aaProviderApiKey: 'pk_test_key',
      aaBundlerUrl: null,
      aaPaymasterUrl: null,
      aaPaymasterPolicyId: null,
    };

    const bundlerUrl = resolveWalletBundlerUrl(wallet, 'ethereum-sepolia');
    const paymasterUrl = resolveWalletPaymasterUrl(wallet, 'ethereum-sepolia');
    expect(paymasterUrl).toBe(bundlerUrl);
  });

  it('resolves custom bundler URL directly from wallet data', () => {
    const wallet: WalletProviderData = {
      aaProvider: 'custom',
      aaProviderApiKey: null,
      aaBundlerUrl: 'https://my-bundler.example.com',
      aaPaymasterUrl: null,
      aaPaymasterPolicyId: null,
    };

    const url = resolveWalletBundlerUrl(wallet, 'ethereum-sepolia');
    expect(url).toBe('https://my-bundler.example.com');
  });

  it('returns custom paymaster URL when configured', () => {
    const wallet: WalletProviderData = {
      aaProvider: 'custom',
      aaProviderApiKey: null,
      aaBundlerUrl: 'https://my-bundler.example.com',
      aaPaymasterUrl: 'https://my-paymaster.example.com',
      aaPaymasterPolicyId: null,
    };

    const url = resolveWalletPaymasterUrl(wallet, 'ethereum-sepolia');
    expect(url).toBe('https://my-paymaster.example.com');
  });

  it('returns null paymaster URL when custom provider has none', () => {
    const wallet: WalletProviderData = {
      aaProvider: 'custom',
      aaProviderApiKey: null,
      aaBundlerUrl: 'https://my-bundler.example.com',
      aaPaymasterUrl: null,
      aaPaymasterPolicyId: null,
    };

    const url = resolveWalletPaymasterUrl(wallet, 'ethereum-sepolia');
    expect(url).toBeNull();
  });
});
