/**
 * EvmAdapter sign-only operation tests: parseTransaction + signExternalTransaction.
 *
 * Phase 115-03: TDD tests for EVM unsigned tx parsing and external tx signing.
 *
 * Uses viem's serializeTransaction() and encodeFunctionData() to create realistic
 * test fixtures rather than hardcoded hex strings.
 */

import { describe, it, expect } from 'vitest';
import {
  serializeTransaction,
  encodeFunctionData,
  type Hex,
} from 'viem';
import { generatePrivateKey } from 'viem/accounts';
import { ChainError } from '@waiaas/core';
import { EvmAdapter } from '../adapter.js';
import { ERC20_ABI } from '../abi/erc20.js';

// ---- Test fixtures ----

const TEST_RECIPIENT = '0x742d35CC6634c0532925a3B844bc9e7595F2Bd28';
const TEST_TOKEN_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC-like
const TEST_SPENDER = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

// Common EIP-1559 tx params
const BASE_TX_PARAMS = {
  type: 'eip1559' as const,
  chainId: 1,
  nonce: 0,
  gas: 21000n,
  maxFeePerGas: 30000000000n,
  maxPriorityFeePerGas: 1000000000n,
};

// 1. ETH transfer (no calldata)
const ETH_TRANSFER_RAW = serializeTransaction({
  ...BASE_TX_PARAMS,
  to: TEST_RECIPIENT as `0x${string}`,
  value: 1000000000000000000n, // 1 ETH
});

// 2. ERC-20 transfer calldata
const ERC20_TRANSFER_DATA = encodeFunctionData({
  abi: ERC20_ABI,
  functionName: 'transfer',
  args: [TEST_RECIPIENT as `0x${string}`, 1000000n],
});
const ERC20_TRANSFER_RAW = serializeTransaction({
  ...BASE_TX_PARAMS,
  to: TEST_TOKEN_CONTRACT as `0x${string}`,
  value: 0n,
  data: ERC20_TRANSFER_DATA,
});

// 3. ERC-20 approve calldata
const ERC20_APPROVE_DATA = encodeFunctionData({
  abi: ERC20_ABI,
  functionName: 'approve',
  args: [TEST_SPENDER as `0x${string}`, 2000000n],
});
const ERC20_APPROVE_RAW = serializeTransaction({
  ...BASE_TX_PARAMS,
  to: TEST_TOKEN_CONTRACT as `0x${string}`,
  value: 0n,
  data: ERC20_APPROVE_DATA,
});

// 4. Unknown contract call (arbitrary calldata)
const UNKNOWN_CALLDATA = '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000001' as Hex;
const UNKNOWN_CONTRACT_CALL_RAW = serializeTransaction({
  ...BASE_TX_PARAMS,
  to: TEST_TOKEN_CONTRACT as `0x${string}`,
  value: 0n,
  data: UNKNOWN_CALLDATA,
});

// 5. ETH transfer with value + calldata -> CONTRACT_CALL (calldata takes priority)
const VALUE_WITH_CALLDATA_RAW = serializeTransaction({
  ...BASE_TX_PARAMS,
  to: TEST_TOKEN_CONTRACT as `0x${string}`,
  value: 500000000000000000n, // 0.5 ETH
  data: UNKNOWN_CALLDATA,
});

// ---- Test suite ----

