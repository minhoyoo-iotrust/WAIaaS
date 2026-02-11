/**
 * EvmAdapter -- IChainAdapter implementation for EVM chains using viem 2.x.
 *
 * Phase 77-01: Scaffolding with 5 real implementations + 15 stubs.
 *
 * Real implementations (5):
 *   connect, disconnect, isConnected, getHealth, getBalance, getCurrentNonce
 *
 * Stubs for Phase 77-02+:
 *   buildTransaction, simulateTransaction, signTransaction, submitTransaction,
 *   waitForConfirmation, getAssets, estimateFee, buildTokenTransfer, getTokenInfo,
 *   buildContractCall, buildApprove, buildBatch (BATCH_NOT_SUPPORTED), getTransactionFee, sweepAll
 */

import {
  createPublicClient,
  http,
  type PublicClient,
  type Chain,
} from 'viem';
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
} from '@waiaas/core';
import { WAIaaSError } from '@waiaas/core';

/**
 * EVM chain adapter implementing the 20-method IChainAdapter contract.
 *
 * Connection: connect, disconnect, isConnected, getHealth
 * Balance: getBalance
 * Pipeline: buildTransaction, simulateTransaction, signTransaction, submitTransaction
 * Confirmation: waitForConfirmation
 * Assets: getAssets
 * Fee: estimateFee
 * Token: buildTokenTransfer, getTokenInfo
 * Contract: buildContractCall, buildApprove
 * Batch: buildBatch
 * Utility: getTransactionFee, getCurrentNonce, sweepAll
 */
export class EvmAdapter implements IChainAdapter {
  readonly chain: ChainType = 'ethereum';
  readonly network: NetworkType;

  private _client: PublicClient | null = null;
  private _connected = false;
  private _chain: Chain | undefined;

  constructor(network: NetworkType, chain?: Chain) {
    this.network = network;
    this._chain = chain;
  }

  // -- Connection management (4) --

  async connect(rpcUrl: string): Promise<void> {
    this._client = createPublicClient({
      transport: http(rpcUrl),
      chain: this._chain,
    });
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._client = null;
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async getHealth(): Promise<HealthInfo> {
    const client = this.getClient();
    try {
      const start = Date.now();
      const blockNumber = await client.getBlockNumber();
      const latencyMs = Date.now() - start;
      return {
        healthy: true,
        latencyMs,
        blockHeight: blockNumber,
      };
    } catch {
      return { healthy: false, latencyMs: 0 };
    }
  }

  // -- Balance query (1) --

  async getBalance(addr: string): Promise<BalanceInfo> {
    const client = this.getClient();
    try {
      const balance = await client.getBalance({
        address: addr as `0x${string}`,
      });
      return {
        address: addr,
        balance,
        decimals: 18,
        symbol: 'ETH',
      };
    } catch (error) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to get balance: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // -- Asset query (1 stub) --

  async getAssets(_addr: string): Promise<AssetInfo[]> {
    throw new Error('Not implemented: getAssets will be implemented in Phase 78');
  }

  // -- Transaction 4-stage pipeline (4 stubs) --

  async buildTransaction(_request: TransferRequest): Promise<UnsignedTransaction> {
    throw new Error('Not implemented: buildTransaction will be implemented in Phase 77 Plan 02');
  }

  async simulateTransaction(_tx: UnsignedTransaction): Promise<SimulationResult> {
    throw new Error('Not implemented: simulateTransaction will be implemented in Phase 77 Plan 02');
  }

  async signTransaction(_tx: UnsignedTransaction, _privateKey: Uint8Array): Promise<Uint8Array> {
    throw new Error('Not implemented: signTransaction will be implemented in Phase 77 Plan 02');
  }

  async submitTransaction(_signedTx: Uint8Array): Promise<SubmitResult> {
    throw new Error('Not implemented: submitTransaction will be implemented in Phase 77 Plan 02');
  }

  // -- Confirmation wait (1 stub) --

  async waitForConfirmation(_txHash: string, _timeoutMs?: number): Promise<SubmitResult> {
    throw new Error('Not implemented: waitForConfirmation will be implemented in Phase 77 Plan 02');
  }

  // -- Fee estimation (1 stub) --

  async estimateFee(_request: TransferRequest | TokenTransferParams): Promise<FeeEstimate> {
    throw new Error('Not implemented: estimateFee will be implemented in Phase 77 Plan 02');
  }

  // -- Token operations (2 stubs) --

  async buildTokenTransfer(_request: TokenTransferParams): Promise<UnsignedTransaction> {
    throw new Error('Not implemented: buildTokenTransfer will be implemented in Phase 78');
  }

  async getTokenInfo(_tokenAddress: string): Promise<TokenInfo> {
    throw new Error('Not implemented: getTokenInfo will be implemented in Phase 77 Plan 02');
  }

  // -- Contract operations (2 stubs) --

  async buildContractCall(_request: ContractCallParams): Promise<UnsignedTransaction> {
    throw new Error('Not implemented: buildContractCall will be implemented in Phase 79');
  }

  async buildApprove(_request: ApproveParams): Promise<UnsignedTransaction> {
    throw new Error('Not implemented: buildApprove will be implemented in Phase 77 Plan 02');
  }

  // -- Batch operations (1) --

  async buildBatch(_request: BatchParams): Promise<UnsignedTransaction> {
    throw new WAIaaSError('BATCH_NOT_SUPPORTED', {
      message: 'EVM does not support atomic batch transactions. Use Account Abstraction for batching.',
    });
  }

  // -- Utility operations (3) --

  async getTransactionFee(_tx: UnsignedTransaction): Promise<bigint> {
    throw new Error('Not implemented: getTransactionFee will be implemented in Phase 77 Plan 02');
  }

  async getCurrentNonce(addr: string): Promise<number> {
    const client = this.getClient();
    try {
      const nonce = await client.getTransactionCount({
        address: addr as `0x${string}`,
      });
      return nonce;
    } catch (error) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Failed to get nonce: ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async sweepAll(_from: string, _to: string, _privateKey: Uint8Array): Promise<SweepResult> {
    throw new Error('Not implemented: sweepAll will be implemented in Phase 80');
  }

  // -- Private helpers --

  private ensureConnected(): void {
    if (!this._connected || !this._client) {
      throw new WAIaaSError('ADAPTER_NOT_AVAILABLE', {
        message: 'EvmAdapter is not connected. Call connect() first.',
      });
    }
  }

  private getClient(): PublicClient {
    this.ensureConnected();
    return this._client!;
  }
}
