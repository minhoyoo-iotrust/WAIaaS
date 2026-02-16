/**
 * IChainAdapter Contract Test -- shared suite.
 *
 * This file exports `chainAdapterContractTests`, a factory that generates
 * a full describe-block verifying 22 IChainAdapter methods for **shape**
 * conformance (return-type structure, not concrete values).
 *
 * Usage: import into adapter-specific test files and call with a factory
 * function that produces the adapter under test.
 *
 * CTST-01: MockChainAdapter vs SolanaAdapter
 * CTST-02: MockChainAdapter vs EvmAdapter (buildBatch -> BATCH_NOT_SUPPORTED)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type {
  IChainAdapter,
  ChainType,
  TransferRequest,
  UnsignedTransaction,
  TokenTransferParams,
  ContractCallParams,
  ApproveParams,
  BatchParams,
} from '../../index.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ChainAdapterContractOptions {
  /** SolanaAdapter -> 'solana', EvmAdapter -> 'ethereum' */
  expectedChain: ChainType;
  /** A valid address for the target chain (used in getBalance, etc.) */
  validAddress: string;
  /** A second valid address for transfer destinations */
  validAddress2?: string;
  /** If true, buildBatch must throw BATCH_NOT_SUPPORTED (EVM) */
  batchNotSupported?: boolean;
  /** If provided, connect() is called before pipeline tests */
  rpcUrl?: string;
  /** Private key for signTransaction / signExternalTransaction */
  privateKey?: Uint8Array;
  /**
   * Methods to skip entirely (e.g. methods whose RPC mocking is too complex).
   * Each entry is the method name.
   */
  skipMethods?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shouldSkip(opts: ChainAdapterContractOptions, method: string): boolean {
  return opts.skipMethods?.includes(method) ?? false;
}

/** Build a minimal TransferRequest for testing. */
function makeTransferRequest(opts: ChainAdapterContractOptions): TransferRequest {
  return {
    from: opts.validAddress,
    to: opts.validAddress2 ?? opts.validAddress,
    amount: 1000n,
  };
}

/** Build a minimal TokenTransferParams for testing. */
function makeTokenTransferParams(opts: ChainAdapterContractOptions): TokenTransferParams {
  return {
    from: opts.validAddress,
    to: opts.validAddress2 ?? opts.validAddress,
    amount: 1000n,
    token: { address: opts.validAddress, decimals: 6, symbol: 'USDC' },
  };
}

/** Build a minimal ContractCallParams for testing. */
function makeContractCallParams(opts: ChainAdapterContractOptions): ContractCallParams {
  return {
    from: opts.validAddress,
    to: opts.validAddress2 ?? opts.validAddress,
    programId: opts.validAddress,
    instructionData: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    calldata: '0xdeadbeef00000000',
    accounts: [{ pubkey: opts.validAddress, isSigner: true, isWritable: true }],
  };
}

/** Build a minimal ApproveParams for testing. */
function makeApproveParams(opts: ChainAdapterContractOptions): ApproveParams {
  return {
    from: opts.validAddress,
    spender: opts.validAddress2 ?? opts.validAddress,
    token: { address: opts.validAddress, decimals: 6, symbol: 'USDC' },
    amount: 1000n,
  };
}

/** Build a minimal BatchParams for testing. */
function makeBatchParams(opts: ChainAdapterContractOptions): BatchParams {
  return {
    from: opts.validAddress,
    instructions: [
      { from: opts.validAddress, to: opts.validAddress2 ?? opts.validAddress, amount: 500n },
      { from: opts.validAddress, to: opts.validAddress2 ?? opts.validAddress, amount: 500n },
    ],
  };
}

// ---------------------------------------------------------------------------
// Contract Test Factory
// ---------------------------------------------------------------------------

/**
 * Generate a full IChainAdapter contract test suite.
 *
 * @param factory  - Function returning an IChainAdapter (or Promise<IChainAdapter>).
 *                   Called once in beforeAll.
 * @param options  - Configuration controlling chain-specific behavior.
 */
