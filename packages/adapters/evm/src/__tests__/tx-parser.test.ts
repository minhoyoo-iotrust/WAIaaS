/**
 * tx-parser.ts branch coverage tests.
 *
 * Phase 446-01 Task 2: Tests for parseEvmTransaction() branches:
 * NATIVE_TRANSFER, TOKEN_TRANSFER, APPROVE, CONTRACT_CALL,
 * error handling, and `to ?? undefined` fallback for null `to`.
 */

import { describe, it, expect } from 'vitest';
import {
  serializeTransaction,
  encodeFunctionData,
  type Hex,
} from 'viem';
import { ChainError } from '@waiaas/core';
import { parseEvmTransaction } from '../tx-parser.js';
import { ERC20_ABI } from '../abi/erc20.js';

const TEST_RECIPIENT = '0x742d35CC6634c0532925a3B844bc9e7595F2Bd28';
const TEST_TOKEN_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const BASE_TX = {
  type: 'eip1559' as const,
  chainId: 1,
  nonce: 0,
  gas: 21000n,
  maxFeePerGas: 30000000000n,
  maxPriorityFeePerGas: 1000000000n,
};

describe('parseEvmTransaction', () => {
  describe('NATIVE_TRANSFER', () => {
    it('classifies tx with no data as NATIVE_TRANSFER', () => {
      const raw = serializeTransaction({
        ...BASE_TX,
        to: TEST_RECIPIENT as `0x${string}`,
        value: 1000000000000000000n,
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('NATIVE_TRANSFER');
      expect(result.operations[0]!.to?.toLowerCase()).toBe(TEST_RECIPIENT.toLowerCase());
      expect(result.operations[0]!.amount).toBe(1000000000000000000n);
      expect(result.rawTx).toBe(raw);
    });

    it('classifies tx with empty "0x" data as NATIVE_TRANSFER', () => {
      const raw = serializeTransaction({
        ...BASE_TX,
        to: TEST_RECIPIENT as `0x${string}`,
        value: 500n,
        data: '0x' as Hex,
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations[0]!.type).toBe('NATIVE_TRANSFER');
    });

    it('handles tx with no to address (contract creation)', () => {
      // Contract creation tx has no "to" field
      const raw = serializeTransaction({
        ...BASE_TX,
        value: 0n,
        // Note: serializeTransaction without 'to' creates a contract creation tx
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations[0]!.type).toBe('NATIVE_TRANSFER');
      expect(result.operations[0]!.to).toBeUndefined();
    });

    it('defaults amount to 0n when value is undefined', () => {
      const raw = serializeTransaction({
        ...BASE_TX,
        to: TEST_RECIPIENT as `0x${string}`,
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations[0]!.type).toBe('NATIVE_TRANSFER');
      // value defaults to 0n when not specified
      expect(result.operations[0]!.amount).toBe(0n);
    });
  });

  describe('TOKEN_TRANSFER', () => {
    it('classifies ERC-20 transfer calldata as TOKEN_TRANSFER', () => {
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [TEST_RECIPIENT as `0x${string}`, 1000000n],
      });

      const raw = serializeTransaction({
        ...BASE_TX,
        to: TEST_TOKEN_CONTRACT as `0x${string}`,
        value: 0n,
        data: transferData,
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations[0]!.type).toBe('TOKEN_TRANSFER');
      expect(result.operations[0]!.token?.toLowerCase()).toBe(TEST_TOKEN_CONTRACT.toLowerCase());
      expect(result.operations[0]!.to?.toLowerCase()).toBe(TEST_RECIPIENT.toLowerCase());
      expect(result.operations[0]!.amount).toBe(1000000n);
    });

    it('handles TOKEN_TRANSFER with no to (token is null -> token=undefined)', () => {
      // Manually test the `to ?? undefined` branch for TOKEN_TRANSFER
      // When parsed.to is null, token should be undefined
      const transferData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [TEST_RECIPIENT as `0x${string}`, 500n],
      });

      const raw = serializeTransaction({
        ...BASE_TX,
        // No to field -> contract creation with transfer calldata (edge case)
        value: 0n,
        data: transferData,
      });

      const result = parseEvmTransaction(raw);
      // With no 'to', this would still match TOKEN_TRANSFER selector
      expect(result.operations[0]!.type).toBe('TOKEN_TRANSFER');
      expect(result.operations[0]!.token).toBeUndefined();
    });
  });

  describe('APPROVE', () => {
    it('classifies ERC-20 approve calldata as APPROVE', () => {
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TEST_RECIPIENT as `0x${string}`, 2000000n],
      });

      const raw = serializeTransaction({
        ...BASE_TX,
        to: TEST_TOKEN_CONTRACT as `0x${string}`,
        value: 0n,
        data: approveData,
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations[0]!.type).toBe('APPROVE');
      expect(result.operations[0]!.token?.toLowerCase()).toBe(TEST_TOKEN_CONTRACT.toLowerCase());
      expect(result.operations[0]!.to?.toLowerCase()).toBe(TEST_RECIPIENT.toLowerCase());
      expect(result.operations[0]!.amount).toBe(2000000n);
    });

    it('handles APPROVE with no to (token is null -> token=undefined)', () => {
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TEST_RECIPIENT as `0x${string}`, 100n],
      });

      const raw = serializeTransaction({
        ...BASE_TX,
        value: 0n,
        data: approveData,
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations[0]!.type).toBe('APPROVE');
      expect(result.operations[0]!.token).toBeUndefined();
    });
  });

  describe('CONTRACT_CALL', () => {
    it('classifies unknown selector as CONTRACT_CALL', () => {
      const unknownData = '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000001' as Hex;

      const raw = serializeTransaction({
        ...BASE_TX,
        to: TEST_TOKEN_CONTRACT as `0x${string}`,
        value: 0n,
        data: unknownData,
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations[0]!.type).toBe('CONTRACT_CALL');
      expect(result.operations[0]!.programId?.toLowerCase()).toBe(TEST_TOKEN_CONTRACT.toLowerCase());
      expect(result.operations[0]!.method).toBe('0xdeadbeef');
    });

    it('handles CONTRACT_CALL with no to (programId is null -> undefined)', () => {
      const unknownData = '0xaabbccdd0000000000000000000000000000000000000000000000000000000000000001' as Hex;

      const raw = serializeTransaction({
        ...BASE_TX,
        value: 0n,
        data: unknownData,
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations[0]!.type).toBe('CONTRACT_CALL');
      expect(result.operations[0]!.programId).toBeUndefined();
    });

    it('value + calldata is classified as CONTRACT_CALL (calldata takes priority)', () => {
      const unknownData = '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000001' as Hex;

      const raw = serializeTransaction({
        ...BASE_TX,
        to: TEST_TOKEN_CONTRACT as `0x${string}`,
        value: 500000000000000000n,
        data: unknownData,
      });

      const result = parseEvmTransaction(raw);
      expect(result.operations[0]!.type).toBe('CONTRACT_CALL');
    });
  });

  describe('error handling', () => {
    it('throws INVALID_RAW_TRANSACTION for invalid hex', () => {
      expect(() => parseEvmTransaction('0xzzzz')).toThrow(ChainError);
      try {
        parseEvmTransaction('0xzzzz');
      } catch (error) {
        expect((error as ChainError).code).toBe('INVALID_RAW_TRANSACTION');
        expect((error as ChainError).chain).toBe('evm');
      }
    });

    it('throws INVALID_RAW_TRANSACTION for empty string', () => {
      expect(() => parseEvmTransaction('')).toThrow(ChainError);
      try {
        parseEvmTransaction('');
      } catch (error) {
        expect((error as ChainError).code).toBe('INVALID_RAW_TRANSACTION');
      }
    });

    it('throws INVALID_RAW_TRANSACTION for non-hex string', () => {
      expect(() => parseEvmTransaction('not-hex-at-all')).toThrow(ChainError);
    });

    it('throws INVALID_RAW_TRANSACTION for truncated hex', () => {
      expect(() => parseEvmTransaction('0x02')).toThrow(ChainError);
    });
  });
});
