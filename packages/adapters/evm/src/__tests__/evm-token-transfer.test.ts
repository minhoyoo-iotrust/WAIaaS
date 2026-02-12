/**
 * EvmAdapter ERC-20 token transfer tests.
 *
 * Phase 78-02 tests: buildTokenTransfer with ERC-20 transfer calldata,
 * getAssets ERC-20 multicall expansion, setAllowedTokens.
 *
 * Tests follow the established vi.mock('viem') pattern from evm-adapter.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChainError } from '@waiaas/core';
import { EvmAdapter } from '../adapter.js';
import { ERC20_ABI } from '../abi/erc20.js';

// ---- viem mock setup ----

const mockClient = {
  getBlockNumber: vi.fn(),
  getBalance: vi.fn(),
  getTransactionCount: vi.fn(),
  estimateGas: vi.fn(),
  estimateFeesPerGas: vi.fn(),
  call: vi.fn(),
  sendRawTransaction: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  multicall: vi.fn(),
  chain: { id: 1 },
};

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockClient),
    serializeTransaction: vi.fn(() => '0xf8deadbeef'),
    parseTransaction: vi.fn(() => ({
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
      value: 0n,
      nonce: 5,
      gas: 78000n,
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
      chainId: 1,
      type: 'eip1559' as const,
    })),
    hexToBytes: vi.fn((hex: string) => {
      const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < clean.length; i += 2) {
        bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
      }
      return bytes;
    }),
    toHex: vi.fn((bytes: Uint8Array) => {
      return '0x' + Buffer.from(bytes).toString('hex');
    }),
    encodeFunctionData: vi.fn(() => '0xtransferdata'),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    signTransaction: vi.fn(async () => '0xsigned_tx_hex_data'),
  })),
}));

// ---- Helpers ----

const TEST_ADDRESS_FROM = '0x1234567890abcdef1234567890abcdef12345678';
const TEST_ADDRESS_TO = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28';
const TEST_TOKEN_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const TEST_TOKEN_B = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const TEST_TOKEN_C = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

// ---- Tests ----

describe('EvmAdapter buildTokenTransfer', () => {
  let adapter: EvmAdapter;

  beforeEach(async () => {
    adapter = new EvmAdapter('mainnet');
    vi.clearAllMocks();
    mockClient.chain = { id: 1 };
    await adapter.connect('https://eth-mainnet.example.com');
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  it('returns UnsignedTransaction with correct chain, serialized bytes, and metadata', async () => {
    mockClient.getTransactionCount.mockResolvedValue(5);
    mockClient.estimateFeesPerGas.mockResolvedValue({
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    mockClient.estimateGas.mockResolvedValue(65000n);

    const result = await adapter.buildTokenTransfer({
      from: TEST_ADDRESS_FROM,
      to: TEST_ADDRESS_TO,
      amount: 1000000n,
      token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
    });

    expect(result.chain).toBe('ethereum');
    expect(result.serialized).toBeInstanceOf(Uint8Array);
    expect(result.nonce).toBe(5);
    expect(result.metadata.nonce).toBe(5);
    expect(result.metadata.chainId).toBe(1);
    expect(result.metadata.type).toBe('eip1559');
    expect(result.expiresAt).toBeUndefined();
  });

  it('targets token contract address (not recipient)', async () => {
    mockClient.getTransactionCount.mockResolvedValue(0);
    mockClient.estimateFeesPerGas.mockResolvedValue({
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    mockClient.estimateGas.mockResolvedValue(65000n);

    const { serializeTransaction: mockSerialize } = await import('viem');

    await adapter.buildTokenTransfer({
      from: TEST_ADDRESS_FROM,
      to: TEST_ADDRESS_TO,
      amount: 1000000n,
      token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
    });

    expect(mockSerialize).toHaveBeenCalled();
    const callArgs = (mockSerialize as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    // TX goes to token contract, not the recipient
    expect(callArgs.to).toBe(TEST_TOKEN_ADDRESS);
  });

  it('has value=0n (ERC-20 transfer carries no ETH)', async () => {
    mockClient.getTransactionCount.mockResolvedValue(0);
    mockClient.estimateFeesPerGas.mockResolvedValue({
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    mockClient.estimateGas.mockResolvedValue(65000n);

    const { serializeTransaction: mockSerialize } = await import('viem');

    await adapter.buildTokenTransfer({
      from: TEST_ADDRESS_FROM,
      to: TEST_ADDRESS_TO,
      amount: 1000000n,
      token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
    });

    const callArgs = (mockSerialize as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.value).toBe(0n);
  });

  it('applies 1.2x gas safety margin', async () => {
    mockClient.getTransactionCount.mockResolvedValue(0);
    mockClient.estimateFeesPerGas.mockResolvedValue({
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    mockClient.estimateGas.mockResolvedValue(65000n);

    const result = await adapter.buildTokenTransfer({
      from: TEST_ADDRESS_FROM,
      to: TEST_ADDRESS_TO,
      amount: 1000000n,
      token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
    });

    // 65000 * 120 / 100 = 78000
    expect(result.metadata.gasLimit).toBe(78000n);
    // estimatedFee = 78000 * 30000000000 = 2340000000000000
    expect(result.estimatedFee).toBe(78000n * 30000000000n);
  });

  it('metadata includes tokenAddress, recipient, tokenAmount', async () => {
    mockClient.getTransactionCount.mockResolvedValue(3);
    mockClient.estimateFeesPerGas.mockResolvedValue({
      maxFeePerGas: 25000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    mockClient.estimateGas.mockResolvedValue(65000n);

    const result = await adapter.buildTokenTransfer({
      from: TEST_ADDRESS_FROM,
      to: TEST_ADDRESS_TO,
      amount: 5000000n,
      token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
    });

    expect(result.metadata.tokenAddress).toBe(TEST_TOKEN_ADDRESS);
    expect(result.metadata.recipient).toBe(TEST_ADDRESS_TO);
    expect(result.metadata.tokenAmount).toBe(5000000n);
  });

  it('calls encodeFunctionData with ERC20_ABI transfer function', async () => {
    mockClient.getTransactionCount.mockResolvedValue(0);
    mockClient.estimateFeesPerGas.mockResolvedValue({
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    mockClient.estimateGas.mockResolvedValue(65000n);

    const { encodeFunctionData: mockEncode } = await import('viem');

    await adapter.buildTokenTransfer({
      from: TEST_ADDRESS_FROM,
      to: TEST_ADDRESS_TO,
      amount: 1000000n,
      token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
    });

    expect(mockEncode).toHaveBeenCalledWith({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [TEST_ADDRESS_TO, 1000000n],
    });
  });

  it('throws INSUFFICIENT_BALANCE on insufficient funds error', async () => {
    mockClient.getTransactionCount.mockResolvedValue(0);
    mockClient.estimateFeesPerGas.mockResolvedValue({
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    mockClient.estimateGas.mockRejectedValue(new Error('insufficient funds for gas * price + value'));

    try {
      await adapter.buildTokenTransfer({
        from: TEST_ADDRESS_FROM,
        to: TEST_ADDRESS_TO,
        amount: 999999999999n,
        token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('INSUFFICIENT_BALANCE');
      expect((error as ChainError).chain).toBe('evm');
    }
  });

  it('throws NONCE_TOO_LOW on nonce error', async () => {
    mockClient.getTransactionCount.mockResolvedValue(0);
    mockClient.estimateFeesPerGas.mockResolvedValue({
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
    });
    mockClient.estimateGas.mockRejectedValue(new Error('nonce too low'));

    try {
      await adapter.buildTokenTransfer({
        from: TEST_ADDRESS_FROM,
        to: TEST_ADDRESS_TO,
        amount: 1000000n,
        token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('NONCE_TOO_LOW');
      expect((error as ChainError).chain).toBe('evm');
    }
  });

  it('maps RPC errors via mapError fallback', async () => {
    mockClient.getTransactionCount.mockRejectedValue(new Error('fetch failed'));

    try {
      await adapter.buildTokenTransfer({
        from: TEST_ADDRESS_FROM,
        to: TEST_ADDRESS_TO,
        amount: 1000000n,
        token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ChainError);
      expect((error as ChainError).code).toBe('RPC_CONNECTION_ERROR');
    }
  });
});

describe('EvmAdapter getAssets ERC-20 multicall', () => {
  let adapter: EvmAdapter;

  beforeEach(async () => {
    adapter = new EvmAdapter('mainnet');
    vi.clearAllMocks();
    mockClient.chain = { id: 1 };
    await adapter.connect('https://eth-mainnet.example.com');
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  it('returns only native ETH when no allowedTokens set (backward compatible)', async () => {
    mockClient.getBalance.mockResolvedValue(2000000000000000000n);

    const assets = await adapter.getAssets(TEST_ADDRESS_FROM);

    expect(assets).toHaveLength(1);
    expect(assets[0]!.mint).toBe('native');
    expect(assets[0]!.symbol).toBe('ETH');
    expect(assets[0]!.isNative).toBe(true);
    expect(assets[0]!.balance).toBe(2000000000000000000n);
    // multicall should NOT have been called
    expect(mockClient.multicall).not.toHaveBeenCalled();
  });

  it('returns native ETH + ERC-20 balances when allowedTokens set', async () => {
    mockClient.getBalance.mockResolvedValue(1000000000000000000n);
    mockClient.multicall.mockResolvedValue([
      { status: 'success', result: 5000000n }, // 5 USDC
      { status: 'success', result: 10000000000000000000n }, // 10 DAI
    ]);

    adapter.setAllowedTokens([
      { address: TEST_TOKEN_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      { address: TEST_TOKEN_C, symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    ]);

    const assets = await adapter.getAssets(TEST_ADDRESS_FROM);

    expect(assets).toHaveLength(3); // native + 2 tokens
    expect(assets[0]!.mint).toBe('native');
    expect(assets[0]!.isNative).toBe(true);

    // DAI has higher raw balance, should be first among tokens
    expect(assets[1]!.symbol).toBe('DAI');
    expect(assets[1]!.balance).toBe(10000000000000000000n);
    expect(assets[1]!.isNative).toBe(false);

    expect(assets[2]!.symbol).toBe('USDC');
    expect(assets[2]!.balance).toBe(5000000n);
    expect(assets[2]!.isNative).toBe(false);
  });

  it('skips zero-balance tokens', async () => {
    mockClient.getBalance.mockResolvedValue(1000000000000000000n);
    mockClient.multicall.mockResolvedValue([
      { status: 'success', result: 5000000n }, // 5 USDC
      { status: 'success', result: 0n }, // 0 USDT
    ]);

    adapter.setAllowedTokens([
      { address: TEST_TOKEN_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      { address: TEST_TOKEN_B, symbol: 'USDT', name: 'Tether', decimals: 6 },
    ]);

    const assets = await adapter.getAssets(TEST_ADDRESS_FROM);

    expect(assets).toHaveLength(2); // native + USDC only (USDT has 0 balance)
    expect(assets[0]!.mint).toBe('native');
    expect(assets[1]!.symbol).toBe('USDC');
  });

  it('skips failed multicall results gracefully', async () => {
    mockClient.getBalance.mockResolvedValue(1000000000000000000n);
    mockClient.multicall.mockResolvedValue([
      { status: 'success', result: 5000000n }, // 5 USDC
      { status: 'failure', error: new Error('execution reverted') }, // USDT call failed
    ]);

    adapter.setAllowedTokens([
      { address: TEST_TOKEN_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      { address: TEST_TOKEN_B, symbol: 'USDT', name: 'Tether', decimals: 6 },
    ]);

    const assets = await adapter.getAssets(TEST_ADDRESS_FROM);

    expect(assets).toHaveLength(2); // native + USDC only (USDT failed)
    expect(assets[0]!.mint).toBe('native');
    expect(assets[1]!.symbol).toBe('USDC');
  });

  it('sorts tokens by balance descending with native first', async () => {
    mockClient.getBalance.mockResolvedValue(500000000000000000n); // 0.5 ETH
    mockClient.multicall.mockResolvedValue([
      { status: 'success', result: 100n }, // small USDC
      { status: 'success', result: 99999n }, // medium USDT
      { status: 'success', result: 50000000000000000000n }, // large DAI
    ]);

    adapter.setAllowedTokens([
      { address: TEST_TOKEN_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      { address: TEST_TOKEN_B, symbol: 'USDT', name: 'Tether', decimals: 6 },
      { address: TEST_TOKEN_C, symbol: 'DAI', name: 'Dai', decimals: 18 },
    ]);

    const assets = await adapter.getAssets(TEST_ADDRESS_FROM);

    expect(assets).toHaveLength(4);
    // Native always first
    expect(assets[0]!.mint).toBe('native');
    // Then sorted by balance descending
    expect(assets[1]!.symbol).toBe('DAI'); // 50e18
    expect(assets[2]!.symbol).toBe('USDT'); // 99999
    expect(assets[3]!.symbol).toBe('USDC'); // 100
  });

  it('tie-breaks equal balances alphabetically by symbol', async () => {
    mockClient.getBalance.mockResolvedValue(1000000000000000000n);
    mockClient.multicall.mockResolvedValue([
      { status: 'success', result: 1000n }, // USDC
      { status: 'success', result: 1000n }, // DAI (same balance)
    ]);

    adapter.setAllowedTokens([
      { address: TEST_TOKEN_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
      { address: TEST_TOKEN_C, symbol: 'DAI', name: 'Dai', decimals: 18 },
    ]);

    const assets = await adapter.getAssets(TEST_ADDRESS_FROM);

    expect(assets).toHaveLength(3);
    expect(assets[0]!.mint).toBe('native');
    // Alphabetical tie-break: DAI before USDC
    expect(assets[1]!.symbol).toBe('DAI');
    expect(assets[2]!.symbol).toBe('USDC');
  });

  it('setAllowedTokens updates the internal token list', () => {
    const tokens = [
      { address: TEST_TOKEN_ADDRESS, symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    ];

    // Should not throw
    adapter.setAllowedTokens(tokens);

    // Setting empty list should also work
    adapter.setAllowedTokens([]);
  });
});
