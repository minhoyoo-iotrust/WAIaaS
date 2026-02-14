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
  ParsedTransaction,
  ParsedOperation,
  ParsedOperationType,
  SignedTransaction,
} from '../index.js';

/**
 * IChainAdapter 22-method interface verification.
 *
 * This test documents the complete method list and verifies type-level
 * correctness via TypeScript compilation. If the interface changes in
 * an incompatible way, these tests will fail to compile.
 */
describe('IChainAdapter 22-method interface', () => {
  /**
   * The complete list of 22 methods in IChainAdapter.
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
    // Sign-only operations (2) -- v1.4.7
    'parseTransaction',
    'signExternalTransaction',
  ] as const;

  it('should have exactly 22 methods defined', () => {
    expect(EXPECTED_METHODS).toHaveLength(22);
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

  it('v1.4.7 sign-only types are importable (ParsedTransaction, ParsedOperation, ParsedOperationType, SignedTransaction)', () => {
    const _parsed: ParsedTransaction | null = null;
    const _op: ParsedOperation | null = null;
    const _opType: ParsedOperationType | null = null;
    const _signed: SignedTransaction | null = null;
    expect(_parsed).toBeNull();
    expect(_op).toBeNull();
    expect(_opType).toBeNull();
    expect(_signed).toBeNull();
  });

  it('IChainAdapter type includes all 22 methods (compile-time verification)', () => {
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
      parseTransaction: true,
      signExternalTransaction: true,
    } satisfies Record<MethodKeys, true>;

    expect(Object.keys(_check)).toHaveLength(22);
  });
});
