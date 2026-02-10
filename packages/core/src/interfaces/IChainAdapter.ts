import type { ChainType, NetworkType } from '../enums/chain.js';
import type {
  TransferRequest,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  AssetInfo,
} from './chain-adapter.types.js';

/**
 * Chain adapter interface.
 * Defines the contract for blockchain interactions with a 4-stage transaction pipeline:
 * build -> simulate -> sign -> submit.
 *
 * v1.1 scope: 10 methods (connection 4 + balance 1 + tx pipeline 4 + confirm 1).
 * v1.3 scope: +1 method (getAssets).
 * v1.4 scope: +9 methods (fee estimation, contract calls, approve, batch, sweep, nonce, status, validate).
 */
export interface IChainAdapter {
  readonly chain: ChainType;
  readonly network: NetworkType;

  // -- Connection management (4) --

  /** Connect to RPC endpoint. */
  connect(rpcUrl: string): Promise<void>;

  /** Disconnect from RPC endpoint. */
  disconnect(): Promise<void>;

  /** Check if connected to RPC. */
  isConnected(): boolean;

  /** Health check the RPC endpoint. */
  getHealth(): Promise<HealthInfo>;

  // -- Balance query (1) --

  /** Get native token balance for an address. */
  getBalance(address: string): Promise<BalanceInfo>;

  // -- Transaction 4-stage pipeline (4) --

  /** Build an unsigned transaction from a transfer request. */
  buildTransaction(request: TransferRequest): Promise<UnsignedTransaction>;

  /** Simulate a transaction before signing. */
  simulateTransaction(tx: UnsignedTransaction): Promise<SimulationResult>;

  /** Sign a transaction with a private key (from guarded memory). */
  signTransaction(tx: UnsignedTransaction, privateKey: Uint8Array): Promise<Uint8Array>;

  /** Submit a signed transaction to the blockchain. */
  submitTransaction(signedTx: Uint8Array): Promise<SubmitResult>;

  // -- Confirmation wait (1) --

  /** Wait for transaction confirmation with optional timeout. */
  waitForConfirmation(txHash: string, timeoutMs?: number): Promise<SubmitResult>;

  // -- Asset query (1) --

  /** Get all assets (native + token accounts) for an address. */
  getAssets(address: string): Promise<AssetInfo[]>;

  // v1.4 planned methods:
  // estimateFee(request: TransferRequest): Promise<FeeEstimate>;
  // buildContractCall(request: ContractCallRequest): Promise<UnsignedTransaction>;
  // buildApprove(request: ApproveRequest): Promise<UnsignedTransaction>;
  // buildBatch(request: BatchRequest): Promise<UnsignedTransaction>;
  // sweepAll(address: string, toAddress: string, privateKey: Uint8Array): Promise<SweepResult>;
  // getCurrentNonce(address: string): Promise<number>;
  // resetNonceTracker(address: string): void;
  // getTransactionStatus(txHash: string): Promise<SubmitResult>;
  // isValidAddress(address: string): boolean;
}
