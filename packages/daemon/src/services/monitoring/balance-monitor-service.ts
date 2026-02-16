/**
 * BalanceMonitorService: periodic native-token balance check for all active wallets.
 *
 * Checks all ACTIVE wallets at a configurable interval (default 5 minutes).
 * When a wallet's native balance drops below the chain-specific threshold,
 * a LOW_BALANCE notification is sent via NotificationService.
 *
 * Features:
 *   - Chain-specific thresholds (SOL 0.01, ETH 0.005)
 *   - 24-hour cooldown to prevent duplicate alerts (BMON-03)
 *   - Recovery detection: re-alert if balance recovers then drops again (BMON-04)
 *   - Per-wallet error isolation: one wallet failure does not block others
 *   - Runtime configuration updates (updateConfig)
 *
 * @see BMON-01, BMON-02, BMON-03, BMON-04, BMON-05, BMON-06 requirements
 */

import type { Database } from 'better-sqlite3';
import type { ChainType, EnvironmentType, NetworkType } from '@waiaas/core';
import { getDefaultNetwork } from '@waiaas/core';
import type { AdapterPool } from '../../infrastructure/adapter-pool.js';
import { resolveRpcUrl } from '../../infrastructure/adapter-pool.js';
import type { NotificationService } from '../../notifications/notification-service.js';

// ---------------------------------------------------------------------------
// Configuration interface
// ---------------------------------------------------------------------------

export interface BalanceMonitorConfig {
  checkIntervalSec: number; // default 300 (5 min)
  lowBalanceThresholdSol: number; // default 0.01 (SOL)
  lowBalanceThresholdEth: number; // default 0.005 (ETH)
  cooldownHours: number; // default 24 (duplicate alert prevention)
  enabled: boolean; // default true
}

export const DEFAULT_BALANCE_MONITOR_CONFIG: BalanceMonitorConfig = {
  checkIntervalSec: 300,
  lowBalanceThresholdSol: 0.01,
  lowBalanceThresholdEth: 0.005,
  cooldownHours: 24,
  enabled: true,
};

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface WalletRow {
  id: string;
  chain: string;
  environment: string;
  default_network: string | null;
  public_key: string;
}

interface NotifyState {
  timestamp: number;
  wasLow: boolean;
}

// ---------------------------------------------------------------------------
// BalanceMonitorService
// ---------------------------------------------------------------------------

export class BalanceMonitorService {
  private sqlite: Database;
  private adapterPool: AdapterPool;
  private rpcConfig: Record<string, string>;
  private notificationService?: NotificationService;
  private config: BalanceMonitorConfig;

  // Duplicate alert prevention: Map<walletId, NotifyState>
  private lastNotified = new Map<string, NotifyState>();

