/**
 * SolanaIncomingSubscriber -- IChainSubscriber implementation for Solana.
 *
 * Detects incoming SOL, SPL, and Token-2022 transfers via:
 *   - WebSocket: logsSubscribe({ mentions: [address] }) with getTransaction follow-up
 *   - HTTP polling: getSignaturesForAddress + getTransaction (fallback / BackgroundWorkers)
 *   - Adaptive: starts with WS, auto-falls back to polling on repeated 429 (#454)
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
import type { IChainSubscriber, ChainType, IncomingTransaction, ILogger } from '@waiaas/core';
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

export type SolanaMonitorMode = 'websocket' | 'polling' | 'adaptive';

export interface SolanaIncomingSubscriberConfig {
  rpcUrl: string;
  wsUrl: string;
  mode?: SolanaMonitorMode;
  generateId?: () => string;
  /** Optional logger; when absent, rate-limit warnings are silently swallowed. */
  logger?: ILogger;
  /** Stagger delay (ms) between per-wallet WS subscriptions in connect(). Default: 300 */
  staggerDelayMs?: number;
  /** Consecutive 429 count before adaptive mode switches to polling. Default: 5 */
  adaptiveThreshold?: number;
  /** Interval (ms) between WS recovery attempts while in adaptive-polling. Default: 300_000 (5 min) */
  wsRecoveryIntervalMs?: number;
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
 *
 * Adaptive mode (#454): starts with WS, counts consecutive 429 errors, and
 * automatically falls back to polling when the threshold is exceeded.
 * Periodically re-attempts WS to restore real-time monitoring.
 */
export class SolanaIncomingSubscriber implements IChainSubscriber {
  readonly chain: ChainType = 'solana';

  private readonly configMode: SolanaMonitorMode;
  private readonly generateId: () => string;
  private readonly rpc: SolanaRpc;
  private rpcSubscriptions: SolanaRpcSubscriptions;
  private readonly wsUrl: string;
  private readonly heartbeat = new SolanaHeartbeat();
  private readonly subscriptions = new Map<string, SubscriptionEntry>();
  private readonly logger?: ILogger;
  private readonly staggerDelayMs: number;
  private readonly adaptiveThreshold: number;
  private readonly wsRecoveryIntervalMs: number;

  private connected = false;
  private disconnectResolve: (() => void) | null = null;

  /** Consecutive 429 error counter for adaptive mode */
  private consecutive429Count = 0;
  /** Whether adaptive mode has switched to polling */
  private adaptivePollingActive = false;
  /** Timer for periodic WS recovery attempts */
  private wsRecoveryTimer: ReturnType<typeof setInterval> | null = null;
  /** Whether a 429 rate-limit warning has been logged (log once) */
  private rateLimitWarned = false;
  /** Original process.stderr.write saved for restoration on destroy() */
  private origStderrWrite: typeof process.stderr.write | null = null;

  constructor(config: SolanaIncomingSubscriberConfig) {
    this.configMode = config.mode ?? 'adaptive';
    this.generateId = config.generateId ?? (() => crypto.randomUUID());
    this.rpc = createSolanaRpc(config.rpcUrl);
    this.wsUrl = config.wsUrl;
    this.rpcSubscriptions = createSolanaRpcSubscriptions(config.wsUrl);
    this.logger = config.logger;
    this.staggerDelayMs = config.staggerDelayMs ?? 300;
    this.adaptiveThreshold = config.adaptiveThreshold ?? 5;
    this.wsRecoveryIntervalMs = config.wsRecoveryIntervalMs ?? 300_000;

    // C-3: Install global stderr filter to suppress `ws` library's direct stderr output (#454).
    // `ws` npm package writes "ws error: Unexpected server response: 429" directly to stderr
    // during WebSocket handshake failures, bypassing all Node.js error handling.
    // This filter intercepts those lines and routes them through record429() instead.
    this.installStderrFilter();
  }

  /** Current effective mode considering adaptive fallback */
  get effectiveMode(): 'websocket' | 'polling' {
    if (this.configMode === 'polling') return 'polling';
    if (this.configMode === 'adaptive' && this.adaptivePollingActive) return 'polling';
    return 'websocket';
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

    if (this.effectiveMode === 'websocket' && this.connected) {
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
    if (this.effectiveMode === 'websocket') {
      const entries = Array.from(this.subscriptions.entries());
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        // C-1: Stagger subscriptions to avoid concurrent WS handshakes (#454)
        if (i > 0 && this.staggerDelayMs > 0) {
          await sleep(this.staggerDelayMs);
        }
        this.startWebSocketSubscription(
          entry[0],
          entry[1].address,
          entry[1].network,
          entry[1].onTransaction,
          entry[1].abortController,
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
    this.stopWsRecoveryTimer();
    this.restoreStderrFilter();

    // Abort all subscription AbortControllers
    for (const sub of this.subscriptions.values()) {
      sub.abortController.abort();
    }
    this.subscriptions.clear();

    this.connected = false;
    this.disconnectResolve?.();
  }

  // -- RPC helpers (used by confirmation worker) --

  /**
   * Checks if a Solana transaction has reached 'finalized' commitment.
   * Returns true if the transaction exists at finalized level, false otherwise.
   * Used by the confirmation worker to transition DETECTED → CONFIRMED.
   */
  async checkFinalized(txHash: string): Promise<boolean> {
    try {
      const tx = await this.rpc
        .getTransaction(txHash as Signature, {
          commitment: 'finalized',
          maxSupportedTransactionVersion: 0,
          encoding: 'jsonParsed',
        })
        .send();
      return tx !== null;
    } catch {
      return false;
    }
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

  // -- Adaptive mode (#454) --

  /**
   * Record a 429 rate-limit error. If consecutive count exceeds threshold
   * in adaptive mode, switch to polling and start WS recovery timer.
   */
  record429(): void {
    this.consecutive429Count++;

    // C-3: Log rate limit warning once via ILogger (not stderr)
    if (!this.rateLimitWarned && this.logger) {
      this.logger.warn('Solana RPC WebSocket rate limited (429). Tracking consecutive failures.');
      this.rateLimitWarned = true;
    }

    if (
      this.configMode === 'adaptive' &&
      !this.adaptivePollingActive &&
      this.consecutive429Count >= this.adaptiveThreshold
    ) {
      this.adaptivePollingActive = true;
      this.logger?.warn(
        `Solana adaptive mode: switched to polling after ${this.consecutive429Count} consecutive 429 errors. ` +
        `Will attempt WS recovery every ${this.wsRecoveryIntervalMs / 1000}s.`,
      );
      this.startWsRecoveryTimer();
    }
  }

  /** Reset 429 counter (called on successful WS connection) */
  reset429(): void {
    this.consecutive429Count = 0;
    this.rateLimitWarned = false;
  }

  /** Runtime mode switch for Admin Settings hot-reload (C-5) */
  setMode(mode: SolanaMonitorMode): void {
    const oldMode = this.configMode;
    (this as unknown as { configMode: SolanaMonitorMode }).configMode = mode;
    if (mode !== oldMode) {
      // Reset adaptive state on explicit mode change
      this.adaptivePollingActive = false;
      this.consecutive429Count = 0;
      this.rateLimitWarned = false;
      this.stopWsRecoveryTimer();
      this.logger?.info(`Solana monitor mode changed: ${oldMode} → ${mode}`);
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

        // Successful subscription: reset 429 counter
        this.reset429();

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
      } catch (error) {
        // If abort was requested, silently exit
        if (abortController.signal.aborted) return;

        // C-2: Detect 429 rate-limit errors for adaptive mode (#454)
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes('429')) {
          this.record429();
        }

        // Otherwise, signal disconnection
        this.disconnectResolve?.();
      }
    })();
  }

  /**
   * Start periodic WS recovery timer (adaptive mode).
   * Attempts to re-create rpcSubscriptions and switch back to WS.
   */
  private startWsRecoveryTimer(): void {
    this.stopWsRecoveryTimer();

    this.wsRecoveryTimer = setInterval(async () => {
      if (!this.adaptivePollingActive || !this.connected) return;

      this.logger?.info('Solana adaptive mode: attempting WS recovery...');

      try {
        // Create fresh subscriptions transport
        this.rpcSubscriptions = createSolanaRpcSubscriptions(this.wsUrl);

        // Test with a single probe subscription (first wallet)
        const firstEntry = this.subscriptions.entries().next();
        if (firstEntry.done) return;

        const [, sub] = firstEntry.value;
        const probeAbort = new AbortController();
        const timeout = setTimeout(() => probeAbort.abort(), 10_000);

        try {
          await this.rpcSubscriptions
            .logsNotifications(
              { mentions: [address(sub.address)] },
              { commitment: 'confirmed' },
            )
            .subscribe({ abortSignal: probeAbort.signal });

          // Probe succeeded -- switch back to WS mode
          clearTimeout(timeout);
          probeAbort.abort(); // Clean up probe subscription
          this.adaptivePollingActive = false;
          this.reset429();
          this.stopWsRecoveryTimer();

          this.logger?.info('Solana adaptive mode: WS recovered. Switching back to WebSocket mode.');

          // Re-connect all wallet WS subscriptions with stagger
          const entries = Array.from(this.subscriptions.entries());
          for (let i = 0; i < entries.length; i++) {
            const e = entries[i]!;
            if (i > 0 && this.staggerDelayMs > 0) {
              await sleep(this.staggerDelayMs);
            }
            // Create fresh abort controller for new subscription
            const newAbort = new AbortController();
            e[1].abortController = newAbort;
            this.startWebSocketSubscription(e[0], e[1].address, e[1].network, e[1].onTransaction, newAbort);
          }
        } catch {
          clearTimeout(timeout);
          probeAbort.abort();
          this.record429();
          this.logger?.info('Solana adaptive mode: WS recovery failed. Staying in polling mode.');
        }
      } catch {
        this.logger?.info('Solana adaptive mode: WS recovery failed (transport error). Staying in polling mode.');
      }
    }, this.wsRecoveryIntervalMs);

    this.wsRecoveryTimer.unref();
  }

  private stopWsRecoveryTimer(): void {
    if (this.wsRecoveryTimer) {
      clearInterval(this.wsRecoveryTimer);
      this.wsRecoveryTimer = null;
    }
  }

  /**
   * C-3: Install a global stderr filter that intercepts `ws` library direct output (#454).
   * The `ws` npm package writes "ws error: Unexpected server response: 429" to stderr
   * during WebSocket handshake failures via console.error in its internal event handler.
   * This bypasses all Node.js error handling including try/catch.
   * The filter swallows these lines and routes 429s through record429() instead.
   */
  private installStderrFilter(): void {
    if (this.origStderrWrite) return; // already installed
    this.origStderrWrite = process.stderr.write;
    const self = this;
    process.stderr.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
      if (typeof chunk === 'string' && chunk.includes('ws error:')) {
        // Detect 429 specifically for adaptive counter
        if (chunk.includes('429')) {
          self.record429();
        }
        return true; // swallow
      }
      return (self.origStderrWrite as Function).call(process.stderr, chunk, ...args);
    }) as typeof process.stderr.write;
  }

  /** Restore original stderr.write on cleanup. */
  private restoreStderrFilter(): void {
    if (this.origStderrWrite) {
      process.stderr.write = this.origStderrWrite;
      this.origStderrWrite = null;
    }
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

// ─── Helpers ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
