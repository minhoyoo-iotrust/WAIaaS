import type { ChainType, NetworkType } from '../enums/chain.js';
import type {
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
} from './chain-adapter.types.js';

/**
 * Chain adapter interface.
 * Defines the contract for blockchain interactions with a 4-stage transaction pipeline:
 * build -> simulate -> sign -> submit.
 *
 * v1.1 scope: 10 methods (connection 4 + balance 1 + tx pipeline 4 + confirm 1).
 * v1.3 scope: +1 method (getAssets). Total: 11.
 * v1.4 scope: +9 methods (fee estimation 1, token ops 2, contract ops 2, batch 1, utility 3). Total: 20.
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

  // -- Fee estimation (1) --

  /** Estimate fee for a transfer or token transfer. */
  estimateFee(request: TransferRequest | TokenTransferParams): Promise<FeeEstimate>;

  // -- Token operations (2) --

  /** Build token transfer transaction (SPL/ERC-20). */
  buildTokenTransfer(request: TokenTransferParams): Promise<UnsignedTransaction>;

  /** Get token info by address. */
  getTokenInfo(tokenAddress: string): Promise<TokenInfo>;

  // -- Contract operations (2) --

  /** Build contract call transaction. */
  buildContractCall(request: ContractCallParams): Promise<UnsignedTransaction>;

  /** Build approve transaction. */
  buildApprove(request: ApproveParams): Promise<UnsignedTransaction>;

  // -- Batch operations (1) --

  /** Build batch transaction (Solana only). Throws BATCH_NOT_SUPPORTED on EVM. */
  buildBatch(request: BatchParams): Promise<UnsignedTransaction>;

  // -- Utility operations (3) --

  /** Get transaction fee from a built transaction. */
  getTransactionFee(tx: UnsignedTransaction): Promise<bigint>;

  /** Get current nonce for an address (EVM). Returns 0 for Solana. */
  getCurrentNonce(address: string): Promise<number>;

  /** Sweep all assets from one address to another. */
  sweepAll(from: string, to: string, privateKey: Uint8Array): Promise<SweepResult>;
}
