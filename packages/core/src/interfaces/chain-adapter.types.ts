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
  status: 'submitted' | 'confirmed' | 'finalized';
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

/** RPC health check result. */
export interface HealthInfo {
  /** Whether the RPC endpoint is healthy. */
  healthy: boolean;
  /** RPC latency in milliseconds. */
  latencyMs: number;
  /** Current block height. */
  blockHeight?: bigint;
}