export function chainAdapterContractTests(
  factory: () => IChainAdapter | Promise<IChainAdapter>,
  options: ChainAdapterContractOptions,
): void {
  let adapter: IChainAdapter;

  beforeAll(async () => {
    adapter = await factory();
  });

  // ========================================================================
  // 1. Readonly Properties (2)
  // ========================================================================

  describe('readonly properties', () => {
    it('chain must be a valid ChainType', () => {
      expect(
        ['solana', 'ethereum'].includes(adapter.chain),
        `IChainAdapter.chain: expected 'solana' | 'ethereum', got '${adapter.chain}'`,
      ).toBe(true);
      expect(adapter.chain).toBe(options.expectedChain);
    });

    it('network must be a string (valid NetworkType)', () => {
      expect(
        typeof adapter.network === 'string' && adapter.network.length > 0,
        `IChainAdapter.network: expected non-empty string, got '${String(adapter.network)}'`,
      ).toBe(true);
    });
  });

  // ========================================================================
  // 2. Connection (4): connect, disconnect, isConnected, getHealth
  // ========================================================================

  describe('connection methods', () => {
    it('isConnected() returns boolean', () => {
      if (shouldSkip(options, 'isConnected')) return;
      const result = adapter.isConnected();
      expect(
        typeof result === 'boolean',
        `IChainAdapter.isConnected: expected boolean, got ${typeof result}`,
      ).toBe(true);
    });

    it('getHealth() returns HealthInfo shape', async () => {
      if (shouldSkip(options, 'getHealth')) return;
      const health = await adapter.getHealth();
      expect(
        typeof health.healthy === 'boolean',
        `IChainAdapter.getHealth: healthy must be boolean, got ${typeof health.healthy}`,
      ).toBe(true);
      expect(
        typeof health.latencyMs === 'number',
        `IChainAdapter.getHealth: latencyMs must be number, got ${typeof health.latencyMs}`,
      ).toBe(true);
    });

    it('connect() + isConnected() returns true', async () => {
      if (shouldSkip(options, 'connect')) return;
      if (!options.rpcUrl) return; // skip if no RPC URL provided
      await adapter.connect(options.rpcUrl);
      expect(
        adapter.isConnected(),
        'IChainAdapter.connect: after connect(), isConnected() must return true',
      ).toBe(true);
    });

    it('disconnect() + isConnected() returns false', async () => {
      if (shouldSkip(options, 'disconnect')) return;
      await adapter.disconnect();
      expect(
        adapter.isConnected(),
        'IChainAdapter.disconnect: after disconnect(), isConnected() must return false',
      ).toBe(false);
      // Reconnect for subsequent tests
      if (options.rpcUrl) {
        await adapter.connect(options.rpcUrl);
      }
    });
  });

  // ========================================================================
  // 3. Balance (1): getBalance
  // ========================================================================

  describe('balance', () => {
    it('getBalance() returns BalanceInfo shape', async () => {
      if (shouldSkip(options, 'getBalance')) return;
      const balance = await adapter.getBalance(options.validAddress);
      expect(
        typeof balance.address === 'string',
        `IChainAdapter.getBalance: address must be string, got ${typeof balance.address}`,
      ).toBe(true);
      expect(
        typeof balance.balance === 'bigint',
        `IChainAdapter.getBalance: balance must be bigint, got ${typeof balance.balance}`,
      ).toBe(true);
      expect(
        typeof balance.decimals === 'number',
        `IChainAdapter.getBalance: decimals must be number, got ${typeof balance.decimals}`,
      ).toBe(true);
      expect(
        typeof balance.symbol === 'string',
        `IChainAdapter.getBalance: symbol must be string, got ${typeof balance.symbol}`,
      ).toBe(true);
    });
  });

  // ========================================================================
  // 4. Pipeline (4): buildTransaction, simulateTransaction, signTransaction, submitTransaction
  // ========================================================================

  describe('transaction pipeline', () => {
    let builtTx: UnsignedTransaction;

    it('buildTransaction() returns UnsignedTransaction shape', async () => {
      if (shouldSkip(options, 'buildTransaction')) return;
      builtTx = await adapter.buildTransaction(makeTransferRequest(options));
      assertUnsignedTransactionShape(builtTx, 'buildTransaction');
    });

    it('simulateTransaction() returns SimulationResult shape', async () => {
      if (shouldSkip(options, 'simulateTransaction')) return;
      if (!builtTx) builtTx = await adapter.buildTransaction(makeTransferRequest(options));
      const result = await adapter.simulateTransaction(builtTx);
      expect(
        typeof result.success === 'boolean',
        `IChainAdapter.simulateTransaction: success must be boolean, got ${typeof result.success}`,
      ).toBe(true);
      expect(
        Array.isArray(result.logs),
        `IChainAdapter.simulateTransaction: logs must be array, got ${typeof result.logs}`,
      ).toBe(true);
    });

    it('signTransaction() returns Uint8Array with length > 0', async () => {
      if (shouldSkip(options, 'signTransaction')) return;
      if (!options.privateKey) return;
      if (!builtTx) builtTx = await adapter.buildTransaction(makeTransferRequest(options));
      const signed = await adapter.signTransaction(builtTx, options.privateKey);
      expect(
        signed instanceof Uint8Array,
        `IChainAdapter.signTransaction: must return Uint8Array, got ${typeof signed}`,
      ).toBe(true);
      expect(
        signed.length > 0,
        'IChainAdapter.signTransaction: returned Uint8Array must have length > 0',
      ).toBe(true);
    });

    it('submitTransaction() returns SubmitResult shape', async () => {
      if (shouldSkip(options, 'submitTransaction')) return;
      if (!options.privateKey) return;
      if (!builtTx) builtTx = await adapter.buildTransaction(makeTransferRequest(options));
      const signed = await adapter.signTransaction(builtTx, options.privateKey);
      const result = await adapter.submitTransaction(signed);
      assertSubmitResultShape(result, 'submitTransaction');
    });
  });

  // ========================================================================
  // 5. Confirmation (1): waitForConfirmation
  // ========================================================================

  describe('confirmation', () => {
    it('waitForConfirmation() returns SubmitResult shape', async () => {
      if (shouldSkip(options, 'waitForConfirmation')) return;
      const result = await adapter.waitForConfirmation('mock-tx-hash-1234');
      assertSubmitResultShape(result, 'waitForConfirmation');
    });
  });

  // ========================================================================
  // 6. Assets (1): getAssets
  // ========================================================================

  describe('assets', () => {
    it('getAssets() returns AssetInfo[] shape', async () => {
      if (shouldSkip(options, 'getAssets')) return;
      const assets = await adapter.getAssets(options.validAddress);
      expect(
        Array.isArray(assets),
        `IChainAdapter.getAssets: must return array, got ${typeof assets}`,
      ).toBe(true);
      if (assets.length > 0) {
        const first = assets[0]!;
        expect(
          typeof first.mint === 'string',
          `IChainAdapter.getAssets: each element must have mint:string`,
        ).toBe(true);
        expect(
          typeof first.symbol === 'string',
          `IChainAdapter.getAssets: each element must have symbol:string`,
        ).toBe(true);
        expect(
          typeof first.balance === 'bigint',
          `IChainAdapter.getAssets: each element must have balance:bigint`,
        ).toBe(true);
        expect(
          typeof first.decimals === 'number',
          `IChainAdapter.getAssets: each element must have decimals:number`,
        ).toBe(true);
        expect(
          typeof first.isNative === 'boolean',
          `IChainAdapter.getAssets: each element must have isNative:boolean`,
        ).toBe(true);
      }
    });
  });

  // ========================================================================
  // 7. Fee (1): estimateFee
  // ========================================================================

  describe('fee estimation', () => {
    it('estimateFee() returns FeeEstimate shape', async () => {
      if (shouldSkip(options, 'estimateFee')) return;
      const fee = await adapter.estimateFee(makeTransferRequest(options));
      expect(
        typeof fee.fee === 'bigint',
        `IChainAdapter.estimateFee: fee must be bigint, got ${typeof fee.fee}`,
      ).toBe(true);
    });
  });

  // ========================================================================
  // 8. Token (2): buildTokenTransfer, getTokenInfo
  // ========================================================================

  describe('token operations', () => {
    it('buildTokenTransfer() returns UnsignedTransaction shape', async () => {
      if (shouldSkip(options, 'buildTokenTransfer')) return;
      const tx = await adapter.buildTokenTransfer(makeTokenTransferParams(options));
      assertUnsignedTransactionShape(tx, 'buildTokenTransfer');
    });

    it('getTokenInfo() returns TokenInfo shape', async () => {
      if (shouldSkip(options, 'getTokenInfo')) return;
      const info = await adapter.getTokenInfo(options.validAddress);
      expect(
        typeof info.address === 'string',
        `IChainAdapter.getTokenInfo: address must be string`,
      ).toBe(true);
      expect(
        typeof info.symbol === 'string',
        `IChainAdapter.getTokenInfo: symbol must be string`,
      ).toBe(true);
      expect(
        typeof info.name === 'string',
        `IChainAdapter.getTokenInfo: name must be string`,
      ).toBe(true);
      expect(
        typeof info.decimals === 'number',
        `IChainAdapter.getTokenInfo: decimals must be number`,
      ).toBe(true);
    });
  });

  // ========================================================================
  // 9. Contract (2): buildContractCall, buildApprove
  // ========================================================================

  describe('contract operations', () => {
    it('buildContractCall() returns UnsignedTransaction shape', async () => {
      if (shouldSkip(options, 'buildContractCall')) return;
      const tx = await adapter.buildContractCall(makeContractCallParams(options));
      assertUnsignedTransactionShape(tx, 'buildContractCall');
    });

    it('buildApprove() returns UnsignedTransaction shape', async () => {
      if (shouldSkip(options, 'buildApprove')) return;
      const tx = await adapter.buildApprove(makeApproveParams(options));
      assertUnsignedTransactionShape(tx, 'buildApprove');
    });
  });

  // ========================================================================
  // 10. Batch (1): buildBatch
  // ========================================================================

  describe('batch operations', () => {
    if (options.batchNotSupported) {
      it('buildBatch() throws BATCH_NOT_SUPPORTED', async () => {
        if (shouldSkip(options, 'buildBatch')) return;
        try {
          await adapter.buildBatch(makeBatchParams(options));
          // Should have thrown
          expect.fail('IChainAdapter.buildBatch: expected BATCH_NOT_SUPPORTED error but did not throw');
        } catch (error: unknown) {
          // Check the error code or message contains BATCH_NOT_SUPPORTED
          const err = error as { code?: string; message?: string };
          const hasBatchNotSupported =
            err.code === 'BATCH_NOT_SUPPORTED' ||
            (err.message ?? '').includes('BATCH_NOT_SUPPORTED') ||
            (err.message ?? '').includes('batch');
          expect(
            hasBatchNotSupported,
            `IChainAdapter.buildBatch: expected BATCH_NOT_SUPPORTED error, got code=${err.code} message=${err.message}`,
          ).toBe(true);
        }
      });
    } else {
      it('buildBatch() returns UnsignedTransaction shape', async () => {
        if (shouldSkip(options, 'buildBatch')) return;
        const tx = await adapter.buildBatch(makeBatchParams(options));
        assertUnsignedTransactionShape(tx, 'buildBatch');
      });
    }
  });

  // ========================================================================
  // 11. Utility (3): getTransactionFee, getCurrentNonce, sweepAll
  // ========================================================================

  describe('utility operations', () => {
    it('getTransactionFee() returns bigint', async () => {
      if (shouldSkip(options, 'getTransactionFee')) return;
      // Build a tx first to pass to getTransactionFee
      const tx = await adapter.buildTransaction(makeTransferRequest(options));
      const fee = await adapter.getTransactionFee(tx);
      expect(
        typeof fee === 'bigint',
        `IChainAdapter.getTransactionFee: must return bigint, got ${typeof fee}`,
      ).toBe(true);
    });

    it('getCurrentNonce() returns number', async () => {
      if (shouldSkip(options, 'getCurrentNonce')) return;
      const nonce = await adapter.getCurrentNonce(options.validAddress);
      expect(
        typeof nonce === 'number',
        `IChainAdapter.getCurrentNonce: must return number, got ${typeof nonce}`,
      ).toBe(true);
    });

    it('sweepAll() returns SweepResult shape', async () => {
      if (shouldSkip(options, 'sweepAll')) return;
      if (!options.privateKey) return;
      const result = await adapter.sweepAll(
        options.validAddress,
        options.validAddress2 ?? options.validAddress,
        options.privateKey,
      );
      expect(
        typeof result.total === 'number',
        `IChainAdapter.sweepAll: total must be number, got ${typeof result.total}`,
      ).toBe(true);
      expect(
        typeof result.succeeded === 'number',
        `IChainAdapter.sweepAll: succeeded must be number, got ${typeof result.succeeded}`,
      ).toBe(true);
      expect(
        typeof result.failed === 'number',
        `IChainAdapter.sweepAll: failed must be number, got ${typeof result.failed}`,
      ).toBe(true);
      expect(
        Array.isArray(result.results),
        `IChainAdapter.sweepAll: results must be array, got ${typeof result.results}`,
      ).toBe(true);
      if (result.results.length > 0) {
        const r = result.results[0]!;
        expect(typeof r.mint === 'string', 'IChainAdapter.sweepAll: result.mint must be string').toBe(true);
        expect(typeof r.amount === 'bigint', 'IChainAdapter.sweepAll: result.amount must be bigint').toBe(true);
      }
    });
  });

  // ========================================================================
  // 12. Sign-only (2): parseTransaction, signExternalTransaction
  // ========================================================================

  describe('sign-only operations', () => {
    it('parseTransaction() returns ParsedTransaction shape', async () => {
      if (shouldSkip(options, 'parseTransaction')) return;
      // Use a mock raw transaction string (base64 for Solana, hex for EVM)
      const rawTx = options.expectedChain === 'solana' ? 'AAAAAAAAAA==' : '0xdeadbeef';
      const parsed = await adapter.parseTransaction(rawTx);
      expect(
        Array.isArray(parsed.operations),
        `IChainAdapter.parseTransaction: operations must be array, got ${typeof parsed.operations}`,
      ).toBe(true);
      expect(
        typeof parsed.rawTx === 'string',
        `IChainAdapter.parseTransaction: rawTx must be string, got ${typeof parsed.rawTx}`,
      ).toBe(true);
    });

    it('signExternalTransaction() returns SignedTransaction shape', async () => {
      if (shouldSkip(options, 'signExternalTransaction')) return;
      if (!options.privateKey) return;
      const rawTx = options.expectedChain === 'solana' ? 'AAAAAAAAAA==' : '0xdeadbeef';
      const signed = await adapter.signExternalTransaction(rawTx, options.privateKey);
      expect(
        typeof signed.signedTransaction === 'string',
        `IChainAdapter.signExternalTransaction: signedTransaction must be string, got ${typeof signed.signedTransaction}`,
      ).toBe(true);
    });
  });
}

