import { describe, it, expect } from 'vitest';
import type {
  IChainAdapter,
  FeeEstimate,
  TokenInfo,
  SweepResult,
  TokenTransferParams,
  ContractCallParams,
  ApproveParams,
  BatchParams,
} from '../index.js';

/**
 * IChainAdapter 20-method interface verification.
 *
 * This test documents the complete method list and verifies type-level
 * correctness via TypeScript compilation. If the interface changes in
 * an incompatible way, these tests will fail to compile.
 */
describe('IChainAdapter 20-method interface', () => {
  /**
   * The complete list of 20 methods in IChainAdapter.
   * This serves as living documentation of the interface contract.
   */
  const EXPECTED_METHODS = [
    // Connection management (4)
    'connect',
    'disconnect',
    'isConnected',
    'getHealth',
    // Balance query (1)
    'getBalance',
    // Transaction pipeline (4)
    'buildTransaction',
    'simulateTransaction',
    'signTransaction',
    'submitTransaction',
    // Confirmation (1)
    'waitForConfirmation',
    // Asset query (1)
    'getAssets',
    // Fee estimation (1)
    'estimateFee',
    // Token operations (2)
    'buildTokenTransfer',
    'getTokenInfo',
    // Contract operations (2)
    'buildContractCall',
    'buildApprove',
    // Batch operations (1)
    'buildBatch',
    // Utility operations (3)
    'getTransactionFee',
    'getCurrentNonce',
    'sweepAll',
  ] as const;

  it('should have exactly 20 methods defined', () => {
    expect(EXPECTED_METHODS).toHaveLength(20);
  });

  it('v1.4 new types are importable (FeeEstimate, TokenInfo, SweepResult)', () => {
    const _fee: FeeEstimate | null = null;
    const _info: TokenInfo | null = null;
    const _sweep: SweepResult | null = null;
    expect(_fee).toBeNull();
    expect(_info).toBeNull();
    expect(_sweep).toBeNull();
  });

  it('v1.4 new param types are importable (TokenTransferParams, ContractCallParams, ApproveParams, BatchParams)', () => {
    const _tokenTransfer: TokenTransferParams | null = null;
    const _contractCall: ContractCallParams | null = null;
    const _approve: ApproveParams | null = null;
    const _batch: BatchParams | null = null;
    expect(_tokenTransfer).toBeNull();
    expect(_contractCall).toBeNull();
    expect(_approve).toBeNull();
    expect(_batch).toBeNull();
  });

  it('IChainAdapter type includes all 20 methods (compile-time verification)', () => {
    // Type-level assertion: if IChainAdapter is missing any method,
    // this function type would fail to compile.
    type MethodKeys = keyof Omit<IChainAdapter, 'chain' | 'network'>;
    type ExpectedMethod = (typeof EXPECTED_METHODS)[number];

    // Compile-time: every expected method is a key of IChainAdapter
    const _check: Record<ExpectedMethod, true> = {
      connect: true,
      disconnect: true,
      isConnected: true,
      getHealth: true,
      getBalance: true,
      buildTransaction: true,
      simulateTransaction: true,
      signTransaction: true,
      submitTransaction: true,
      waitForConfirmation: true,
      getAssets: true,
      estimateFee: true,
      buildTokenTransfer: true,
      getTokenInfo: true,
      buildContractCall: true,
      buildApprove: true,
      buildBatch: true,
      getTransactionFee: true,
      getCurrentNonce: true,
      sweepAll: true,
    } satisfies Record<MethodKeys, true>;

    expect(Object.keys(_check)).toHaveLength(20);
  });
});
