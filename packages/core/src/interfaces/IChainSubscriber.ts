import type { ChainType } from '../enums/chain.js';
import type { IncomingTransaction } from './chain-subscriber.types.js';

/**
 * Chain subscriber interface.
 * Defines the contract for monitoring incoming transactions on a blockchain.
 * Unlike IChainAdapter (stateless RPC calls), IChainSubscriber maintains
 * persistent connections (WebSocket or polling) for real-time detection.
 *
 * v32.4: 9 methods (6 base + 3 optional polling/confirmation).
 */
export interface IChainSubscriber {
  readonly chain: ChainType;

  // -- Subscription management (2) --

  /**
   * Subscribe to incoming transactions for a wallet address.
   * The callback fires for each detected incoming transfer.
   * Idempotent: re-subscribing the same walletId updates the callback.
   */
  subscribe(
    walletId: string,
    address: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
  ): Promise<void>;

  /**
   * Unsubscribe a wallet from incoming transaction monitoring.
   * No-op if the wallet is not currently subscribed.
   */
  unsubscribe(walletId: string): Promise<void>;

  // -- Query (1) --

  /**
   * Get the list of currently subscribed wallet IDs.
   * Returns an empty array if no wallets are subscribed.
   */
  subscribedWallets(): string[];

  // -- Lifecycle (3) --

  /**
   * Establish the underlying connection (WebSocket or polling timer).
   * Must be called before subscribe(). Throws if already connected.
   */
  connect(): Promise<void>;

  /**
   * Wait until the subscriber disconnects (connection closed or error).
   * Resolves when the connection terminates. Useful for graceful shutdown.
   */
  waitForDisconnect(): Promise<void>;

  /**
   * Tear down the subscriber: unsubscribe all wallets, close connections,
   * and release resources. Safe to call multiple times.
   */
  destroy(): Promise<void>;

  // -- Optional polling/confirmation (3) --

  /**
   * Poll all subscribed wallets for new incoming transactions.
   * Called by BackgroundWorkers on a configurable interval.
   * Implemented by both EVM and Solana subscribers.
   */
  pollAll?(): Promise<void>;

  /**
   * Check whether a transaction has reached finalized confirmation status.
   * Chain-specific: implemented by SolanaIncomingSubscriber only.
   * Used by the Solana confirmation worker to update pending TX status.
   */
  checkFinalized?(txHash: string): Promise<boolean>;

  /**
   * Get the current block number from the chain.
   * Chain-specific: implemented by EvmIncomingSubscriber only.
   * Used by the EVM confirmation worker to check block confirmations.
   */
  getBlockNumber?(): Promise<bigint>;
}
