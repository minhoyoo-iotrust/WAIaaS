/**
 * SolanaIncomingSubscriber -- IChainSubscriber implementation for Solana.
 *
 * Detects incoming SOL, SPL, and Token-2022 transfers via:
 *   - WebSocket: logsSubscribe({ mentions: [address] }) with getTransaction follow-up
 *   - HTTP polling: getSignaturesForAddress + getTransaction (fallback / BackgroundWorkers)
 *
 * SolanaHeartbeat sends getSlot() RPC ping every 60s to prevent provider inactivity timeout.
 *
 * References:
 *   Design doc 76 sections 3.1-3.7 (Solana subscriber), 5.3 (heartbeat)
 *   IChainSubscriber 6-method interface from @waiaas/core
 */

import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  type Signature,
} from '@solana/kit';
import type { IChainSubscriber, ChainType, IncomingTransaction } from '@waiaas/core';
import { parseSOLTransfer, parseSPLTransfers } from './incoming-tx-parser.js';
import type { SolanaTransactionResult } from './incoming-tx-parser.js';

// ─── Types ──────────────────────────────────────────────────────

type SolanaRpc = ReturnType<typeof createSolanaRpc>;
type SolanaRpcSubscriptions = ReturnType<typeof createSolanaRpcSubscriptions>;

interface SubscriptionEntry {
  address: string;
  network: string;
  abortController: AbortController;
  onTransaction: (tx: IncomingTransaction) => void;
}

export interface SolanaIncomingSubscriberConfig {
  rpcUrl: string;
  wsUrl: string;
  mode?: 'websocket' | 'polling';
  generateId?: () => string;
}

// ─── SolanaHeartbeat ────────────────────────────────────────────

/**
 * Sends periodic getSlot() RPC pings to prevent WebSocket inactivity timeout.
 * Uses HTTP RPC (not WebSocket ping frames) for provider compatibility.
 * timer.unref() prevents blocking process exit.
 */
export class SolanaHeartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly INTERVAL_MS = 60_000;

  /**
   * Start the heartbeat with a getSlot function.
   * Replaces any existing timer (prevents double intervals).
   *
   * @param rpcGetSlot - Function that sends a getSlot RPC call
   */
  start(rpcGetSlot: () => Promise<unknown>): void {
    this.stop();
    this.timer = setInterval(async () => {
      try {
        await rpcGetSlot();
      } catch {
        // Heartbeat failure is non-fatal; reconnectLoop handles real disconnects
      }
    }, this.INTERVAL_MS);
    this.timer.unref();
  }

  /** Stop the heartbeat timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// ─── SolanaIncomingSubscriber ───────────────────────────────────

/**
 * Solana chain subscriber implementing IChainSubscriber.
 *
 * Manages per-wallet WebSocket subscriptions via logsNotifications({ mentions: [addr] })
 * and provides a pollAll() method for HTTP-based fallback polling.
 */
export class SolanaIncomingSubscriber implements IChainSubscriber {
  readonly chain: ChainType = 'solana';

  private readonly mode: 'websocket' | 'polling';
  private readonly generateId: () => string;
  private readonly rpc: SolanaRpc;
  private readonly rpcSubscriptions: SolanaRpcSubscriptions;
  private readonly heartbeat = new SolanaHeartbeat();
  private readonly subscriptions = new Map<string, SubscriptionEntry>();

  private connected = false;
  private disconnectResolve: (() => void) | null = null;

  constructor(config: SolanaIncomingSubscriberConfig) {
    this.mode = config.mode ?? 'websocket';
    this.generateId = config.generateId ?? (() => crypto.randomUUID());
    this.rpc = createSolanaRpc(config.rpcUrl);
    this.rpcSubscriptions = createSolanaRpcSubscriptions(config.wsUrl);
  }

  // -- Subscription management (2) --

  async subscribe(
    walletId: string,
    addr: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
  ): Promise<void> {
    // Idempotent: re-subscribing same walletId is a no-op
    if (this.subscriptions.has(walletId)) return;

    const abortController = new AbortController();
    this.subscriptions.set(walletId, {
      address: addr,
      network,
      abortController,
      onTransaction,
    });

    if (this.mode === 'websocket' && this.connected) {
      this.startWebSocketSubscription(walletId, addr, network, onTransaction, abortController);
    }
  }

  async unsubscribe(walletId: string): Promise<void> {
    const sub = this.subscriptions.get(walletId);
    if (!sub) return; // idempotent

    sub.abortController.abort();
    this.subscriptions.delete(walletId);
  }

  // -- Query (1) --

