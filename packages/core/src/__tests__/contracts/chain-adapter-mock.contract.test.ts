/**
 * Contract Test: MockChainAdapter
 *
 * Verifies that a complete 22-method MockChainAdapter passes the shared
 * IChainAdapter contract test suite. This serves as the baseline --
 * if Mock passes, any real adapter that also passes the same suite is
 * guaranteed to have identical return-type shapes.
 *
 * CTST-01 / CTST-02: MockChainAdapter as reference implementation.
 */

import { describe } from 'vitest';
import type {
  IChainAdapter,
  ChainType,
  NetworkType,
  TransferRequest,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  AssetInfo,
  FeeEstimate,
  TokenInfo,
  SweepResult,
  TokenTransferParams,
  ContractCallParams,
  ApproveParams,
  BatchParams,
  ParsedTransaction,
  SignedTransaction,
} from '../../index.js';
import { chainAdapterContractTests } from './chain-adapter.contract.js';

// ---------------------------------------------------------------------------
// Complete MockChainAdapter (22 methods)
// ---------------------------------------------------------------------------

/**
 * Contract-test-specific MockChainAdapter implementing all 22 IChainAdapter methods.
 *
 * This is separate from the daemon-harness MockChainAdapter (which only has 10 methods).
 * Returns deterministic mock data conforming to each interface's shape.
 */
class ContractTestMockChainAdapter implements IChainAdapter {
  readonly chain: ChainType;
  readonly network: NetworkType;
  private _connected = false;

  constructor(chain: ChainType, network: NetworkType) {
    this.chain = chain;
    this.network = network;
  }

  // -- Connection management (4) --

  async connect(_rpcUrl: string): Promise<void> {
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async getHealth(): Promise<HealthInfo> {
    return { healthy: true, latencyMs: 5, blockHeight: 1000n };
  }

  // -- Balance query (1) --

  async getBalance(address: string): Promise<BalanceInfo> {
    return {
      address,
      balance: 1_000_000_000n, // 1 SOL
      decimals: 9,
      symbol: 'SOL',
    };
  }

  // -- Transaction pipeline (4) --

  async buildTransaction(request: TransferRequest): Promise<UnsignedTransaction> {
    return {
      chain: this.chain,
      serialized: new Uint8Array(200),
      estimatedFee: 5000n,
      metadata: { from: request.from, to: request.to },
    };
  }

  async simulateTransaction(_tx: UnsignedTransaction): Promise<SimulationResult> {
    return { success: true, logs: ['mock simulation ok'] };
  }

  async signTransaction(_tx: UnsignedTransaction, _privateKey: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(200);
  }

  async submitTransaction(_signedTx: Uint8Array): Promise<SubmitResult> {
    return {
      txHash: 'mock-tx-abcd1234',
      status: 'submitted',
    };
  }

  // -- Confirmation (1) --

  async waitForConfirmation(txHash: string, _timeoutMs?: number): Promise<SubmitResult> {
    return {
      txHash,
      status: 'confirmed',
      confirmations: 1,
    };
  }

  // -- Asset query (1) --

  async getAssets(_address: string): Promise<AssetInfo[]> {
    return [
      {
        mint: 'native',
        symbol: 'SOL',
        name: 'Solana',
        balance: 1_000_000_000n,
        decimals: 9,
        isNative: true,
      },
    ];
  }

  // -- Fee estimation (1) --

  async estimateFee(_request: TransferRequest | TokenTransferParams): Promise<FeeEstimate> {
    return { fee: 5000n };
  }

  // -- Token operations (2) --

  async buildTokenTransfer(_request: TokenTransferParams): Promise<UnsignedTransaction> {
    return {
      chain: this.chain,
      serialized: new Uint8Array(250),
      estimatedFee: 5000n,
      metadata: { type: 'token_transfer' },
    };
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    return {
      address: tokenAddress,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
    };
  }

  // -- Contract operations (2) --

  async buildContractCall(_request: ContractCallParams): Promise<UnsignedTransaction> {
    return {
      chain: this.chain,
      serialized: new Uint8Array(300),
      estimatedFee: 5000n,
      metadata: { type: 'contract_call' },
    };
  }

  async buildApprove(_request: ApproveParams): Promise<UnsignedTransaction> {
    return {
      chain: this.chain,
      serialized: new Uint8Array(250),
      estimatedFee: 5000n,
      metadata: { type: 'approve' },
    };
  }

  // -- Batch operations (1) --

  async buildBatch(_request: BatchParams): Promise<UnsignedTransaction> {
    return {
      chain: this.chain,
      serialized: new Uint8Array(400),
      estimatedFee: 10000n,
      metadata: { type: 'batch', instructionCount: 2 },
    };
  }

  // -- Utility operations (3) --

  async getTransactionFee(tx: UnsignedTransaction): Promise<bigint> {
    return tx.estimatedFee;
  }

  async getCurrentNonce(_address: string): Promise<number> {
    return 0;
  }

  async sweepAll(_from: string, _to: string, _privateKey: Uint8Array): Promise<SweepResult> {
    return {
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [
        { mint: 'native', txHash: 'mock-sweep-tx', amount: 1_000_000_000n },
      ],
    };
  }

  // -- Sign-only operations (2) --

  async parseTransaction(rawTx: string): Promise<ParsedTransaction> {
    return { operations: [{ type: 'UNKNOWN' }], rawTx };
  }

  async signExternalTransaction(_rawTx: string, _privateKey: Uint8Array): Promise<SignedTransaction> {
    return { signedTransaction: 'mock-signed-external-tx' };
  }
}

// ---------------------------------------------------------------------------
// Run Contract Tests
// ---------------------------------------------------------------------------

describe('CT-1/CT-2: MockChainAdapter Contract Tests', () => {
  chainAdapterContractTests(
    () => {
      const adapter = new ContractTestMockChainAdapter('solana', 'devnet');
      // Pre-connect so pipeline tests work
      adapter.connect('http://mock-rpc');
      return adapter;
    },
    {
      expectedChain: 'solana',
      validAddress: 'So11111111111111111111111111111112',
      batchNotSupported: false,
      rpcUrl: 'http://mock-rpc',
      privateKey: new Uint8Array(64).fill(0x42),
    },
  );
});
