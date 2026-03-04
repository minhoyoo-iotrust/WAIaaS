/**
 * Smart account BATCH atomic execution, lazy deployment, and ActionProvider tests.
 *
 * Tests:
 * - BATCH instructions map to single UserOperation calls[] array
 * - Wallet deployed status updates after first UserOp (lazy deployment)
 * - ActionProvider CONTRACT_CALL output converts to UserOp call entry
 * - buildUserOpCalls handles BATCH with mixed instruction types
 *
 * @see packages/daemon/src/pipeline/stages.ts (buildUserOpCalls, stage5ExecuteSmartAccount)
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
import type { PipelineContext } from '../pipeline/stages.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  let deployedStatus = overrides.wallet?.accountType === 'smart' ? false : true;

  const dbMock = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn(() => ({
            id: 'wallet-1',
            deployed: deployedStatus,
            accountType: 'smart',
          })),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          run: vi.fn(() => {
            deployedStatus = true; // Track deployed update
          }),
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
      type: 'BATCH' as const,
      instructions: [
        { to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', amount: '1000000000000000000' },
        {
          to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          calldata: '0xdeadbeef',
          value: '0',
        },
      ],
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

describe('BATCH atomic execution', () => {
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

  it('submits BATCH with APPROVE+CONTRACT_CALL as single UserOperation with 2 calls', () => {
    const calls = buildUserOpCalls({
      type: 'BATCH' as const,
      instructions: [
        {
          spender: '0xcccccccccccccccccccccccccccccccccccccccc',
          token: { address: '0xdddddddddddddddddddddddddddddddddddddddd', decimals: 6 },
          amount: '1000000',
        },
        {
          to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          calldata: '0xabcdef01',
          value: '0',
        },
      ],
      network: 'ethereum-sepolia',
    } as any);

    expect(calls).toHaveLength(2);
    // First call: approve
    expect(calls[0].to).toBe('0xdddddddddddddddddddddddddddddddddddddddd');
    expect(calls[0].value).toBe(0n);
    expect(calls[0].data).toContain('0x095ea7b3'); // approve selector
    // Second call: contract call
    expect(calls[1].to).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(calls[1].value).toBe(0n);
    expect(calls[1].data).toBe('0xabcdef01');
  });

  it('submits BATCH with 3 mixed instructions (TRANSFER+TOKEN_TRANSFER+CONTRACT_CALL)', () => {
    const calls = buildUserOpCalls({
      type: 'BATCH' as const,
      instructions: [
        { to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', amount: '100' },
        {
          to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          amount: '500',
          token: { address: '0xdddddddddddddddddddddddddddddddddddddddd' },
        },
        { to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', calldata: '0xdeadbeef', value: '0' },
      ],
      network: 'ethereum-sepolia',
    } as any);

    expect(calls).toHaveLength(3);
    // TRANSFER: native value
    expect(calls[0].to).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(calls[0].value).toBe(100n);
    expect(calls[0].data).toBe('0x');
    // TOKEN_TRANSFER: ERC-20 transfer calldata
    expect(calls[1].to).toBe('0xdddddddddddddddddddddddddddddddddddddddd');
    expect(calls[1].value).toBe(0n);
    expect(calls[1].data).toContain('0xa9059cbb'); // transfer selector
    // CONTRACT_CALL: raw calldata
    expect(calls[2].to).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(calls[2].data).toBe('0xdeadbeef');
  });

  it('submits single UserOperation for BATCH via smart account pipeline', async () => {
    const ctx = createMockContext();
    await stage5Execute(ctx);

    expect(mockSendUserOperation).toHaveBeenCalledOnce();
    const sendArgs = mockSendUserOperation.mock.calls[0][0];
    expect(sendArgs.calls).toHaveLength(2);
  });
});

describe('lazy deployment', () => {
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

  it('updates deployed status from false to true after first successful UserOp', async () => {
    // Create a context with explicit undeployed wallet (deployed=false)
    const undeployedDbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'wallet-1',
              deployed: false, // Undeployed smart account
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

    const ctx = createMockContext({ db: undeployedDbMock });
    await stage5Execute(ctx);

    // Check that db.update was called 3 times: SUBMITTED, CONFIRMED, deployed update
    const updateCalls = undeployedDbMock.update.mock.calls;
    expect(updateCalls).toHaveLength(3);
  });

  it('does NOT update deployed column when wallet is already deployed', async () => {
    const deployedDbMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'wallet-1',
              deployed: true, // Already deployed
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

    const ctx = createMockContext({ db: deployedDbMock });
    await stage5Execute(ctx);

    // DB update calls: SUBMITTED + CONFIRMED = 2 (no deployed update)
    const updateCalls = deployedDbMock.update.mock.calls;
    expect(updateCalls).toHaveLength(2);
  });
});

describe('ActionProvider conversion', () => {
  it('converts ActionProvider CONTRACT_CALL output to UserOp call entry', () => {
    const calls = buildUserOpCalls({
      type: 'CONTRACT_CALL' as const,
      to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      calldata: '0x23b872dd000000000000000000000000aabbccdd',
      value: '0',
      network: 'ethereum-sepolia',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      value: 0n,
      data: '0x23b872dd000000000000000000000000aabbccdd',
    });
  });

  it('converts ActionProvider output in BATCH instructions', () => {
    const calls = buildUserOpCalls({
      type: 'BATCH' as const,
      instructions: [
        {
          to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          calldata: '0x23b872dd000000000000000000000000aabbccdd',
          value: '100',
        },
      ],
      network: 'ethereum-sepolia',
    } as any);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      to: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      value: 100n,
      data: '0x23b872dd000000000000000000000000aabbccdd',
    });
  });
});
