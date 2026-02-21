import type { ChainType } from '../enums/chain.js';
import type { IncomingTransaction } from './chain-subscriber.types.js';

/**
 * Chain subscriber interface.
 * Defines the contract for monitoring incoming transactions on a blockchain.
 * Unlike IChainAdapter (stateless RPC calls), IChainSubscriber maintains
 * persistent connections (WebSocket or polling) for real-time detection.
 *
 * v27.1 scope: 6 methods (subscribe/unsubscribe + query + lifecycle).
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
}