// ---------------------------------------------------------------------------
// Shared assertion helpers
// ---------------------------------------------------------------------------

function assertUnsignedTransactionShape(tx: UnsignedTransaction, method: string): void {
  expect(
    ['solana', 'ethereum'].includes(tx.chain),
    `IChainAdapter.${method}: chain must be 'solana' | 'ethereum', got '${tx.chain}'`,
  ).toBe(true);
  expect(
    tx.serialized instanceof Uint8Array,
    `IChainAdapter.${method}: serialized must be Uint8Array`,
  ).toBe(true);
  expect(
    typeof tx.estimatedFee === 'bigint',
    `IChainAdapter.${method}: estimatedFee must be bigint, got ${typeof tx.estimatedFee}`,
  ).toBe(true);
  expect(
    tx.metadata !== null && typeof tx.metadata === 'object',
    `IChainAdapter.${method}: metadata must be object`,
  ).toBe(true);
}

function assertSubmitResultShape(result: { txHash: string; status: string }, method: string): void {
  expect(
    typeof result.txHash === 'string',
    `IChainAdapter.${method}: txHash must be string, got ${typeof result.txHash}`,
  ).toBe(true);
  expect(
    typeof result.status === 'string',
    `IChainAdapter.${method}: status must be string, got ${typeof result.status}`,
  ).toBe(true);
}