describe('EvmAdapter sign-only operations', () => {
  let adapter: EvmAdapter;

  // NOTE: parseTransaction and signExternalTransaction do NOT require RPC connection
  // They work purely with local crypto operations
  beforeEach(() => {
    adapter = new EvmAdapter('mainnet');
  });

  describe('parseTransaction', () => {
    it('should parse ETH transfer as NATIVE_TRANSFER', async () => {
      const result = await adapter.parseTransaction(ETH_TRANSFER_RAW);

      expect(result.rawTx).toBe(ETH_TRANSFER_RAW);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('NATIVE_TRANSFER');
      expect(result.operations[0]!.to?.toLowerCase()).toBe(TEST_RECIPIENT.toLowerCase());
      expect(result.operations[0]!.amount).toBe(1000000000000000000n);
    });

    it('should parse ERC-20 transfer as TOKEN_TRANSFER', async () => {
      const result = await adapter.parseTransaction(ERC20_TRANSFER_RAW);

      expect(result.rawTx).toBe(ERC20_TRANSFER_RAW);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('TOKEN_TRANSFER');
      expect(result.operations[0]!.token?.toLowerCase()).toBe(TEST_TOKEN_CONTRACT.toLowerCase());
      expect(result.operations[0]!.to?.toLowerCase()).toBe(TEST_RECIPIENT.toLowerCase());
      expect(result.operations[0]!.amount).toBe(1000000n);
    });

    it('should parse ERC-20 approve as APPROVE', async () => {
      const result = await adapter.parseTransaction(ERC20_APPROVE_RAW);

      expect(result.rawTx).toBe(ERC20_APPROVE_RAW);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('APPROVE');
      expect(result.operations[0]!.token?.toLowerCase()).toBe(TEST_TOKEN_CONTRACT.toLowerCase());
      expect(result.operations[0]!.to?.toLowerCase()).toBe(TEST_SPENDER.toLowerCase());
      expect(result.operations[0]!.amount).toBe(2000000n);
    });

    it('should parse unknown contract call as CONTRACT_CALL', async () => {
      const result = await adapter.parseTransaction(UNKNOWN_CONTRACT_CALL_RAW);

      expect(result.rawTx).toBe(UNKNOWN_CONTRACT_CALL_RAW);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('CONTRACT_CALL');
      expect(result.operations[0]!.programId?.toLowerCase()).toBe(TEST_TOKEN_CONTRACT.toLowerCase());
      expect(result.operations[0]!.method).toBe('0xdeadbeef');
    });

    it('should classify ETH transfer with calldata as CONTRACT_CALL (calldata takes priority)', async () => {
      const result = await adapter.parseTransaction(VALUE_WITH_CALLDATA_RAW);

      expect(result.rawTx).toBe(VALUE_WITH_CALLDATA_RAW);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('CONTRACT_CALL');
      expect(result.operations[0]!.programId?.toLowerCase()).toBe(TEST_TOKEN_CONTRACT.toLowerCase());
      expect(result.operations[0]!.method).toBe('0xdeadbeef');
    });

    it('should throw INVALID_RAW_TRANSACTION for invalid hex', async () => {
      await expect(adapter.parseTransaction('0xzzzz')).rejects.toThrow(ChainError);
      await expect(adapter.parseTransaction('0xzzzz')).rejects.toMatchObject({
        code: 'INVALID_RAW_TRANSACTION',
        chain: 'evm',
      });
    });

    it('should throw INVALID_RAW_TRANSACTION for non-hex string', async () => {
      await expect(adapter.parseTransaction('not-hex-at-all')).rejects.toThrow(ChainError);
      await expect(adapter.parseTransaction('not-hex-at-all')).rejects.toMatchObject({
        code: 'INVALID_RAW_TRANSACTION',
        chain: 'evm',
      });
    });

    it('should throw INVALID_RAW_TRANSACTION for empty string', async () => {
      await expect(adapter.parseTransaction('')).rejects.toThrow(ChainError);
      await expect(adapter.parseTransaction('')).rejects.toMatchObject({
        code: 'INVALID_RAW_TRANSACTION',
        chain: 'evm',
      });
    });
  });

  describe('signExternalTransaction', () => {
    it('should sign a valid unsigned tx and return hex signed transaction', async () => {
      const privateKey = generatePrivateKey();
      const privateKeyBytes = Buffer.from(privateKey.slice(2), 'hex');

      const result = await adapter.signExternalTransaction(ETH_TRANSFER_RAW, privateKeyBytes);

      expect(result.signedTransaction).toBeDefined();
      expect(result.signedTransaction).toMatch(/^0x/);
      // Signed tx should be longer than unsigned (includes signature)
      expect(result.signedTransaction.length).toBeGreaterThan(ETH_TRANSFER_RAW.length);
    });

    it('should sign ERC-20 transfer tx', async () => {
      const privateKey = generatePrivateKey();
      const privateKeyBytes = Buffer.from(privateKey.slice(2), 'hex');

      const result = await adapter.signExternalTransaction(ERC20_TRANSFER_RAW, privateKeyBytes);

      expect(result.signedTransaction).toBeDefined();
      expect(result.signedTransaction).toMatch(/^0x/);
    });

    it('should throw INVALID_RAW_TRANSACTION for invalid hex', async () => {
      const privateKey = generatePrivateKey();
      const privateKeyBytes = Buffer.from(privateKey.slice(2), 'hex');

      await expect(adapter.signExternalTransaction('0xzzzz', privateKeyBytes)).rejects.toThrow(ChainError);
      await expect(adapter.signExternalTransaction('0xzzzz', privateKeyBytes)).rejects.toMatchObject({
        code: 'INVALID_RAW_TRANSACTION',
        chain: 'evm',
      });
    });

    it('should throw INVALID_RAW_TRANSACTION for non-hex string', async () => {
      const privateKey = generatePrivateKey();
      const privateKeyBytes = Buffer.from(privateKey.slice(2), 'hex');

      await expect(adapter.signExternalTransaction('not-hex', privateKeyBytes)).rejects.toThrow(ChainError);
      await expect(adapter.signExternalTransaction('not-hex', privateKeyBytes)).rejects.toMatchObject({
        code: 'INVALID_RAW_TRANSACTION',
        chain: 'evm',
      });
    });

    it('should not require RPC connection (works offline)', async () => {
      // Adapter is NOT connected - signExternalTransaction should still work
      expect(adapter.isConnected()).toBe(false);

      const privateKey = generatePrivateKey();
      const privateKeyBytes = Buffer.from(privateKey.slice(2), 'hex');

      const result = await adapter.signExternalTransaction(ETH_TRANSFER_RAW, privateKeyBytes);
      expect(result.signedTransaction).toBeDefined();
    });
  });
});
