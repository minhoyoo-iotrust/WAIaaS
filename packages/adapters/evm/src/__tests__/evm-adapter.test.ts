/**
 * EvmAdapter unit tests.
 *
 * Phase 77-01 tests: IChainAdapter interface compliance, connection state, stub errors (13 tests)
 * Phase 77-02 tests: buildTransaction, simulateTransaction, signTransaction, submitTransaction,
 *   waitForConfirmation, estimateFee, getTransactionFee, getAssets, getTokenInfo, buildApprove,
 *   getCurrentNonce with viem mocking (~23 new tests)
 *
 * Total: ~36 tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WAIaaSError, ChainError } from '@waiaas/core';
import { EvmAdapter } from '../adapter.js';
import { ERC20_ABI } from '../abi/erc20.js';

// ---- viem mock setup ----

// Create a mock client object with all methods we use
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

// Mock viem module
vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockClient),
    serializeTransaction: vi.fn(() => '0xf8deadbeef'),
    parseTransaction: vi.fn(() => ({
      to: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
      value: 1000000000000000000n,
      nonce: 5,
      gas: 25200n,
      maxFeePerGas: 30000000000n,
      maxPriorityFeePerGas: 1000000000n,
      chainId: 1,
      type: 'eip1559' as const,
    })),
    hexToBytes: vi.fn((hex: string) => {
      // Simple hex to bytes conversion for testing
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
    encodeFunctionData: vi.fn(() => '0xapprovedata'),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    signTransaction: vi.fn(async () => '0xsigned_tx_hex_data'),
  })),
}));

// ---- Helpers ----

const EXPECTED_METHODS = [
  'connect',
  'disconnect',
  'isConnected',
  'getHealth',
  'getBalance',
  'buildTransaction',
  'simulateTransaction',
  'signTransaction',
  'submitTransaction',
  'waitForConfirmation',
  'getAssets',
  'estimateFee',
  'buildTokenTransfer',
  'getTokenInfo',
  'buildContractCall',
  'buildApprove',
  'buildBatch',
  'getTransactionFee',
  'getCurrentNonce',
  'sweepAll',
] as const;

const TEST_ADDRESS_FROM = '0x1234567890abcdef1234567890abcdef12345678';
const TEST_ADDRESS_TO = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28';
const TEST_TOKEN_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// ---- Tests ----

describe('EvmAdapter', () => {
  let adapter: EvmAdapter;

  beforeEach(() => {
    adapter = new EvmAdapter('mainnet');
    vi.clearAllMocks();
    // Restore default mock implementations
    mockClient.chain = { id: 1 };
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  // -- IChainAdapter interface compliance (3 tests) --

  describe('IChainAdapter interface compliance', () => {
    it('EvmAdapter has chain=ethereum and network matches constructor arg', () => {
      expect(adapter.chain).toBe('ethereum');
      expect(adapter.network).toBe('mainnet');

      const devnetAdapter = new EvmAdapter('devnet');
      expect(devnetAdapter.network).toBe('devnet');
    });

    it('EvmAdapter has all 20 IChainAdapter methods', () => {
      for (const method of EXPECTED_METHODS) {
        expect(typeof adapter[method]).toBe('function');
      }
    });

    it('ERC20_ABI has required functions', () => {
      const functionNames = ERC20_ABI.map((entry) => entry.name);
      expect(functionNames).toContain('transfer');
      expect(functionNames).toContain('approve');
      expect(functionNames).toContain('balanceOf');
      expect(functionNames).toContain('allowance');
      expect(functionNames).toContain('decimals');
      expect(functionNames).toContain('symbol');
      expect(functionNames).toContain('name');
      expect(functionNames).toContain('totalSupply');
      expect(ERC20_ABI).toHaveLength(8);
    });
  });

  // -- Connection state management (4 tests) --

  describe('connection state management', () => {
    it('isConnected() returns false before connect()', () => {
      expect(adapter.isConnected()).toBe(false);
    });

    it('connect() sets connected state to true', async () => {
      await adapter.connect('https://eth-mainnet.example.com');
      expect(adapter.isConnected()).toBe(true);
    });

    it('disconnect() sets connected state to false', async () => {
      await adapter.connect('https://eth-mainnet.example.com');
      expect(adapter.isConnected()).toBe(true);
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it('methods throw ADAPTER_NOT_AVAILABLE when not connected', async () => {
      expect(adapter.isConnected()).toBe(false);

      // getBalance should throw ADAPTER_NOT_AVAILABLE
      await expect(adapter.getBalance('0x1234')).rejects.toThrow(WAIaaSError);
      try {
        await adapter.getBalance('0x1234');
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('ADAPTER_NOT_AVAILABLE');
      }

      // getHealth should throw ADAPTER_NOT_AVAILABLE
      await expect(adapter.getHealth()).rejects.toThrow(WAIaaSError);

      // getCurrentNonce should throw ADAPTER_NOT_AVAILABLE
      await expect(adapter.getCurrentNonce('0x1234')).rejects.toThrow(WAIaaSError);
    });
  });

  // -- Stub method errors (3 tests) --

  describe('stub method errors', () => {
    it('buildBatch throws BATCH_NOT_SUPPORTED WAIaaSError', async () => {
      await adapter.connect('https://eth-mainnet.example.com');
      await expect(
        adapter.buildBatch({ from: '0x1', instructions: [] }),
      ).rejects.toThrow(WAIaaSError);

      try {
        await adapter.buildBatch({ from: '0x1', instructions: [] });
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('BATCH_NOT_SUPPORTED');
        expect((error as WAIaaSError).message).toContain('Account Abstraction');
      }
    });

    it('sweepAll throws not implemented', async () => {
      await adapter.connect('https://eth-mainnet.example.com');
      await expect(
        adapter.sweepAll('0x1', '0x2', new Uint8Array(32)),
      ).rejects.toThrow('Not implemented');
    });

    it('buildTokenTransfer throws not implemented', async () => {
      await adapter.connect('https://eth-mainnet.example.com');
      await expect(
        adapter.buildTokenTransfer({
          from: '0x1',
          to: '0x2',
          amount: 1000n,
          token: { address: '0xtoken', decimals: 18, symbol: 'USDC' },
        }),
      ).rejects.toThrow('Not implemented');
    });
  });

  // -- buildTransaction tests (4 tests) --

  describe('buildTransaction', () => {
    beforeEach(async () => {
      await adapter.connect('https://eth-mainnet.example.com');
    });

    it('builds EIP-1559 transaction with correct fields', async () => {
      mockClient.getTransactionCount.mockResolvedValue(5);
      mockClient.estimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      mockClient.estimateGas.mockResolvedValue(21000n);

      const result = await adapter.buildTransaction({
        from: TEST_ADDRESS_FROM,
        to: TEST_ADDRESS_TO,
        amount: 1000000000000000000n, // 1 ETH
      });

      expect(result.chain).toBe('ethereum');
      expect(result.serialized).toBeInstanceOf(Uint8Array);
      expect(result.nonce).toBe(5);
      expect(result.metadata.nonce).toBe(5);
      expect(result.metadata.chainId).toBe(1);
      expect(result.metadata.maxFeePerGas).toBe(30000000000n);
      expect(result.metadata.maxPriorityFeePerGas).toBe(1000000000n);
      expect(result.metadata.type).toBe('eip1559');
      expect(result.expiresAt).toBeUndefined(); // EVM uses nonce, no expiry
    });

    it('applies 1.2x gas safety margin', async () => {
      mockClient.getTransactionCount.mockResolvedValue(0);
      mockClient.estimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      mockClient.estimateGas.mockResolvedValue(21000n);

      const result = await adapter.buildTransaction({
        from: TEST_ADDRESS_FROM,
        to: TEST_ADDRESS_TO,
        amount: 1000000000000000000n,
      });

      // 21000 * 120 / 100 = 25200
      expect(result.metadata.gasLimit).toBe(25200n);
      // estimatedFee = 25200 * 30000000000 = 756000000000000
      expect(result.estimatedFee).toBe(25200n * 30000000000n);
    });

    it('throws INSUFFICIENT_BALANCE on insufficient funds error', async () => {
      mockClient.getTransactionCount.mockResolvedValue(0);
      mockClient.estimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      mockClient.estimateGas.mockRejectedValue(new Error('insufficient funds for gas * price + value'));

      try {
        await adapter.buildTransaction({
          from: TEST_ADDRESS_FROM,
          to: TEST_ADDRESS_TO,
          amount: 999999999999999999999n,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('INSUFFICIENT_BALANCE');
        expect((error as ChainError).chain).toBe('evm');
      }
    });

    it('includes memo as hex data when provided', async () => {
      mockClient.getTransactionCount.mockResolvedValue(0);
      mockClient.estimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 30000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      mockClient.estimateGas.mockResolvedValue(21000n);

      const { serializeTransaction: mockSerialize } = await import('viem');

      await adapter.buildTransaction({
        from: TEST_ADDRESS_FROM,
        to: TEST_ADDRESS_TO,
        amount: 1000000000000000000n,
        memo: 'test memo',
      });

      // Verify serializeTransaction was called with data field
      expect(mockSerialize).toHaveBeenCalled();
      const callArgs = (mockSerialize as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.data).toBeDefined();
      // 'test memo' in hex
      expect(callArgs.data).toBe('0x' + Buffer.from('test memo').toString('hex'));
    });
  });

  // -- simulateTransaction tests (2 tests) --

  describe('simulateTransaction', () => {
    beforeEach(async () => {
      await adapter.connect('https://eth-mainnet.example.com');
    });

    it('returns success: true when simulation passes', async () => {
      mockClient.call.mockResolvedValue({ data: '0x' });

      const tx = {
        chain: 'ethereum' as const,
        serialized: new Uint8Array([0xf8, 0xde, 0xad]),
        estimatedFee: 756000000000000n,
        metadata: { gasLimit: 25200n },
      };

      const result = await adapter.simulateTransaction(tx);
      expect(result.success).toBe(true);
      expect(result.logs).toEqual([]);
    });

    it('returns success: false with error when simulation fails', async () => {
      mockClient.call.mockRejectedValue(new Error('execution reverted: ERC20: transfer amount exceeds balance'));

      const tx = {
        chain: 'ethereum' as const,
        serialized: new Uint8Array([0xf8, 0xde, 0xad]),
        estimatedFee: 756000000000000n,
        metadata: {},
      };

      const result = await adapter.simulateTransaction(tx);
      expect(result.success).toBe(false);
      expect(result.error).toContain('execution reverted');
    });
  });

  // -- signTransaction tests (2 tests) --

  describe('signTransaction', () => {
    beforeEach(async () => {
      await adapter.connect('https://eth-mainnet.example.com');
    });

    it('signs transaction with private key and returns bytes', async () => {
      const privateKey = new Uint8Array(32).fill(1);
      const tx = {
        chain: 'ethereum' as const,
        serialized: new Uint8Array([0xf8, 0xde, 0xad]),
        estimatedFee: 756000000000000n,
        metadata: {},
      };

      const result = await adapter.signTransaction(tx, privateKey);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles 32-byte private key', async () => {
      const { privateKeyToAccount: mockPKToAccount } = await import('viem/accounts');

      const privateKey = new Uint8Array(32).fill(0xab);
      const tx = {
        chain: 'ethereum' as const,
        serialized: new Uint8Array([0xf8, 0xde, 0xad]),
        estimatedFee: 756000000000000n,
        metadata: {},
      };

      await adapter.signTransaction(tx, privateKey);

      // Verify privateKeyToAccount was called with hex-encoded key
      expect(mockPKToAccount).toHaveBeenCalledWith(
        '0x' + 'ab'.repeat(32),
      );
    });
  });

  // -- submitTransaction tests (2 tests) --

  describe('submitTransaction', () => {
    beforeEach(async () => {
      await adapter.connect('https://eth-mainnet.example.com');
    });

    it('submits signed tx and returns txHash', async () => {
      const mockTxHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      mockClient.sendRawTransaction.mockResolvedValue(mockTxHash);

      const signedTx = new Uint8Array([0x01, 0x02, 0x03]);
      const result = await adapter.submitTransaction(signedTx);

      expect(result.txHash).toBe(mockTxHash);
      expect(result.status).toBe('submitted');
    });

    it('throws NONCE_ALREADY_USED on nonce error', async () => {
      mockClient.sendRawTransaction.mockRejectedValue(new Error('nonce already used'));

      const signedTx = new Uint8Array([0x01, 0x02, 0x03]);

      try {
        await adapter.submitTransaction(signedTx);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainError);
        expect((error as ChainError).code).toBe('NONCE_ALREADY_USED');
        expect((error as ChainError).chain).toBe('evm');
      }
    });
  });

  // -- waitForConfirmation tests (2 tests) --

  describe('waitForConfirmation', () => {
    beforeEach(async () => {
      await adapter.connect('https://eth-mainnet.example.com');
    });

    it('returns confirmed status with block number and fee', async () => {
      mockClient.waitForTransactionReceipt.mockResolvedValue({
        status: 'success',
        blockNumber: 18000000n,
        gasUsed: 21000n,
        effectiveGasPrice: 25000000000n,
      });

      const txHash = '0xabcdef1234567890';
      const result = await adapter.waitForConfirmation(txHash, 30000);

      expect(result.txHash).toBe(txHash);
      expect(result.status).toBe('confirmed');
      expect(result.blockNumber).toBe(18000000n);
      expect(result.fee).toBe(21000n * 25000000000n); // 525000000000000
    });

    it('returns submitted on timeout', async () => {
      mockClient.waitForTransactionReceipt.mockRejectedValue(new Error('Timed out waiting for transaction receipt'));

      const txHash = '0xabcdef1234567890';
      const result = await adapter.waitForConfirmation(txHash, 1000);

      expect(result.txHash).toBe(txHash);
      expect(result.status).toBe('submitted');
    });
  });

  // -- estimateFee tests (3 tests) --

  describe('estimateFee', () => {
    beforeEach(async () => {
      await adapter.connect('https://eth-mainnet.example.com');
    });

    it('estimates native transfer fee with 1.2x margin', async () => {
      mockClient.estimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 20000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      mockClient.estimateGas.mockResolvedValue(21000n);

      const result = await adapter.estimateFee({
        from: TEST_ADDRESS_FROM,
        to: TEST_ADDRESS_TO,
        amount: 1000000000000000000n,
      });

      // gasLimit = 21000 * 120 / 100 = 25200
      // fee = 25200 * 20000000000 = 504000000000000
      expect(result.fee).toBe(25200n * 20000000000n);
      expect(result.details).toBeDefined();
    });

    it('estimates ERC-20 transfer fee (TokenTransferParams)', async () => {
      mockClient.estimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 20000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      mockClient.estimateGas.mockResolvedValue(65000n);

      const { encodeFunctionData: mockEncode } = await import('viem');

      const result = await adapter.estimateFee({
        from: TEST_ADDRESS_FROM,
        to: TEST_ADDRESS_TO,
        amount: 1000000n,
        token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
      });

      // gasLimit = 65000 * 120 / 100 = 78000
      // fee = 78000 * 20000000000 = 1560000000000000
      expect(result.fee).toBe(78000n * 20000000000n);
      // encodeFunctionData should have been called for ERC-20 transfer
      expect(mockEncode).toHaveBeenCalled();
    });

    it('returns FeeEstimate with details', async () => {
      mockClient.estimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 20000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      mockClient.estimateGas.mockResolvedValue(21000n);

      const result = await adapter.estimateFee({
        from: TEST_ADDRESS_FROM,
        to: TEST_ADDRESS_TO,
        amount: 1000000000000000000n,
      });

      expect(result.details).toEqual({
        gasLimit: 25200n,
        maxFeePerGas: 20000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
    });
  });

  // -- getCurrentNonce tests (2 tests) --

  describe('getCurrentNonce', () => {
    it('throws ADAPTER_NOT_AVAILABLE when not connected', async () => {
      expect(adapter.isConnected()).toBe(false);

      await expect(adapter.getCurrentNonce('0x1234')).rejects.toThrow(WAIaaSError);
      try {
        await adapter.getCurrentNonce('0x1234');
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('ADAPTER_NOT_AVAILABLE');
      }
    });

    it('returns nonce from getTransactionCount', async () => {
      await adapter.connect('https://eth-mainnet.example.com');
      mockClient.getTransactionCount.mockResolvedValue(42);

      const nonce = await adapter.getCurrentNonce(TEST_ADDRESS_FROM);
      expect(nonce).toBe(42);
    });
  });

  // -- getTransactionFee tests (2 tests) --

  describe('getTransactionFee', () => {
    it('calculates fee from metadata', async () => {
      const tx = {
        chain: 'ethereum' as const,
        serialized: new Uint8Array(0),
        estimatedFee: 500000n,
        metadata: {
          gasLimit: 25200n,
          maxFeePerGas: 30000000000n,
        },
      };

      const fee = await adapter.getTransactionFee(tx);
      expect(fee).toBe(25200n * 30000000000n); // 756000000000000
    });

    it('falls back to estimatedFee when metadata missing', async () => {
      const tx = {
        chain: 'ethereum' as const,
        serialized: new Uint8Array(0),
        estimatedFee: 500000n,
        metadata: {},
      };

      const fee = await adapter.getTransactionFee(tx);
      expect(fee).toBe(500000n);
    });
  });

  // -- getAssets tests (1 test) --

  describe('getAssets', () => {
    it('returns native ETH balance', async () => {
      await adapter.connect('https://eth-mainnet.example.com');
      mockClient.getBalance.mockResolvedValue(2000000000000000000n); // 2 ETH

      const assets = await adapter.getAssets(TEST_ADDRESS_FROM);

      expect(assets).toHaveLength(1);
      const native = assets[0]!;
      expect(native.mint).toBe('native');
      expect(native.symbol).toBe('ETH');
      expect(native.name).toBe('Ethereum');
      expect(native.balance).toBe(2000000000000000000n);
      expect(native.decimals).toBe(18);
      expect(native.isNative).toBe(true);
    });
  });

  // -- getTokenInfo tests (2 tests) --

  describe('getTokenInfo', () => {
    beforeEach(async () => {
      await adapter.connect('https://eth-mainnet.example.com');
    });

    it('returns token info via multicall', async () => {
      mockClient.multicall.mockResolvedValue([
        { status: 'success', result: 6 },
        { status: 'success', result: 'USDC' },
        { status: 'success', result: 'USD Coin' },
      ]);

      const info = await adapter.getTokenInfo(TEST_TOKEN_ADDRESS);

      expect(info.address).toBe(TEST_TOKEN_ADDRESS);
      expect(info.decimals).toBe(6);
      expect(info.symbol).toBe('USDC');
      expect(info.name).toBe('USD Coin');
    });

    it('handles partial multicall failure with defaults', async () => {
      mockClient.multicall.mockResolvedValue([
        { status: 'failure', error: new Error('reverted') },
        { status: 'success', result: 'UNK' },
        { status: 'failure', error: new Error('reverted') },
      ]);

      const info = await adapter.getTokenInfo(TEST_TOKEN_ADDRESS);

      expect(info.address).toBe(TEST_TOKEN_ADDRESS);
      expect(info.decimals).toBe(18); // default
      expect(info.symbol).toBe('UNK');
      expect(info.name).toBe(''); // default
    });
  });

  // -- buildApprove tests (2 tests) --

  describe('buildApprove', () => {
    beforeEach(async () => {
      await adapter.connect('https://eth-mainnet.example.com');
    });

    it('encodes ERC-20 approve calldata', async () => {
      mockClient.getTransactionCount.mockResolvedValue(10);
      mockClient.estimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 25000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      mockClient.estimateGas.mockResolvedValue(46000n);

      const { encodeFunctionData: mockEncode } = await import('viem');

      const result = await adapter.buildApprove({
        from: TEST_ADDRESS_FROM,
        spender: TEST_ADDRESS_TO,
        token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
        amount: 1000000n,
      });

      // Verify encodeFunctionData was called with approve function
      expect(mockEncode).toHaveBeenCalledWith({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TEST_ADDRESS_TO, 1000000n],
      });

      expect(result.chain).toBe('ethereum');
      expect(result.nonce).toBe(10);
      expect(result.metadata.tokenAddress).toBe(TEST_TOKEN_ADDRESS);
      expect(result.metadata.spender).toBe(TEST_ADDRESS_TO);
      expect(result.metadata.approveAmount).toBe(1000000n);
    });

    it('builds EIP-1559 tx with value=0', async () => {
      mockClient.getTransactionCount.mockResolvedValue(10);
      mockClient.estimateFeesPerGas.mockResolvedValue({
        maxFeePerGas: 25000000000n,
        maxPriorityFeePerGas: 1000000000n,
      });
      mockClient.estimateGas.mockResolvedValue(46000n);

      const { serializeTransaction: mockSerialize } = await import('viem');

      await adapter.buildApprove({
        from: TEST_ADDRESS_FROM,
        spender: TEST_ADDRESS_TO,
        token: { address: TEST_TOKEN_ADDRESS, decimals: 6, symbol: 'USDC' },
        amount: 1000000n,
      });

      // Verify serializeTransaction was called with value=0
      expect(mockSerialize).toHaveBeenCalled();
      const callArgs = (mockSerialize as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.value).toBe(0n);
      // Tx should go to token contract, not the spender
      expect(callArgs.to).toBe(TEST_TOKEN_ADDRESS);
    });
  });
});
