/**
 * SubscriptionMultiplexer -- connection sharing layer for incoming TX subscribers.
 *
 * Manages one IChainSubscriber instance per chain:network pair, allowing
 * multiple wallets to share a single WebSocket connection. Integrates with
 * reconnectLoop from @waiaas/core for resilient reconnection and triggers
 * gap recovery on successful reconnect.
 *
 * Key behaviors:
 * - addWallet() reuses existing connection if chain:network already has one
 * - removeWallet() destroys connection when no wallets remain
 * - reconnectLoop drives WS_ACTIVE -> RECONNECTING -> POLLING_FALLBACK transitions
 * - Gap recovery callback invoked with cursor on successful reconnect
 *
 * References:
 *   Design doc 76 section 5.4 (multiplexer)
 *   IChainSubscriber 6-method interface from @waiaas/core
 *   reconnectLoop/ConnectionState from @waiaas/core
 */

import type {
  IChainSubscriber,
  IncomingTransaction,
  ConnectionState,
  ReconnectConfig,
} from '@waiaas/core';
import { reconnectLoop, DEFAULT_RECONNECT_CONFIG } from '@waiaas/core';

// ── Types ────────────────────────────────────────────────────────

/** Connection key format: "chain:network" e.g. "solana:mainnet" */
type ConnectionKey = string;

interface ConnectionEntry {
  subscriber: IChainSubscriber;
  wallets: Set<string>;
  state: ConnectionState;
  abortController: AbortController;
}

type SubscriberFactory = (chain: string, network: string) => IChainSubscriber;
type OnTransactionCallback = (tx: IncomingTransaction) => void;
type GapRecoveryCallback = (
  chain: string,
  network: string,
  walletIds: string[],
) => Promise<void>;

export interface MultiplexerDeps {
  subscriberFactory: SubscriberFactory;
  onTransaction: OnTransactionCallback;
  onGapRecovery?: GapRecoveryCallback;
  reconnectConfig?: ReconnectConfig;
}

// ── SubscriptionMultiplexer ──────────────────────────────────────

export class SubscriptionMultiplexer {
  private readonly connections = new Map<ConnectionKey, ConnectionEntry>();
  private readonly deps: MultiplexerDeps;
  private readonly reconnectConfig: ReconnectConfig;

  constructor(deps: MultiplexerDeps) {
    this.deps = deps;
    this.reconnectConfig = deps.reconnectConfig ?? DEFAULT_RECONNECT_CONFIG;
  }

  /**
   * Add a wallet to a shared connection for the given chain:network.
   * If no connection exists, creates subscriber, connects, and starts reconnectLoop.
   * If connection already exists, subscribes wallet through the existing subscriber.
   */
  async addWallet(
    chain: string,
    network: string,
    walletId: string,
    walletAddress: string,
  ): Promise<void> {
    const key = `${chain}:${network}`;
    const existing = this.connections.get(key);

    if (existing) {
      // Reuse existing connection -- just subscribe the wallet
      await existing.subscriber.subscribe(
        walletId,
        walletAddress,
        network,
        this.deps.onTransaction,
      );
      existing.wallets.add(walletId);
      return;
    }

    // Create new connection entry
    const subscriber = this.deps.subscriberFactory(chain, network);
    const abortController = new AbortController();
    const entry: ConnectionEntry = {
      subscriber,
      wallets: new Set([walletId]),
      state: 'RECONNECTING', // Will transition to WS_ACTIVE on connect
      abortController,
    };
    this.connections.set(key, entry);

    // Subscribe the wallet before connecting
    await subscriber.subscribe(
      walletId,
      walletAddress,
      network,
      this.deps.onTransaction,
    );

    // Connect the subscriber
    await subscriber.connect();
    entry.state = 'WS_ACTIVE';

    // Start reconnectLoop in fire-and-forget mode
    // The loop monitors the connection and handles reconnection on disconnect
    void (async () => {
      // Wait for the first disconnect before entering the reconnect loop
      try {
        await subscriber.waitForDisconnect();
      } catch {
        // Disconnect detected
      }

      if (abortController.signal.aborted) return;

      // Now enter the reconnect loop for subsequent reconnections
      await reconnectLoop(
        subscriber,
        this.reconnectConfig,
        (state: ConnectionState) => {
          // Guard against updates after connection was removed
          const current = this.connections.get(key);
          if (current !== entry) return;

          const previousState = entry.state;
          entry.state = state;

          // On successful reconnect (transition to WS_ACTIVE from non-WS_ACTIVE),
          // trigger gap recovery
          if (
            state === 'WS_ACTIVE' &&
            previousState !== 'WS_ACTIVE' &&
            this.deps.onGapRecovery
          ) {
            void this.deps.onGapRecovery(chain, network, [...entry.wallets]);
          }
        },
        abortController.signal,
      );
    })();
  }

  /**
   * Remove a wallet from its shared connection.
   * Destroys the connection if no wallets remain.
   */
  async removeWallet(
    chain: string,
    network: string,
    walletId: string,
  ): Promise<void> {
    const key = `${chain}:${network}`;
    const entry = this.connections.get(key);
    if (!entry) return;

    await entry.subscriber.unsubscribe(walletId);
    entry.wallets.delete(walletId);

    if (entry.wallets.size === 0) {
      entry.abortController.abort();
      await entry.subscriber.destroy();
      this.connections.delete(key);
    }
  }

  /**
   * Get the connection state for a chain:network pair.
   * Returns null if no connection exists.
   */
  getConnectionState(chain: string, network: string): ConnectionState | null {
    const key = `${chain}:${network}`;
    return this.connections.get(key)?.state ?? null;
  }

  /**
   * Get summary of all active connections.
   */
  getActiveConnections(): Array<{
    key: string;
    walletCount: number;
    state: ConnectionState;
  }> {
    return Array.from(this.connections.entries()).map(([key, entry]) => ({
      key,
      walletCount: entry.wallets.size,
      state: entry.state,
    }));
  }

  /**
   * Stop all connections: abort reconnect loops, unsubscribe wallets, destroy subscribers.
   * Clears the connections Map.
   */
  async stopAll(): Promise<void> {
    const destroyPromises: Promise<void>[] = [];

    for (const [, entry] of this.connections) {
      entry.abortController.abort();

      // Unsubscribe all wallets and destroy subscriber
      const walletIds = [...entry.wallets];
      destroyPromises.push(
        (async () => {
          for (const walletId of walletIds) {
            await entry.subscriber.unsubscribe(walletId);
          }
          await entry.subscriber.destroy();
        })(),
      );
    }

    await Promise.all(destroyPromises);
    this.connections.clear();
  }
}