  subscribedWallets(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  // -- Lifecycle (3) --

  async connect(): Promise<void> {
    this.connected = true;

    // Start heartbeat: getSlot() HTTP RPC ping every 60s
    this.heartbeat.start(() => this.rpc.getSlot().send());

    // Start WebSocket subscriptions for all existing wallets
    if (this.mode === 'websocket') {
      for (const [walletId, sub] of this.subscriptions.entries()) {
        this.startWebSocketSubscription(
          walletId,
          sub.address,
          sub.network,
          sub.onTransaction,
          sub.abortController,
        );
      }
    }
  }

  async waitForDisconnect(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.disconnectResolve = resolve;
    });
  }

  async destroy(): Promise<void> {
    this.heartbeat.stop();

    // Abort all subscription AbortControllers
    for (const sub of this.subscriptions.values()) {
      sub.abortController.abort();
    }
    this.subscriptions.clear();

    this.connected = false;
    this.disconnectResolve?.();
  }

  // -- Polling (public for BackgroundWorkers in Phase 226) --

  /**
   * Poll all subscribed wallets for recent incoming transfers via HTTP RPC.
   * For each wallet: getSignaturesForAddress -> getTransaction -> parse.
   * Per-wallet errors are isolated (logged and skipped).
   */
  async pollAll(): Promise<void> {
    for (const [, sub] of this.subscriptions.entries()) {
      try {
        await this.pollWallet(sub);
      } catch {
        // Per-wallet error isolation: log warning, continue to next wallet
      }
    }
  }

  // -- Private methods --

  /**
   * Poll a single wallet for recent incoming transfers.
   */
  private async pollWallet(sub: SubscriptionEntry): Promise<void> {
    const signatures = await this.rpc
      .getSignaturesForAddress(address(sub.address), {
        limit: 100,
        commitment: 'confirmed',
      })
      .send();

    for (const sigInfo of signatures) {
      // Skip failed transactions
      if (sigInfo.err !== null) continue;

      try {
        const tx = await this.rpc
          .getTransaction(sigInfo.signature as Signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
            encoding: 'jsonParsed',
          })
          .send();

        if (!tx) continue;

        this.processTransaction(
          tx as unknown as SolanaTransactionResult,
          sub,
        );
      } catch {
        // Skip individual transaction errors
      }
    }
  }

  /**
   * Start a fire-and-forget WebSocket subscription for a wallet.
   */
  private startWebSocketSubscription(
    _walletId: string,
    addr: string,
    network: string,
    onTransaction: (tx: IncomingTransaction) => void,
    abortController: AbortController,
  ): void {
    void (async () => {
      try {
        const logNotifications = await this.rpcSubscriptions
          .logsNotifications(
            { mentions: [address(addr)] },
            { commitment: 'confirmed' },
          )
          .subscribe({ abortSignal: abortController.signal });

        for await (const notification of logNotifications) {
          const { signature, err } = notification.value;
          if (err !== null) continue;

          try {
            const tx = await this.rpc
              .getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0,
                encoding: 'jsonParsed',
              })
              .send();

            if (!tx) continue;

            // Find the subscription entry for this wallet to get network info
            const sub: SubscriptionEntry = {
              address: addr,
              network,
              abortController,
              onTransaction,
            };
            this.processTransaction(
              tx as unknown as SolanaTransactionResult,
              sub,
            );
          } catch {
            // Skip individual transaction processing errors
          }
        }
      } catch (_error) {
        // If abort was requested, silently exit
        if (abortController.signal.aborted) return;
        // Otherwise, signal disconnection
        this.disconnectResolve?.();
      }
    })();
  }

  /**
   * Process a transaction result: parse SOL and SPL transfers and call onTransaction.
   */
  private processTransaction(
    tx: SolanaTransactionResult,
    sub: SubscriptionEntry,
  ): void {
    // Check for SOL native transfer
    const solTransfer = parseSOLTransfer(
      tx,
      sub.address,
      // walletId is not stored directly in SubscriptionEntry -- look it up
      this.findWalletIdByAddress(sub.address) ?? '',
      sub.network,
      this.generateId,
    );
    if (solTransfer) {
      sub.onTransaction(solTransfer);
    }

    // Check for SPL/Token-2022 transfers
    const splTransfers = parseSPLTransfers(
      tx,
      sub.address,
      this.findWalletIdByAddress(sub.address) ?? '',
      sub.network,
      this.generateId,
    );
    for (const transfer of splTransfers) {
      sub.onTransaction(transfer);
    }
  }

  /**
   * Find walletId by address from subscriptions Map.
   */
  private findWalletIdByAddress(addr: string): string | undefined {
    for (const [walletId, sub] of this.subscriptions.entries()) {
      if (sub.address === addr) return walletId;
    }
    return undefined;
  }
}
