/**
 * EvmIncomingSubscriber unit tests.
 *
 * Phase 225-02: IChainSubscriber interface compliance, ERC-20 Transfer detection
 * via getLogs, native ETH detection via getBlock(includeTransactions:true),
 * 10-block cap, per-wallet error isolation, and cursor management.
 *
 * All tests use mock viem client (no real network calls).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- Mock setup ----

const mockClient = {
  getBlockNumber: vi.fn(),
  getLogs: vi.fn(),
  getBlock: vi.fn(),
};

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockClient),
    // Keep parseAbiItem real since it's a pure function
    parseAbiItem: actual.parseAbiItem,
  };
});

import { EvmIncomingSubscriber } from '../evm-incoming-subscriber.js';

// ---- Test fixtures ----

const TEST_RPC_URL = 'https://rpc.test.com';
const TEST_WALLET_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28';
const TEST_SENDER_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';
const TEST_TOKEN_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC-like

let idCounter = 0;
const mockGenerateId = () => `test-id-${++idCounter}`;

// ---- Tests ----

describe('EvmIncomingSubscriber - IChainSubscriber interface', () => {
  let subscriber: EvmIncomingSubscriber;

  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    subscriber = new EvmIncomingSubscriber({
      rpcUrl: TEST_RPC_URL,
      generateId: mockGenerateId,
    });
  });

  it('chain property is "ethereum"', () => {
    expect(subscriber.chain).toBe('ethereum');
  });

  it('subscribe() adds wallet to subscriptions and fetches current block number', async () => {
    mockClient.getBlockNumber.mockResolvedValue(100n);

    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    expect(mockClient.getBlockNumber).toHaveBeenCalledOnce();
    expect(subscriber.subscribedWallets()).toEqual(['wallet-1']);
  });

  it('subscribe() is idempotent (second call with same walletId is no-op)', async () => {
    mockClient.getBlockNumber.mockResolvedValue(100n);

    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    expect(mockClient.getBlockNumber).toHaveBeenCalledOnce();
    expect(subscriber.subscribedWallets()).toEqual(['wallet-1']);
  });

  it('unsubscribe() removes wallet from subscriptions', async () => {
    mockClient.getBlockNumber.mockResolvedValue(100n);

    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', vi.fn());
    expect(subscriber.subscribedWallets()).toEqual(['wallet-1']);

    await subscriber.unsubscribe('wallet-1');
    expect(subscriber.subscribedWallets()).toEqual([]);
  });

  it('unsubscribe() is no-op for unknown walletId', async () => {
    await subscriber.unsubscribe('unknown-wallet');
    expect(subscriber.subscribedWallets()).toEqual([]);
  });

  it('subscribedWallets() returns current subscription IDs', async () => {
    mockClient.getBlockNumber.mockResolvedValue(100n);

    await subscriber.subscribe('wallet-a', TEST_WALLET_ADDRESS, 'ethereum-sepolia', vi.fn());
    await subscriber.subscribe('wallet-b', TEST_SENDER_ADDRESS, 'ethereum-mainnet', vi.fn());

    expect(subscriber.subscribedWallets()).toEqual(['wallet-a', 'wallet-b']);
  });

  it('connect() resolves immediately (no-op)', async () => {
    await expect(subscriber.connect()).resolves.toBeUndefined();
  });

  it('waitForDisconnect() returns a Promise that never resolves', async () => {
    const disconnectPromise = subscriber.waitForDisconnect();
    const SENTINEL = Symbol('sentinel');

    const result = await Promise.race([
      disconnectPromise,
      new Promise<typeof SENTINEL>((resolve) =>
        setTimeout(() => resolve(SENTINEL), 100),
      ),
    ]);

    expect(result).toBe(SENTINEL);
  });

  it('destroy() clears all subscriptions', async () => {
    mockClient.getBlockNumber.mockResolvedValue(100n);

    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', vi.fn());
    await subscriber.subscribe('wallet-2', TEST_SENDER_ADDRESS, 'ethereum-mainnet', vi.fn());
    expect(subscriber.subscribedWallets()).toHaveLength(2);

    await subscriber.destroy();
    expect(subscriber.subscribedWallets()).toEqual([]);
  });
});

describe('EvmIncomingSubscriber - pollAll ERC-20', () => {
  let subscriber: EvmIncomingSubscriber;

  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    subscriber = new EvmIncomingSubscriber({
      rpcUrl: TEST_RPC_URL,
      generateId: mockGenerateId,
    });
  });

  it('detects ERC-20 Transfer event and calls onTransaction with correct IncomingTransaction', async () => {
    // Subscribe at block 100
    mockClient.getBlockNumber.mockResolvedValueOnce(100n);
    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    // pollAll at block 105
    mockClient.getBlockNumber.mockResolvedValueOnce(105n);
    mockClient.getLogs.mockResolvedValueOnce([
      {
        transactionHash: '0xabc123',
        args: {
          from: TEST_SENDER_ADDRESS,
          to: TEST_WALLET_ADDRESS,
          value: 1000000n, // 1 USDC
        },
        address: TEST_TOKEN_ADDRESS,
        blockNumber: 103n,
      },
    ]);
    // No native ETH in these blocks
    for (let i = 0; i < 5; i++) {
      mockClient.getBlock.mockResolvedValueOnce({ transactions: [] });
    }

    await subscriber.pollAll();

    expect(onTransaction).toHaveBeenCalledOnce();
    const tx = onTransaction.mock.calls[0]![0];
    expect(tx).toMatchObject({
      id: 'test-id-1',
      txHash: '0xabc123',
      walletId: 'wallet-1',
      fromAddress: TEST_SENDER_ADDRESS,
      amount: '1000000',
      tokenAddress: TEST_TOKEN_ADDRESS,
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      status: 'DETECTED',
      blockNumber: 103,
      confirmedAt: null,
    });
    expect(typeof tx.detectedAt).toBe('number');
  });

  it('updates lastBlock cursor after successful poll', async () => {
    // Subscribe at block 100
    mockClient.getBlockNumber.mockResolvedValueOnce(100n);
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', vi.fn());

    // First poll at block 105
    mockClient.getBlockNumber.mockResolvedValueOnce(105n);
    mockClient.getLogs.mockResolvedValueOnce([]);
    for (let i = 0; i < 5; i++) {
      mockClient.getBlock.mockResolvedValueOnce({ transactions: [] });
    }
    await subscriber.pollAll();

    // Second poll at block 106
    mockClient.getBlockNumber.mockResolvedValueOnce(106n);
    mockClient.getLogs.mockResolvedValueOnce([]);
    mockClient.getBlock.mockResolvedValueOnce({ transactions: [] });
    await subscriber.pollAll();

    // getLogs should have been called with fromBlock:106n, toBlock:106n on second poll
    const secondCall = mockClient.getLogs.mock.calls[1]!;
    expect(secondCall[0]!).toMatchObject({
      fromBlock: 106n,
      toBlock: 106n,
    });
  });

  it('skips polling when no new blocks (lastBlock >= currentBlock)', async () => {
    // Subscribe at block 100
    mockClient.getBlockNumber.mockResolvedValueOnce(100n);
    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    // pollAll still at block 100
    mockClient.getBlockNumber.mockResolvedValueOnce(100n);
    await subscriber.pollAll();

    expect(mockClient.getLogs).not.toHaveBeenCalled();
    expect(mockClient.getBlock).not.toHaveBeenCalled();
    expect(onTransaction).not.toHaveBeenCalled();
  });
});

describe('EvmIncomingSubscriber - pollAll native ETH', () => {
  let subscriber: EvmIncomingSubscriber;

  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    subscriber = new EvmIncomingSubscriber({
      rpcUrl: TEST_RPC_URL,
      generateId: mockGenerateId,
    });
  });

  it('detects native ETH transfer and calls onTransaction with tokenAddress: null', async () => {
    // Subscribe at block 50
    mockClient.getBlockNumber.mockResolvedValueOnce(50n);
    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    // pollAll at block 51
    mockClient.getBlockNumber.mockResolvedValueOnce(51n);
    mockClient.getLogs.mockResolvedValueOnce([]); // no ERC-20
    mockClient.getBlock.mockResolvedValueOnce({
      transactions: [
        {
          hash: '0xdef456',
          from: TEST_SENDER_ADDRESS,
          to: TEST_WALLET_ADDRESS,
          value: 1000000000000000000n, // 1 ETH
        },
      ],
    });

    await subscriber.pollAll();

    expect(onTransaction).toHaveBeenCalledOnce();
    const tx = onTransaction.mock.calls[0]![0];
    expect(tx).toMatchObject({
      id: 'test-id-1',
      txHash: '0xdef456',
      walletId: 'wallet-1',
      fromAddress: TEST_SENDER_ADDRESS,
      amount: '1000000000000000000',
      tokenAddress: null,
      chain: 'ethereum',
      network: 'ethereum-sepolia',
      status: 'DETECTED',
      blockNumber: 51,
      confirmedAt: null,
    });
  });

  it('skips string-only transactions (typeof tx === "string")', async () => {
    mockClient.getBlockNumber.mockResolvedValueOnce(50n);
    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    mockClient.getBlockNumber.mockResolvedValueOnce(51n);
    mockClient.getLogs.mockResolvedValueOnce([]);
    mockClient.getBlock.mockResolvedValueOnce({
      transactions: [
        '0xhash_string_only', // hash-only without includeTransactions
      ],
    });

    await subscriber.pollAll();
    expect(onTransaction).not.toHaveBeenCalled();
  });

  it('skips transactions with value === 0n', async () => {
    mockClient.getBlockNumber.mockResolvedValueOnce(50n);
    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    mockClient.getBlockNumber.mockResolvedValueOnce(51n);
    mockClient.getLogs.mockResolvedValueOnce([]);
    mockClient.getBlock.mockResolvedValueOnce({
      transactions: [
        {
          hash: '0xzero',
          from: TEST_SENDER_ADDRESS,
          to: TEST_WALLET_ADDRESS,
          value: 0n,
        },
      ],
    });

    await subscriber.pollAll();
    expect(onTransaction).not.toHaveBeenCalled();
  });

  it('skips transactions where tx.to does not match wallet address', async () => {
    mockClient.getBlockNumber.mockResolvedValueOnce(50n);
    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    mockClient.getBlockNumber.mockResolvedValueOnce(51n);
    mockClient.getLogs.mockResolvedValueOnce([]);
    mockClient.getBlock.mockResolvedValueOnce({
      transactions: [
        {
          hash: '0xother',
          from: TEST_SENDER_ADDRESS,
          to: '0x0000000000000000000000000000000000000000', // different address
          value: 1000n,
        },
      ],
    });

    await subscriber.pollAll();
    expect(onTransaction).not.toHaveBeenCalled();
  });

  it('handles case-insensitive address matching', async () => {
    mockClient.getBlockNumber.mockResolvedValueOnce(50n);
    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    mockClient.getBlockNumber.mockResolvedValueOnce(51n);
    mockClient.getLogs.mockResolvedValueOnce([]);
    mockClient.getBlock.mockResolvedValueOnce({
      transactions: [
        {
          hash: '0xcase',
          from: TEST_SENDER_ADDRESS,
          to: TEST_WALLET_ADDRESS.toLowerCase(), // lower case
          value: 500n,
        },
      ],
    });

    await subscriber.pollAll();
    expect(onTransaction).toHaveBeenCalledOnce();
  });
});

describe('EvmIncomingSubscriber - pollAll resilience', () => {
  let subscriber: EvmIncomingSubscriber;

  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    subscriber = new EvmIncomingSubscriber({
      rpcUrl: TEST_RPC_URL,
      generateId: mockGenerateId,
    });
  });

  it('caps block range at 10 blocks per poll cycle', async () => {
    // Subscribe at block 100
    mockClient.getBlockNumber.mockResolvedValueOnce(100n);
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', vi.fn());

    // pollAll: currentBlock is 120 (20 blocks behind), should only poll 10
    mockClient.getBlockNumber.mockResolvedValueOnce(120n);
    mockClient.getLogs.mockResolvedValueOnce([]);
    // Should request getBlock for blocks 101-110 (10 blocks)
    for (let i = 0; i < 10; i++) {
      mockClient.getBlock.mockResolvedValueOnce({ transactions: [] });
    }

    await subscriber.pollAll();

    // getLogs should be called with fromBlock:101n, toBlock:110n (capped at 10)
    expect(mockClient.getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 101n,
        toBlock: 110n,
      }),
    );

    // getBlock should be called 10 times (blocks 101-110)
    expect(mockClient.getBlock).toHaveBeenCalledTimes(10);
  });

  it('per-wallet error isolation: one wallet failure does not affect others', async () => {
    // Subscribe two wallets at block 100
    mockClient.getBlockNumber.mockResolvedValueOnce(100n);
    const onTx1 = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTx1);

    mockClient.getBlockNumber.mockResolvedValueOnce(100n);
    const onTx2 = vi.fn();
    await subscriber.subscribe('wallet-2', TEST_SENDER_ADDRESS, 'ethereum-mainnet', onTx2);

    // pollAll at block 101
    mockClient.getBlockNumber.mockResolvedValueOnce(101n);

    // First wallet: getLogs throws error
    mockClient.getLogs.mockRejectedValueOnce(new Error('RPC timeout'));

    // Second wallet: getLogs returns a transfer
    mockClient.getLogs.mockResolvedValueOnce([
      {
        transactionHash: '0xsecondwallet',
        args: {
          from: TEST_WALLET_ADDRESS,
          to: TEST_SENDER_ADDRESS,
          value: 500n,
        },
        address: TEST_TOKEN_ADDRESS,
        blockNumber: 101n,
      },
    ]);
    // Second wallet: getBlock for native ETH
    mockClient.getBlock.mockResolvedValueOnce({ transactions: [] });

    // Suppress console.warn during test
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await subscriber.pollAll();
    warnSpy.mockRestore();

    // wallet-1 should not have received any transactions (it threw)
    expect(onTx1).not.toHaveBeenCalled();

    // wallet-2 should have received the ERC-20 transfer
    expect(onTx2).toHaveBeenCalledOnce();
    expect(onTx2.mock.calls[0]![0]).toMatchObject({
      txHash: '0xsecondwallet',
      walletId: 'wallet-2',
    });
  });

  it('handles getLogs returning empty array gracefully', async () => {
    mockClient.getBlockNumber.mockResolvedValueOnce(100n);
    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    mockClient.getBlockNumber.mockResolvedValueOnce(101n);
    mockClient.getLogs.mockResolvedValueOnce([]);
    mockClient.getBlock.mockResolvedValueOnce({ transactions: [] });

    await subscriber.pollAll();

    expect(onTransaction).not.toHaveBeenCalled();
  });

  it('detects both ERC-20 and native ETH in the same poll cycle', async () => {
    mockClient.getBlockNumber.mockResolvedValueOnce(100n);
    const onTransaction = vi.fn();
    await subscriber.subscribe('wallet-1', TEST_WALLET_ADDRESS, 'ethereum-sepolia', onTransaction);

    mockClient.getBlockNumber.mockResolvedValueOnce(101n);

    // ERC-20 transfer
    mockClient.getLogs.mockResolvedValueOnce([
      {
        transactionHash: '0xerc20tx',
        args: {
          from: TEST_SENDER_ADDRESS,
          to: TEST_WALLET_ADDRESS,
          value: 2000000n,
        },
        address: TEST_TOKEN_ADDRESS,
        blockNumber: 101n,
      },
    ]);

    // Native ETH transfer in same block
    mockClient.getBlock.mockResolvedValueOnce({
      transactions: [
        {
          hash: '0xnatvetx',
          from: TEST_SENDER_ADDRESS,
          to: TEST_WALLET_ADDRESS,
          value: 5000000000000000000n,
        },
      ],
    });

    await subscriber.pollAll();

    expect(onTransaction).toHaveBeenCalledTimes(2);
    // First call: ERC-20
    expect(onTransaction.mock.calls[0]![0]).toMatchObject({
      tokenAddress: TEST_TOKEN_ADDRESS,
      txHash: '0xerc20tx',
    });
    // Second call: native ETH
    expect(onTransaction.mock.calls[1]![0]).toMatchObject({
      tokenAddress: null,
      txHash: '0xnatvetx',
    });
  });
});
