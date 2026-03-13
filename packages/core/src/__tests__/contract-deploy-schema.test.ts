/**
 * CONTRACT_DEPLOY Zod schema tests (v31.14 DEPL-01/DEPL-02).
 *
 * TDD RED phase: these tests must FAIL before implementation.
 */

import { describe, it, expect } from 'vitest';
import {
  TRANSACTION_TYPES,
  TransactionTypeEnum,
  TransactionRequestSchema,
  TransactionSchema,
} from '../index.js';

// Import will fail until ContractDeployRequestSchema is implemented
// eslint-disable-next-line @typescript-eslint/no-require-imports
let ContractDeployRequestSchema: any;
try {
  // Dynamic import to allow test file to be parsed even before export exists
  const mod = await import('../index.js');
  ContractDeployRequestSchema = (mod as any).ContractDeployRequestSchema;
} catch {
  // Will be undefined, tests will fail (RED)
}

describe('CONTRACT_DEPLOY schema (v31.14)', () => {
  it('TRANSACTION_TYPES has 9 elements and includes CONTRACT_DEPLOY', () => {
    expect(TRANSACTION_TYPES).toHaveLength(9);
    expect(TRANSACTION_TYPES).toContain('CONTRACT_DEPLOY');
  });

  it('TransactionTypeEnum.parse("CONTRACT_DEPLOY") succeeds', () => {
    expect(TransactionTypeEnum.parse('CONTRACT_DEPLOY')).toBe('CONTRACT_DEPLOY');
  });

  it('ContractDeployRequestSchema parses valid request with bytecode', () => {
    expect(ContractDeployRequestSchema).toBeDefined();
    const result = ContractDeployRequestSchema.parse({
      type: 'CONTRACT_DEPLOY',
      bytecode: '0x6080604052',
      value: '0',
    });
    expect(result.type).toBe('CONTRACT_DEPLOY');
    expect(result.bytecode).toBe('0x6080604052');
  });

  it('ContractDeployRequestSchema rejects request without bytecode', () => {
    expect(ContractDeployRequestSchema).toBeDefined();
    expect(() =>
      ContractDeployRequestSchema.parse({ type: 'CONTRACT_DEPLOY' }),
    ).toThrow();
  });

  it('TransactionRequestSchema parses CONTRACT_DEPLOY (7-type union)', () => {
    const result = TransactionRequestSchema.parse({
      type: 'CONTRACT_DEPLOY',
      bytecode: '0x6080604052',
    });
    expect(result.type).toBe('CONTRACT_DEPLOY');
  });

  it('TransactionSchema parses toAddress: null', () => {
    const result = TransactionSchema.parse({
      id: '00000000-0000-0000-0000-000000000001',
      walletId: '00000000-0000-0000-0000-000000000002',
      sessionId: null,
      type: 'TRANSFER',
      status: 'PENDING',
      tier: null,
      chain: 'ethereum',
      network: null,
      fromAddress: '0xabc',
      toAddress: null,
      amount: '0',
      txHash: null,
      errorMessage: null,
      metadata: null,
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(result.toAddress).toBeNull();
  });
});
