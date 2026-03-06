/**
 * Tests for UserOp v0.7 Zod schemas and error codes.
 *
 * Plan 338-02 Task 1: UserOp schemas + error code definitions.
 */

import { describe, it, expect } from 'vitest';
import { ERROR_CODES } from '../errors/error-codes.js';

describe('UserOp v0.7 Zod Schemas', () => {
  // Test 1: UserOperationV07Schema validates EntryPoint v0.7 fields
  it('T1: UserOperationV07Schema validates v0.7 fields', async () => {
    const { UserOperationV07Schema } = await import('../schemas/userop.schema.js');

    const validOp = {
      sender: '0x1234567890abcdef1234567890abcdef12345678',
      nonce: '0x01',
      callData: '0xabcdef',
      callGasLimit: '0x5208',
      verificationGasLimit: '0x5208',
      preVerificationGas: '0x5208',
      maxFeePerGas: '0x3b9aca00',
      maxPriorityFeePerGas: '0x3b9aca00',
      signature: '0xdeadbeef',
    };

    const result = UserOperationV07Schema.safeParse(validOp);
    expect(result.success).toBe(true);

    // Optional fields
    const withOptional = {
      ...validOp,
      factory: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      factoryData: '0x1234',
      paymaster: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      paymasterData: '0x5678',
      paymasterVerificationGasLimit: '0x1000',
      paymasterPostOpGasLimit: '0x2000',
    };
    expect(UserOperationV07Schema.safeParse(withOptional).success).toBe(true);

    // Invalid sender (wrong length)
    const invalidSender = { ...validOp, sender: '0x1234' };
    expect(UserOperationV07Schema.safeParse(invalidSender).success).toBe(false);
  });

  // Test 2: UserOpBuildRequestSchema reuses TransactionRequestSchema + network
  it('T2: UserOpBuildRequestSchema has request + network', async () => {
    const { UserOpBuildRequestSchema } = await import('../schemas/userop.schema.js');

    const valid = {
      request: {
        type: 'TRANSFER',
        to: '0x1234567890abcdef1234567890abcdef12345678',
        amount: '1000000000000000000',
        network: 'ethereum-sepolia',
      },
      network: 'ethereum-sepolia',
    };
    const result = UserOpBuildRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);

    // Missing network should fail
    const noNetwork = {
      request: {
        type: 'TRANSFER',
        to: '0x1234567890abcdef1234567890abcdef12345678',
        amount: '1000000000000000000',
      },
    };
    expect(UserOpBuildRequestSchema.safeParse(noNetwork).success).toBe(false);
  });

  // Test 3: UserOpBuildResponseSchema has sender/nonce/callData/entryPoint/buildId, no gas/paymaster
  it('T3: UserOpBuildResponseSchema has correct fields, no gas/paymaster', async () => {
    const { UserOpBuildResponseSchema } = await import('../schemas/userop.schema.js');

    const valid = {
      sender: '0x1234567890abcdef1234567890abcdef12345678',
      nonce: '0x01',
      callData: '0xabcdef',
      factory: null,
      factoryData: null,
      entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      buildId: '01234567-89ab-cdef-0123-456789abcdef',
    };
    const result = UserOpBuildResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);

    // Verify gas/paymaster fields are NOT in the schema shape
    const withGas = { ...valid, callGasLimit: '0x5208' };
    const parsed = UserOpBuildResponseSchema.safeParse(withGas);
    // Extra fields should be stripped (Zod default behavior)
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as any).callGasLimit).toBeUndefined();
    }
  });

  // Test 4: UserOpSignRequestSchema has buildId + userOperation
  it('T4: UserOpSignRequestSchema validates buildId + userOperation', async () => {
    const { UserOpSignRequestSchema } = await import('../schemas/userop.schema.js');

    const valid = {
      buildId: '01234567-89ab-cdef-0123-456789abcdef',
      userOperation: {
        sender: '0x1234567890abcdef1234567890abcdef12345678',
        nonce: '0x01',
        callData: '0xabcdef',
        callGasLimit: '0x5208',
        verificationGasLimit: '0x5208',
        preVerificationGas: '0x5208',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
        signature: '0x',
        paymaster: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        paymasterData: '0x1234',
        paymasterVerificationGasLimit: '0x1000',
        paymasterPostOpGasLimit: '0x2000',
      },
    };
    const result = UserOpSignRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  // Test 5: UserOpSignResponseSchema has signedUserOperation + txId
  it('T5: UserOpSignResponseSchema validates signedUserOperation + txId', async () => {
    const { UserOpSignResponseSchema } = await import('../schemas/userop.schema.js');

    const valid = {
      signedUserOperation: {
        sender: '0x1234567890abcdef1234567890abcdef12345678',
        nonce: '0x01',
        callData: '0xabcdef',
        callGasLimit: '0x5208',
        verificationGasLimit: '0x5208',
        preVerificationGas: '0x5208',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x3b9aca00',
        signature: '0xdeadbeef1234567890',
      },
      txId: '01234567-89ab-cdef-0123-456789abcdef',
    };
    const result = UserOpSignResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe('UserOp Error Codes', () => {
  // Test 6: All 5 error codes exist in ERROR_CODES
  it('T6: EXPIRED_BUILD, BUILD_NOT_FOUND, BUILD_ALREADY_USED, CALLDATA_MISMATCH, SENDER_MISMATCH exist', () => {
    expect(ERROR_CODES.EXPIRED_BUILD).toBeDefined();
    expect(ERROR_CODES.BUILD_NOT_FOUND).toBeDefined();
    expect(ERROR_CODES.BUILD_ALREADY_USED).toBeDefined();
    expect(ERROR_CODES.CALLDATA_MISMATCH).toBeDefined();
    expect(ERROR_CODES.SENDER_MISMATCH).toBeDefined();
  });

  // Test 7: Correct httpStatus values
  it('T7: correct httpStatus for each error code', () => {
    expect(ERROR_CODES.EXPIRED_BUILD.httpStatus).toBe(400);
    expect(ERROR_CODES.BUILD_NOT_FOUND.httpStatus).toBe(404);
    expect(ERROR_CODES.BUILD_ALREADY_USED.httpStatus).toBe(409);
    expect(ERROR_CODES.CALLDATA_MISMATCH.httpStatus).toBe(400);
    expect(ERROR_CODES.SENDER_MISMATCH.httpStatus).toBe(400);
  });

  // Test 8: All have USEROP domain
  it('T8: all have USEROP domain', () => {
    expect(ERROR_CODES.EXPIRED_BUILD.domain).toBe('USEROP');
    expect(ERROR_CODES.BUILD_NOT_FOUND.domain).toBe('USEROP');
    expect(ERROR_CODES.BUILD_ALREADY_USED.domain).toBe('USEROP');
    expect(ERROR_CODES.CALLDATA_MISMATCH.domain).toBe('USEROP');
    expect(ERROR_CODES.SENDER_MISMATCH.domain).toBe('USEROP');
  });
});
