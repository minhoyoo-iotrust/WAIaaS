/**
 * IncomingTxMonitorService -- top-level orchestrator for incoming transaction monitoring.
 *
 * Wires together:
 * - IncomingTxQueue (memory buffer + batch flush)
 * - SubscriptionMultiplexer (shared chain connections per chain:network)
 * - BackgroundWorkers (6 periodic tasks: flush, retention, 2x confirmation, 2x polling)
 * - Safety rules (DustAttackRule, UnknownTokenRule, LargeAmountRule)
 * - EventBus (transaction:incoming, transaction:incoming:suspicious events)
 * - KillSwitchService (notification suppression when SUSPENDED/LOCKED)
 * - NotificationService (per-wallet per-event-type cooldown)
 *
 * Lifecycle:
 * - start(): create queue + multiplexer, load wallets, register workers
 * - stop(): drain queue, stop all subscriptions, clear cooldowns
 * - updateConfig(): merge partial config (used by HotReloadOrchestrator)
 * - syncSubscriptions(): reconcile DB wallets with active multiplexer subscriptions
 *
 * @see docs/76-incoming-transaction-monitoring.md
 */

import type { Database } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { EventBus, IChainSubscriber, IncomingTransaction, ChainType, EnvironmentType, ILogger } from '@waiaas/core';
import { getNetworksForEnvironment, formatAmount, nativeSymbol, ConsoleLogger } from '@waiaas/core';
import type { BackgroundWorkers } from '../../lifecycle/workers.js';
import type { KillSwitchService } from '../kill-switch-service.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import { IncomingTxQueue } from './incoming-tx-queue.js';
import { SubscriptionMultiplexer } from './subscription-multiplexer.js';
import {
  createConfirmationWorkerHandler,
  createRetentionWorkerHandler,
  createGapRecoveryHandler,
  updateCursor,
} from './incoming-tx-workers.js';
import {
  DustAttackRule,
  UnknownTokenRule,
  LargeAmountRule,
} from './safety-rules.js';
import type { IIncomingSafetyRule, SafetyRuleContext } from './safety-rules.js';

// ── Types ────────────────────────────────────────────────────────

export interface IncomingTxMonitorConfig {
  enabled: boolean;
  pollIntervalSec: number;
  retentionDays: number;
  dustThresholdUsd: number;
  amountMultiplier: number;
  cooldownMinutes: number;
}

export type SubscriberFactory = (
  chain: string,
  network: string,
) => IChainSubscriber | Promise<IChainSubscriber>;

export interface IncomingTxMonitorDeps {
  sqlite: Database;
  db: BetterSQLite3Database<any>;
  workers: BackgroundWorkers;
  eventBus: EventBus;
  killSwitchService?: KillSwitchService | null;
  notificationService?: NotificationService | null;
  subscriberFactory: SubscriberFactory;
  config: IncomingTxMonitorConfig;
  logger?: ILogger;
}

// ── Helpers ─────────────────────────────────────────────────────


/**
 * Format incoming tx amount to human-readable string with symbol.
 * Uses token registry decimals/symbol when available, falls back to native.
 */
function formatIncomingAmount(
  tx: IncomingTransaction,
  decimals: number,
  tokenSymbol: string | null,
): string {
  if (!tx.amount || tx.amount === '0') return '0';
  try {
    const symbol = tokenSymbol
      ?? (tx.tokenAddress ? tx.tokenAddress.slice(0, 8) : null)
      ?? nativeSymbol(tx.chain);
    return `${formatAmount(BigInt(tx.amount), decimals)} ${symbol}`;
  } catch {
    return tx.amount;
  }
}

// ── IncomingTxMonitorService ────────────────────────────────────

export class IncomingTxMonitorService {
  private readonly sqlite: Database;
  private readonly workers: BackgroundWorkers;
  private readonly eventBus: EventBus;
  private readonly killSwitchService: KillSwitchService | null;
  private readonly notificationService: NotificationService | null;
  private readonly subscriberFactory: SubscriberFactory;
  private readonly logger: ILogger;

  private queue: IncomingTxQueue;
  private multiplexer!: SubscriptionMultiplexer;
  private readonly safetyRules: IIncomingSafetyRule[];
  private readonly notifyCooldown = new Map<string, number>();
  private config: IncomingTxMonitorConfig;

  constructor(deps: IncomingTxMonitorDeps) {
    this.sqlite = deps.sqlite;
    this.workers = deps.workers;
    this.eventBus = deps.eventBus;
    this.killSwitchService = deps.killSwitchService ?? null;
    this.notificationService = deps.notificationService ?? null;
    this.subscriberFactory = deps.subscriberFactory;
    this.config = { ...deps.config };
    this.logger = deps.logger ?? new ConsoleLogger('IncomingTxMonitor');

    // Initialize safety rules
    this.safetyRules = [
      new DustAttackRule(),
      new UnknownTokenRule(),
      new LargeAmountRule(),
    ];

    // Create queue
    this.queue = new IncomingTxQueue(this.logger);
  }

