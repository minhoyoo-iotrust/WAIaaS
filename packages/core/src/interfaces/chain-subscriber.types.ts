import type { ChainType } from '../enums/chain.js';
import type { IncomingTxStatus } from '../enums/incoming-tx.js';

/**
 * Incoming transaction detected by a chain subscriber.
 * Represents a transfer received by a monitored wallet address.
 */
export interface IncomingTransaction {
  /** Unique identifier (UUID v7). */
  id: string;
  /** On-chain transaction hash. */
  txHash: string;
  /** Wallet ID of the recipient wallet being monitored. */
  walletId: string;
  /** Sender address. */
  fromAddress: string;
  /** Transfer amount in smallest unit (lamports/wei) as bigint-safe string. */
  amount: string;
  /** Token address (mint for Solana, contract for EVM). null for native transfers. */
  tokenAddress: string | null;
  /** Blockchain type. */
  chain: ChainType;
  /** Network identifier (e.g. 'devnet', 'ethereum-sepolia'). */
  network: string;
  /** Detection status. */
  status: IncomingTxStatus;
  /** Block number of inclusion. null if not yet included. */
  blockNumber: number | null;
  /** Unix epoch seconds when the transaction was first detected. */
  detectedAt: number;
  /** Unix epoch seconds when the transaction was confirmed. null if not yet confirmed. */
  confirmedAt: number | null;
  /** Whether this transaction is flagged as suspicious. */
  isSuspicious?: boolean;
}
