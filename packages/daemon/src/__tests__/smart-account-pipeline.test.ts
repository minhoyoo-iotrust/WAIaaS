/**
 * Smart account pipeline integration tests.
 *
 * Tests the stage5Execute accountType branching:
 * - Smart account path: UserOperation submission via BundlerClient
 * - EOA path: unchanged sign+sendTransaction
 * - Error mapping: UserOperationReverted, timeout, paymaster rejection
 *
 * @see packages/daemon/src/pipeline/stages.ts (stage5ExecuteSmartAccount)
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

vi.mock('viem/account-abstraction', () => ({
  createBundlerClient: vi.fn().mockReturnValue({
    sendUserOperation: (...args: unknown[]) => mockSendUserOperation(...args),
    waitForUserOperationReceipt: (...args: unknown[]) => mockWaitForUserOperationReceipt(...args),
    prepareUserOperation: (...args: unknown[]) => mockPrepareUserOperation(...args),
  }),
  createPaymasterClient: vi.fn().mockReturnValue({
    getPaymasterData: vi.fn(),
    getPaymasterStubData: vi.fn(),
  }),
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

import { buildUserOpCalls, stage5Execute } from '../pipeline/stages.js';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stage5Execute smart account path', () => {
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

  it('routes smart account TRANSFER to UserOp path', async () => {
    const ctx = createMockContext();
    await stage5Execute(ctx);

    expect(mockSendUserOperation).toHaveBeenCalledOnce();
    const sendArgs = mockSendUserOperation.mock.calls[0][0];
    expect(sendArgs.calls).toEqual([{
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      value: 1000000000000000000n,
      data: '0x',
    }]);
  });

  it('routes smart account TOKEN_TRANSFER to UserOp path with ERC-20 transfer calldata', async () => {
    const ctx = createMockContext({
      request: {
        type: 'TOKEN_TRANSFER' as const,
        to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        amount: '1000000',
        token: { address: '0xdddddddddddddddddddddddddddddddddddddddd', decimals: 6, symbol: 'USDC' },
        network: 'ethereum-sepolia',
      },
    });
    await stage5Execute(ctx);

    expect(mockSendUserOperation).toHaveBeenCalledOnce();
    const sendArgs = mockSendUserOperation.mock.calls[0][0];
    expect(sendArgs.calls).toHaveLength(1);
    expect(sendArgs.calls[0].to).toBe('0xdddddddddddddddddddddddddddddddddddddddd');
    expect(sendArgs.calls[0].value).toBe(0n);
    // data should be ERC-20 transfer encoded
    expect(sendArgs.calls[0].data).toContain('0xa9059cbb'); // transfer function selector
  });

  it('routes smart account CONTRACT_CALL to UserOp path', async () => {
    const ctx = createMockContext({
      request: {
        type: 'CONTRACT_CALL' as const,
        to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        calldata: '0xdeadbeef',
        value: '1000',
        network: 'ethereum-sepolia',
      },
    });
    await stage5Execute(ctx);

    expect(mockSendUserOperation).toHaveBeenCalledOnce();
    const sendArgs = mockSendUserOperation.mock.calls[0][0];
    expect(sendArgs.calls).toEqual([{
      to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      value: 1000n,
      data: '0xdeadbeef',
    }]);
  });

  it('routes smart account APPROVE to UserOp path with ERC-20 approve calldata', async () => {
    const ctx = createMockContext({
      request: {
        type: 'APPROVE' as const,
        spender: '0xcccccccccccccccccccccccccccccccccccccccc',
        amount: '1000000',
        token: { address: '0xdddddddddddddddddddddddddddddddddddddddd', decimals: 6, symbol: 'USDC' },
        network: 'ethereum-sepolia',
      },
    });
    await stage5Execute(ctx);

    expect(mockSendUserOperation).toHaveBeenCalledOnce();
    const sendArgs = mockSendUserOperation.mock.calls[0][0];
    expect(sendArgs.calls).toHaveLength(1);
    expect(sendArgs.calls[0].to).toBe('0xdddddddddddddddddddddddddddddddddddddddd');
    expect(sendArgs.calls[0].value).toBe(0n);
    expect(sendArgs.calls[0].data).toContain('0x095ea7b3'); // approve function selector
  });

  it('awaits receipt with 120s timeout', async () => {
    const ctx = createMockContext();
    await stage5Execute(ctx);

    expect(mockWaitForUserOperationReceipt).toHaveBeenCalledWith({
      hash: '0xuserophash123',
      timeout: 120_000,
    });
  });

  it('updates DB to SUBMITTED then CONFIRMED', async () => {
    const ctx = createMockContext();
    await stage5Execute(ctx);

    const updateCalls = ctx.db.update.mock.calls;
    // Should have at least 2 updates: SUBMITTED and CONFIRMED
    expect(updateCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('applies 120% gas safety margin', async () => {
    const ctx = createMockContext();
    await stage5Execute(ctx);

    expect(mockPrepareUserOperation).toHaveBeenCalledOnce();
    const sendArgs = mockSendUserOperation.mock.calls[0][0];
    // callGasLimit: (100000n * 120n) / 100n = 120000n
    expect(sendArgs.userOperation.callGasLimit).toBe(120000n);
    // verificationGasLimit: (50000n * 120n) / 100n = 60000n
    expect(sendArgs.userOperation.verificationGasLimit).toBe(60000n);
    // preVerificationGas: (21000n * 120n) / 100n = 25200n
    expect(sendArgs.userOperation.preVerificationGas).toBe(25200n);
  });
});

describe('stage5Execute EOA path unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT call sendUserOperation for EOA wallet', async () => {
    const ctx = createMockContext({
      wallet: {
        publicKey: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chain: 'evm',
        environment: 'testnet',
        accountType: 'eoa',
      },
    });

    // EOA path will try buildByType which needs adapter methods, so we expect it to throw
    // but NOT call sendUserOperation
    try {
      await stage5Execute(ctx);
    } catch {
      // Expected -- EOA path needs adapter.buildTransaction which isn't fully mocked
    }

    expect(mockSendUserOperation).not.toHaveBeenCalled();
  });

  it('does NOT call sendUserOperation when accountType is undefined', async () => {
    const ctx = createMockContext({
      wallet: {
        publicKey: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chain: 'evm',
        environment: 'testnet',
      },
    });

    try {
      await stage5Execute(ctx);
    } catch {
      // Expected -- EOA path needs adapter methods
    }

    expect(mockSendUserOperation).not.toHaveBeenCalled();
  });
});

describe('error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareUserOperation.mockResolvedValue({
      callGasLimit: 100000n,
      verificationGasLimit: 50000n,
      preVerificationGas: 21000n,
    });
  });

  it('maps UserOperationReverted to TRANSACTION_REVERTED', async () => {
    const revertedError = new Error('UserOperation reverted during execution');
    revertedError.name = 'UserOperationReverted';
    mockSendUserOperation.mockRejectedValueOnce(revertedError);

    const ctx = createMockContext();

    await expect(stage5Execute(ctx)).rejects.toThrow(WAIaaSError);
    try {
      await stage5Execute(ctx);
    } catch (_err) {
      // Reset mock for second call
    }
    // First call threw
    mockSendUserOperation.mockRejectedValueOnce(revertedError);
    try {
      const ctx2 = createMockContext();
      await stage5Execute(ctx2);
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('TRANSACTION_REVERTED');
    }
  });

  it('maps receipt timeout to TRANSACTION_TIMEOUT', async () => {
    mockSendUserOperation.mockResolvedValue('0xuserophash123');
    const timeoutError = new Error('Timed out waiting for UserOperation receipt');
    timeoutError.name = 'WaitForUserOperationReceiptTimeoutError';
    mockWaitForUserOperationReceipt.mockRejectedValueOnce(timeoutError);

    const ctx = createMockContext();

    try {
      await stage5Execute(ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('TRANSACTION_TIMEOUT');
    }
  });

  it('maps paymaster rejection to PAYMASTER_REJECTED', async () => {
    const paymasterError = new Error('paymaster denied: insufficient deposit');
    mockPrepareUserOperation.mockRejectedValueOnce(paymasterError);

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
    const rpcError = new Error('RPC connection failed');
    mockPrepareUserOperation.mockRejectedValueOnce(rpcError);

    const ctx = createMockContext();

    try {
      await stage5Execute(ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('CHAIN_ERROR');
    }
  });
});

describe('buildUserOpCalls', () => {
  it('builds TRANSFER calls correctly', () => {
    const calls = buildUserOpCalls({
      type: 'TRANSFER' as const,
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amount: '1000000000000000000',
      network: 'ethereum-sepolia',
    });

    expect(calls).toEqual([{
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      value: 1000000000000000000n,
      data: '0x',
    }]);
  });

  it('builds CONTRACT_CALL calls correctly', () => {
    const calls = buildUserOpCalls({
      type: 'CONTRACT_CALL' as const,
      to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      calldata: '0xdeadbeef',
      value: '500',
      network: 'ethereum-sepolia',
    });

    expect(calls).toEqual([{
      to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      value: 500n,
      data: '0xdeadbeef',
    }]);
  });

  it('builds BATCH calls with multiple instructions', () => {
    const calls = buildUserOpCalls({
      type: 'BATCH' as const,
      instructions: [
        { to: '0xffffffffffffffffffffffffffffffffffffffff', amount: '100' },
        { to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', calldata: '0xdeadbeef', value: '0' },
      ],
      network: 'ethereum-sepolia',
    } as any);

    expect(calls).toHaveLength(2);
    expect(calls[0].to).toBe('0xffffffffffffffffffffffffffffffffffffffff');
    expect(calls[0].value).toBe(100n);
    expect(calls[0].data).toBe('0x');
    expect(calls[1].to).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(calls[1].value).toBe(0n);
    expect(calls[1].data).toBe('0xdeadbeef');
  });
});
