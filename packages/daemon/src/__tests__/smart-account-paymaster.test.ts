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

vi.mock('viem/account-abstraction', () => ({
  createBundlerClient: (...args: unknown[]) => mockCreateBundlerClient(...args),
  createPaymasterClient: (...args: unknown[]) => mockCreatePaymasterClient(...args),
  toSoladySmartAccount: vi.fn().mockResolvedValue({
    address: '0xSmartAccountAddress1234567890abcdef12345678',
  }),
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

import { stage5Execute } from '../pipeline/stages.js';
import {
  resolveBundlerUrl,
  resolvePaymasterUrl,
  createSmartAccountBundlerClient,
} from '../infrastructure/smart-account/smart-account-clients.js';
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
      get: vi.fn((key: string) => {
        if (key === 'smart_account.bundler_url') return 'https://bundler.example.com';
        if (key === 'smart_account.paymaster_url') return '';
        if (key.startsWith('smart_account.bundler_url.')) return '';
        if (key.startsWith('smart_account.paymaster_url.')) return '';
        return '';
      }),
    } as any,
    ...overrides,
  } as any;
}

function mockSettingsService(overrides: Record<string, string> = {}) {
  return {
    get: vi.fn((key: string) => {
      if (key in overrides) return overrides[key];
      return '';
    }),
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

  it('proceeds with Paymaster when paymaster_url is configured', async () => {
    const ctx = createMockContext({
      settingsService: {
        get: vi.fn((key: string) => {
          if (key === 'smart_account.bundler_url') return 'https://bundler.example.com';
          if (key === 'smart_account.paymaster_url') return 'https://paymaster.example.com';
          if (key.startsWith('smart_account.bundler_url.')) return '';
          if (key.startsWith('smart_account.paymaster_url.')) return '';
          return '';
        }),
      } as any,
    });

    await stage5Execute(ctx);

    // createPaymasterClient should have been called
    expect(mockCreatePaymasterClient).toHaveBeenCalled();
    // createBundlerClient should have paymaster in options
    const bundlerArgs = mockCreateBundlerClient.mock.calls[0][0];
    expect(bundlerArgs).toHaveProperty('paymaster');
  });

  it('proceeds WITHOUT Paymaster when paymaster_url is not configured', async () => {
    const ctx = createMockContext();
    // Default settingsService returns '' for paymaster_url

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

describe('per-chain Paymaster URL resolution', () => {
  it('uses chain-specific paymaster URL when available', () => {
    const settings = mockSettingsService({
      'smart_account.paymaster_url.ethereum-sepolia': 'https://sepolia-pm.example.com',
      'smart_account.paymaster_url': 'https://default-pm.example.com',
    });

    const url = resolvePaymasterUrl(settings, 'ethereum-sepolia');
    expect(url).toBe('https://sepolia-pm.example.com');
  });

  it('falls back to default paymaster URL when chain-specific is not set', () => {
    const settings = mockSettingsService({
      'smart_account.paymaster_url.ethereum-sepolia': '',
      'smart_account.paymaster_url': 'https://default-pm.example.com',
    });

    const url = resolvePaymasterUrl(settings, 'ethereum-sepolia');
    expect(url).toBe('https://default-pm.example.com');
  });

  it('uses chain-specific bundler URL when available', () => {
    const settings = mockSettingsService({
      'smart_account.bundler_url.ethereum-sepolia': 'https://sepolia-bundler.example.com',
      'smart_account.bundler_url': 'https://default-bundler.example.com',
    });

    const url = resolveBundlerUrl(settings, 'ethereum-sepolia');
    expect(url).toBe('https://sepolia-bundler.example.com');
  });

  it('falls back to default bundler URL when chain-specific is not set', () => {
    const settings = mockSettingsService({
      'smart_account.bundler_url.ethereum-sepolia': '',
      'smart_account.bundler_url': 'https://default-bundler.example.com',
    });

    const url = resolveBundlerUrl(settings, 'ethereum-sepolia');
    expect(url).toBe('https://default-bundler.example.com');
  });
});
