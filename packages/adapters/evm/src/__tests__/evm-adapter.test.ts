/**
 * EvmAdapter unit tests.
 *
 * Tests cover:
 * - IChainAdapter interface compliance (3 tests)
 * - Connection state management (4 tests)
 * - Stub method errors (5 tests)
 * - getCurrentNonce not-connected guard (1 test)
 *
 * Note: RPC-dependent method tests (getHealth, getBalance, getCurrentNonce actual calls)
 * will be added in Phase 77-02 with vi.mock('viem') for PublicClient mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import { EvmAdapter } from '../adapter.js';
import { ERC20_ABI } from '../abi/erc20.js';

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

// ---- Tests ----

describe('EvmAdapter', () => {
  let adapter: EvmAdapter;

  beforeEach(() => {
    adapter = new EvmAdapter('mainnet');
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

  // -- Stub method errors (5 tests) --

  describe('stub method errors', () => {
    it('buildTransaction throws not implemented', async () => {
      await adapter.connect('https://eth-mainnet.example.com');
      await expect(
        adapter.buildTransaction({ from: '0x1', to: '0x2', amount: 1000n }),
      ).rejects.toThrow('Not implemented');
    });

    it('simulateTransaction throws not implemented', async () => {
      await adapter.connect('https://eth-mainnet.example.com');
      const dummyTx = {
        chain: 'ethereum' as const,
        serialized: new Uint8Array(0),
        estimatedFee: 0n,
        metadata: {},
      };
      await expect(adapter.simulateTransaction(dummyTx)).rejects.toThrow('Not implemented');
    });

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

  // -- getCurrentNonce not-connected guard (1 test) --

  describe('getCurrentNonce', () => {
    it('getCurrentNonce throws ADAPTER_NOT_AVAILABLE when not connected', async () => {
      expect(adapter.isConnected()).toBe(false);

      await expect(adapter.getCurrentNonce('0x1234')).rejects.toThrow(WAIaaSError);
      try {
        await adapter.getCurrentNonce('0x1234');
      } catch (error) {
        expect(error).toBeInstanceOf(WAIaaSError);
        expect((error as WAIaaSError).code).toBe('ADAPTER_NOT_AVAILABLE');
      }
    });
  });
});
