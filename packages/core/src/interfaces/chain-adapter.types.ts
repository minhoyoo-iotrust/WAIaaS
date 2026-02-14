import type { ChainType } from '../enums/chain.js';

/** Token amount with raw bigint value, decimals, and symbol. */
export interface TokenAmount {
  /** Raw amount in smallest unit (lamports/wei). */
  raw: bigint;
  /** Decimal places. SOL=9, ETH=18, USDC=6. */
  decimals: number;
  /** Token symbol. 'SOL', 'ETH', 'USDC', etc. */
  symbol: string;
}

/** Native token transfer request. Chain-agnostic common parameters. */
export interface TransferRequest {
  /** Sender address (chain-specific format). */
  from: string;
  /** Recipient address (chain-specific format). */
  to: string;
  /** Transfer amount in smallest unit (lamports/wei). */
  amount: bigint;
  /** Optional memo (max 256 bytes). Solana: Memo Program, EVM: tx data. */
  memo?: string;
}

/** Built unsigned transaction. Output of buildTransaction(), input to simulate/sign. */
export interface UnsignedTransaction {
  /** Target chain. */
  chain: ChainType;
  /** Chain-specific serialized transaction bytes. */
  serialized: Uint8Array;
  /** Estimated fee in smallest unit. */
  estimatedFee: bigint;
  /** Transaction expiry. Solana: blockhash lifetime (~60s). EVM: undefined. */
  expiresAt?: Date;
  /** Chain-specific metadata (e.g. lastValidBlockHeight, nonce). */
  metadata: Record<string, unknown>;
  /** EVM nonce (v0.7). EVM only. */
  nonce?: number;
}

/** Transaction simulation result. */
export interface SimulationResult {
  /** Whether simulation succeeded. */
  success: boolean;
  /** Simulation logs. */
  logs: string[];
  /** Compute units consumed (Solana) or gas used (EVM). */
  unitsConsumed?: bigint;
  /** Error message if simulation failed. */
  error?: string;
}

/** Transaction submission result. */
export interface SubmitResult {
  /** Transaction hash. */
  txHash: string;
  /** Current status. */
  status: 'submitted' | 'confirmed' | 'finalized' | 'failed';
  /** Number of confirmations. */
  confirmations?: number;
  /** Block number of inclusion. */
  blockNumber?: bigint;
  /** Actual fee paid. */
  fee?: bigint;
}

/** Balance information for an address. */
export interface BalanceInfo {
  /** Queried address. */
  address: string;
  /** Balance in smallest unit. */
  balance: bigint;
  /** Decimal places. */
  decimals: number;
  /** Token symbol. */
  symbol: string;
  /** USD value (from price oracle, optional). */
  usdValue?: number;
}

/** Asset information for a token held by an address. */
export interface AssetInfo {
  /** Token mint address. 'native' for SOL/ETH. */
  mint: string;
  /** Token symbol. 'SOL', 'USDC', etc. */
  symbol: string;
  /** Token name. 'Solana', 'USD Coin', etc. Empty string if unknown. */
  name: string;
  /** Balance in smallest unit (lamports/wei). */
  balance: bigint;
  /** Decimal places. */
  decimals: number;
  /** Whether this is the native token. */
  isNative: boolean;
  /** USD value if available (from price oracle). */
  usdValue?: number;
}

/** RPC health check result. */
export interface HealthInfo {
  /** Whether the RPC endpoint is healthy. */
  healthy: boolean;
  /** RPC latency in milliseconds. */
  latencyMs: number;
  /** Current block height. */
  blockHeight?: bigint;
}

// ---------------------------------------------------------------------------
// v1.4 new types for extended IChainAdapter methods
// ---------------------------------------------------------------------------

/** Fee estimation result. */
export interface FeeEstimate {
  /** Estimated fee in smallest unit (lamports/wei). */
  fee: bigint;
  /** Whether an ATA needs to be created (Solana SPL). */
  needsAtaCreation?: boolean;
  /** ATA creation rent cost (Solana SPL). */
  ataRentCost?: bigint;
  /** Breakdown details. */
  details?: Record<string, unknown>;
}

/** Token information. */
export interface TokenInfo {
  /** Token address (mint for Solana, contract for EVM). */
  address: string;
  /** Token symbol. */
  symbol: string;
  /** Token name. */
  name: string;
  /** Decimal places. */
  decimals: number;
  /** Total supply if available. */
  totalSupply?: bigint;
  /** Token program (Solana: Token or Token-2022). */
  programId?: string;
}

/** Sweep result (multi-asset withdrawal). */
export interface SweepResult {
  /** Total number of assets swept. */
  total: number;
  /** Number of successful sweeps. */
  succeeded: number;
  /** Number of failed sweeps. */
  failed: number;
  /** Individual sweep results. */
  results: Array<{
    mint: string;
    txHash?: string;
    error?: string;
    amount: bigint;
  }>;
}

/** Token transfer request for buildTokenTransfer(). */
export interface TokenTransferParams {
  from: string;
  to: string;
  amount: bigint;
  token: { address: string; decimals: number; symbol: string };
  memo?: string;
}

/** Contract call request for buildContractCall(). */
export interface ContractCallParams {
  from: string;
  to: string; // contract address
  // EVM
  calldata?: string; // hex-encoded
  abi?: Record<string, unknown>[];
  value?: bigint;
  // Solana
  programId?: string;
  instructionData?: Uint8Array;
  accounts?: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
}

/** Approve request for buildApprove(). */
export interface ApproveParams {
  from: string;
  spender: string;
  token: { address: string; decimals: number; symbol: string };
  amount: bigint;
}

/** Batch request for buildBatch(). */
export interface BatchParams {
  from: string;
  instructions: Array<TransferRequest | TokenTransferParams | ContractCallParams | ApproveParams>;
}

// ---------------------------------------------------------------------------
// v1.4.7 sign-only types for parseTransaction / signExternalTransaction
// ---------------------------------------------------------------------------

/** Operation type identified from an unsigned transaction. */
export type ParsedOperationType =
  | 'NATIVE_TRANSFER'
  | 'TOKEN_TRANSFER'
  | 'CONTRACT_CALL'
  | 'APPROVE'
  | 'UNKNOWN';

/** A single operation extracted from an unsigned transaction. */
export interface ParsedOperation {
  /** Operation type. */
  type: ParsedOperationType;
  /** Recipient or target address. */
  to?: string;
  /** Transfer/approve amount in smallest unit. */
  amount?: bigint;
  /** Token address (mint for Solana, contract for EVM). */
  token?: string;
  /** Program/contract address (for CONTRACT_CALL). */
  programId?: string;
  /** Method selector or discriminator (hex string). */
  method?: string;
}

/** Result of parsing an unsigned external transaction. */
export interface ParsedTransaction {
  /** List of operations in the transaction. */
  operations: ParsedOperation[];
  /** Original raw transaction string (base64 for Solana, hex for EVM). */
  rawTx: string;
}

/** Result of signing an external transaction. */
export interface SignedTransaction {
  /** Signed transaction (base64 for Solana, hex for EVM). */
  signedTransaction: string;
  /** Transaction hash if computable before submission. */
  txHash?: string;
}