  /**
   * Start the monitoring service.
   *
   * 1. Create multiplexer with gap recovery handler
   * 2. Load wallets with monitor_incoming = 1 from DB
   * 3. Subscribe each wallet via multiplexer
   * 4. Register 6 background workers
   */
  async start(): Promise<void> {
    // Create gap recovery handler (needs reference to multiplexer connections)
    // We'll create it after multiplexer since it needs the internal connections map
    // For now, use a thin wrapper

    // Create multiplexer
    this.multiplexer = new SubscriptionMultiplexer({
      subscriberFactory: this.subscriberFactory,
      onTransaction: (tx: IncomingTransaction) => {
        this.queue.push(tx);
      },
      onGapRecovery: async (
        chain: string,
        network: string,
        walletIds: string[],
      ) => {
        // Wire to createGapRecoveryHandler using multiplexer's subscriber access.
        // this.multiplexer is captured via closure on 'this' -- safe because
        // onGapRecovery is never called during construction (only on reconnect).
        const handler = createGapRecoveryHandler({
          subscribers: this.multiplexer.getSubscriberEntries(),
          logger: this.logger,
        });
        await handler(chain, network, walletIds);
      },
    });

    // Load wallets with monitor_incoming = 1
    const wallets = this.sqlite
      .prepare(
        `SELECT id, chain, environment, public_key FROM wallets WHERE monitor_incoming = 1`,
      )
      .all() as Array<{
      id: string;
      chain: string;
      environment: string;
      public_key: string;
    }>;

    // Group wallets by chain:network to batch subscriptions and minimize RPC calls (#429).
    // Each network only needs one getBlockNumber() call regardless of wallet count.
    const networkGroups = new Map<string, Array<{ id: string; chain: string; public_key: string }>>();
    for (const wallet of wallets) {
      const networks = getNetworksForEnvironment(
        wallet.chain as ChainType,
        wallet.environment as EnvironmentType,
      );
      if (!networks || !Array.isArray(networks)) {
        this.logger.warn(
          `IncomingTxMonitor: unknown chain:environment ${wallet.chain}:${wallet.environment}, skipping wallet ${wallet.id}`,
        );
        continue;
      }
      for (const network of networks) {
        const key = `${wallet.chain}:${network}`;
        let group = networkGroups.get(key);
        if (!group) {
          group = [];
          networkGroups.set(key, group);
        }
        group.push({ id: wallet.id, chain: wallet.chain, public_key: wallet.public_key });
      }
    }

    // Subscribe with inter-network staggering to avoid RPC rate-limit bursts (#429).
    let subscriptionCount = 0;
    let networkIndex = 0;
    for (const [key, group] of networkGroups) {
      const network = key.split(':').slice(1).join(':');
      for (const wallet of group) {
        try {
          await this.multiplexer.addWallet(
            wallet.chain,
            network,
            wallet.id,
            wallet.public_key,
          );
          subscriptionCount++;
        } catch (err) {
          this.logger.warn(
            `IncomingTxMonitor: failed to subscribe wallet ${wallet.id} on ${network}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      // Stagger between different networks (200ms) to spread RPC load
      networkIndex++;
      if (networkIndex < networkGroups.size) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // Register 6 background workers
    this.registerWorkers();

    this.logger.info(
      `IncomingTxMonitorService started: ${wallets.length} wallets, ${subscriptionCount} network subscriptions`,
    );
  }

  /**
   * Stop the monitoring service.
   *
   * 1. Drain queue (final flush of remaining items)
   * 2. Stop all subscriber connections
   * 3. Clear cooldown map
   */
  async stop(): Promise<void> {
    // 1. Final queue drain
    this.queue.drain(this.sqlite);

    // 2. Destroy all multiplexer connections
    if (this.multiplexer) {
      await this.multiplexer.stopAll();
    }

    // 3. Clear cooldowns
    this.notifyCooldown.clear();

    this.logger.debug('IncomingTxMonitorService stopped');
  }

  /**
   * Update configuration (used by HotReloadOrchestrator).
   */
  updateConfig(partial: Partial<IncomingTxMonitorConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Re-read wallets with monitor_incoming=1 from DB and reconcile
   * with current multiplexer subscriptions.
   */
  async syncSubscriptions(): Promise<void> {
    const dbWallets = this.sqlite
      .prepare(
        `SELECT id, chain, environment, public_key FROM wallets WHERE monitor_incoming = 1`,
      )
      .all() as Array<{
      id: string;
      chain: string;
      environment: string;
      public_key: string;
    }>;

    // Add any new wallets to multiplexer on all networks (addWallet handles dedup internally)
    for (const wallet of dbWallets) {
      const networks = getNetworksForEnvironment(
        wallet.chain as ChainType,
        wallet.environment as EnvironmentType,
      );
      if (!networks || !Array.isArray(networks)) continue;
      for (const network of networks) {
        try {
          await this.multiplexer.addWallet(
            wallet.chain,
            network,
            wallet.id,
            wallet.public_key,
          );
        } catch (err) {
          this.logger.warn(
            `syncSubscriptions: failed to add wallet ${wallet.id} on ${network}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  // ── Internal: flush handler logic ──────────────────────────────

  /**
   * Core flush worker: flush queue, evaluate safety rules, emit events, send notifications.
   */
  private createFlushHandler(): () => Promise<void> {
    return async () => {
      const inserted = this.queue.flush(this.sqlite);
      if (inserted.length === 0) return;

      for (const tx of inserted) {
        // 1. Evaluate safety rules
        const context = this.buildSafetyRuleContext(tx);
        const suspiciousReasons = this.safetyRules
          .filter((rule) => rule.check(tx, context))
          .map((rule) => rule.name);

        const isSuspicious = suspiciousReasons.length > 0;
        if (isSuspicious) {
          this.sqlite
            .prepare(
              'UPDATE incoming_transactions SET is_suspicious = 1 WHERE id = ?',
            )
            .run(tx.id);
        }

        // 2. Emit events (always, regardless of KillSwitch)
        this.eventBus.emit('transaction:incoming', {
          walletId: tx.walletId,
          txHash: tx.txHash,
          fromAddress: tx.fromAddress,
          amount: tx.amount,
          tokenAddress: tx.tokenAddress,
          chain: tx.chain,
          network: tx.network,
          status: tx.status,
          timestamp: tx.detectedAt,
        });

        if (isSuspicious) {
          this.eventBus.emit('transaction:incoming:suspicious', {
            walletId: tx.walletId,
            txHash: tx.txHash,
            fromAddress: tx.fromAddress,
            amount: tx.amount,
            tokenAddress: tx.tokenAddress,
            chain: tx.chain,
            network: tx.network,
            status: tx.status,
            timestamp: tx.detectedAt,
            suspiciousReasons,
          });
        }

        // 3. Send notifications (suppressed by KillSwitch, subject to cooldown)
        // Look up token symbol for formatted amount
        let tokenSymbol: string | null = null;
        if (tx.tokenAddress !== null) {
          try {
            const symRow = this.sqlite
              .prepare('SELECT symbol FROM token_registry WHERE address = ? AND chain = ? LIMIT 1')
              .get(tx.tokenAddress, tx.chain) as { symbol: string } | undefined;
            if (symRow) tokenSymbol = symRow.symbol;
          } catch { /* use default */ }
        }
        const formattedAmount = formatIncomingAmount(tx, context.decimals, tokenSymbol);

        const killState = this.killSwitchService?.getState();
        if (!killState || killState.state === 'ACTIVE') {
          const eventType = isSuspicious
            ? 'TX_INCOMING_SUSPICIOUS' as const
            : 'TX_INCOMING' as const;
          if (!this.isCooldownActive(tx.walletId, eventType)) {
            this.notificationService?.notify(
              eventType,
              tx.walletId,
              {
                walletId: tx.walletId,
                txHash: tx.txHash,
                amount: formattedAmount,
                fromAddress: tx.fromAddress,
                chain: tx.chain,
                display_amount: '',
                ...(isSuspicious && suspiciousReasons ? { reasons: suspiciousReasons.join(', ') } : {}),
              },
            );
            this.recordCooldown(tx.walletId, eventType);
          }
        }

        // 4. Update cursor
        updateCursor(
          this.sqlite,
          tx.walletId,
          tx.chain,
          tx.network,
          tx.blockNumber != null ? String(tx.blockNumber) : tx.txHash,
        );
      }
    };
  }

  /**
   * Build safety rule context for a transaction.
   * Uses best-effort data -- null for unavailable price/average data.
   */
  private buildSafetyRuleContext(tx: IncomingTransaction): SafetyRuleContext {
    // Token registry lookup: check if tokenAddress is registered
    let isRegisteredToken = true;
    if (tx.tokenAddress !== null) {
      try {
        const row = this.sqlite
          .prepare(
            `SELECT 1 FROM token_registry WHERE address = ? AND chain = ? LIMIT 1`,
          )
          .get(tx.tokenAddress, tx.chain);
        isRegisteredToken = !!row;
      } catch {
        // Table may not exist or query may fail -- safe default
        isRegisteredToken = true;
      }
    }

    // Decimals: try to get from token registry, fallback to chain default
    let decimals = tx.chain === 'solana' ? 9 : 18;
    if (tx.tokenAddress !== null) {
      try {
        const tokenRow = this.sqlite
          .prepare(
            `SELECT decimals FROM token_registry WHERE address = ? AND chain = ? LIMIT 1`,
          )
          .get(tx.tokenAddress, tx.chain) as
          | { decimals: number }
          | undefined;
        if (tokenRow) {
          decimals = tokenRow.decimals;
        }
      } catch {
        // Use default
      }
    }

    // USD price: not yet wired (requires PriceOracle integration)
    const usdPrice: number | null = null;

    // Average incoming USD: not yet computed (requires historical aggregation)
    const avgIncomingUsd: number | null = null;

    return {
      dustThresholdUsd: this.config.dustThresholdUsd,
      amountMultiplier: this.config.amountMultiplier,
      isRegisteredToken,
      usdPrice,
      avgIncomingUsd,
      decimals,
    };
  }

  // ── Internal: cooldown logic ───────────────────────────────────

  private isCooldownActive(walletId: string, eventType: string): boolean {
    const key = `${walletId}:${eventType}`;
    const lastNotified = this.notifyCooldown.get(key);
    if (lastNotified === undefined) return false;

    const now = Math.floor(Date.now() / 1000);
    return now - lastNotified < this.config.cooldownMinutes * 60;
  }

  private recordCooldown(walletId: string, eventType: string): void {
    const key = `${walletId}:${eventType}`;
    this.notifyCooldown.set(key, Math.floor(Date.now() / 1000));
  }

  // ── Internal: worker registration ──────────────────────────────

  private registerWorkers(): void {
    // 1. Flush worker (5s)
    this.workers.register('incoming-tx-flush', {
      interval: 5_000,
      handler: this.createFlushHandler(),
    });

    // 2. Retention worker (1 hour)
    this.workers.register('incoming-tx-retention', {
      interval: 3_600_000,
      handler: createRetentionWorkerHandler({
        sqlite: this.sqlite,
        getRetentionDays: () => this.config.retentionDays,
        logger: this.logger,
      }),
    });

    // 3. Confirmation worker for Solana (30s)
    // Build checkSolanaFinalized callback from multiplexer's Solana subscriber.
    // Uses structural typing to access checkFinalized() without importing the concrete class.
    const checkSolanaFinalized = async (txHash: string): Promise<boolean> => {
      const entries = this.multiplexer.getSubscribersForChain('solana');
      if (entries.length === 0) return false;
      return entries[0]!.subscriber.checkFinalized?.(txHash) ?? false;
    };

    this.workers.register('incoming-tx-confirm-solana', {
      interval: 30_000,
      handler: createConfirmationWorkerHandler({
        sqlite: this.sqlite,
        checkSolanaFinalized,
        logger: this.logger,
      }),
    });

    // 4. Confirmation worker for EVM (30s)
    // Build getBlockNumber callback from multiplexer's EVM subscriber.
    // Routes to the correct subscriber for the given chain:network pair.
    const getBlockNumber = async (_chain: string, network: string): Promise<bigint> => {
      const entries = this.multiplexer.getSubscribersForChain('ethereum');
      const entry = entries.find((e) => e.key === `ethereum:${network}`);
      if (!entry) throw new Error(`No EVM subscriber for network ${network}`);
      if (!entry.subscriber.getBlockNumber) {
        throw new Error(`Subscriber for ${network} does not support getBlockNumber`);
      }
      return entry.subscriber.getBlockNumber();
    };

    this.workers.register('incoming-tx-confirm-evm', {
      interval: 30_000,
      handler: createConfirmationWorkerHandler({
        sqlite: this.sqlite,
        getBlockNumber,
        logger: this.logger,
      }),
    });

    // 5. Polling worker for Solana (configurable interval)
    this.workers.register('incoming-tx-poll-solana', {
      interval: this.config.pollIntervalSec * 1000,
      handler: async () => {
        const entries = this.multiplexer.getSubscribersForChain('solana');
        for (const { subscriber } of entries) {
          try {
            await subscriber.pollAll?.();
          } catch (err) {
            this.logger.warn(`Solana polling worker error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      },
    });

    // 6. Polling worker for EVM (configurable interval, inter-subscriber staggering)
    this.workers.register('incoming-tx-poll-evm', {
      interval: this.config.pollIntervalSec * 1000,
      handler: async () => {
        const entries = this.multiplexer.getSubscribersForChain('ethereum');
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (!entry) continue;
          try {
            await entry.subscriber.pollAll?.();
          } catch (err) {
            this.logger.warn(`EVM polling worker error: ${err instanceof Error ? err.message : String(err)}`);
          }
          // Stagger between subscribers to avoid RPC rate-limit bursts
          if (i < entries.length - 1) {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      },
    });
  }
}