  // Periodic check timer
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: {
    sqlite: Database;
    adapterPool: AdapterPool;
    config: { rpc: Record<string, string> };
    notificationService?: NotificationService;
    monitorConfig?: Partial<BalanceMonitorConfig>;
  }) {
    this.sqlite = opts.sqlite;
    this.adapterPool = opts.adapterPool;
    this.rpcConfig = opts.config.rpc;
    this.notificationService = opts.notificationService;
    this.config = { ...DEFAULT_BALANCE_MONITOR_CONFIG, ...opts.monitorConfig };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Start periodic balance checking. */
  start(): void {
    if (!this.config.enabled) return;

    this.checkTimer = setInterval(() => {
      void this.checkAllWallets();
    }, this.config.checkIntervalSec * 1000);
  }

  /** Stop periodic balance checking. */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Core: check all wallets
  // -----------------------------------------------------------------------

  /** Check balances of all ACTIVE wallets. */
  async checkAllWallets(): Promise<void> {
    const wallets = this.sqlite
      .prepare(
        "SELECT id, chain, environment, default_network, public_key FROM wallets WHERE status = 'ACTIVE'",
      )
      .all() as WalletRow[];

    for (const wallet of wallets) {
      try {
        await this.checkWallet(wallet);
      } catch {
        // Per-wallet error isolation: log but don't stop
      }
    }
  }

  // -----------------------------------------------------------------------
  // Per-wallet check
  // -----------------------------------------------------------------------

  private async checkWallet(wallet: WalletRow): Promise<void> {
    const chain = wallet.chain as ChainType;
    const env = wallet.environment as EnvironmentType;
    const network = (wallet.default_network ??
      getDefaultNetwork(chain, env)) as NetworkType;

    const rpcUrl = resolveRpcUrl(this.rpcConfig, chain, network);
    if (!rpcUrl) return; // No RPC URL configured -- skip

    const adapter = await this.adapterPool.resolve(chain, network, rpcUrl);
    const balanceInfo = await adapter.getBalance(wallet.public_key);

    // Convert from smallest unit to decimal
    const decimalBalance =
      Number(balanceInfo.balance) / 10 ** balanceInfo.decimals;
    const threshold = this.getThreshold(chain);
    const currency = balanceInfo.symbol;

    if (decimalBalance <= threshold) {
      // Balance is low
      if (this.shouldNotify(wallet.id)) {
        this.notifyLowBalance(wallet.id, decimalBalance, currency, threshold);
      }
      // Mark as low (regardless of notification)
      this.lastNotified.set(wallet.id, {
        timestamp: Date.now(),
        wasLow: true,
      });
    } else {
      // Balance is above threshold -- mark recovered if it was low
      this.markRecovered(wallet.id);
    }
  }

  // -----------------------------------------------------------------------
  // Threshold resolution
  // -----------------------------------------------------------------------

  private getThreshold(chain: ChainType): number {
    switch (chain) {
      case 'solana':
        return this.config.lowBalanceThresholdSol;
      case 'ethereum':
        return this.config.lowBalanceThresholdEth;
      default:
        return this.config.lowBalanceThresholdSol; // fallback
    }
  }

  // -----------------------------------------------------------------------
  // Duplicate alert prevention (BMON-03)
  // -----------------------------------------------------------------------

  private shouldNotify(walletId: string): boolean {
    const state = this.lastNotified.get(walletId);
    if (!state) return true; // Never notified

    // If balance recovered since last notification, allow new alert (BMON-04)
    if (!state.wasLow) return true;

    // Cooldown check: 24 hours since last notification
    const cooldownMs = this.config.cooldownHours * 3600 * 1000;
    return Date.now() - state.timestamp >= cooldownMs;
  }

  // -----------------------------------------------------------------------
  // Notification
  // -----------------------------------------------------------------------

  private notifyLowBalance(
    walletId: string,
    balance: number,
    currency: string,
    threshold: number,
  ): void {
    void this.notificationService?.notify('LOW_BALANCE', walletId, {
      walletId,
      balance: String(balance),
      currency,
      threshold: String(threshold),
    });

    this.lastNotified.set(walletId, {
      timestamp: Date.now(),
      wasLow: true,
    });
  }

  // -----------------------------------------------------------------------
  // Recovery detection (BMON-04)
  // -----------------------------------------------------------------------

  private markRecovered(walletId: string): void {
    const state = this.lastNotified.get(walletId);
    if (state && state.wasLow) {
      state.wasLow = false;
      // Keep timestamp -- cooldown does not reset on recovery.
      // But shouldNotify() checks wasLow first, so recovery + re-drop = new alert.
    }
  }

  // -----------------------------------------------------------------------
  // Runtime configuration update
  // -----------------------------------------------------------------------

  /** Update configuration at runtime (e.g., from Admin Settings). */
  updateConfig(config: Partial<BalanceMonitorConfig>): void {
    if (config.lowBalanceThresholdSol !== undefined) {
      this.config.lowBalanceThresholdSol = config.lowBalanceThresholdSol;
    }
    if (config.lowBalanceThresholdEth !== undefined) {
      this.config.lowBalanceThresholdEth = config.lowBalanceThresholdEth;
    }
    if (config.cooldownHours !== undefined) {
      this.config.cooldownHours = config.cooldownHours;
    }
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
    if (config.checkIntervalSec !== undefined) {
      this.config.checkIntervalSec = config.checkIntervalSec;
      // Restart timer with new interval
      if (this.checkTimer) {
        clearInterval(this.checkTimer);
        this.checkTimer = setInterval(() => {
          void this.checkAllWallets();
        }, config.checkIntervalSec * 1000);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Monitoring / status
  // -----------------------------------------------------------------------

  /** Get current monitoring status for debugging. */
  getStatus(): {
    enabled: boolean;
    config: BalanceMonitorConfig;
    trackedWallets: number;
  } {
    return {
      enabled: this.config.enabled,
      config: { ...this.config },
      trackedWallets: this.lastNotified.size,
    };
  }
}
