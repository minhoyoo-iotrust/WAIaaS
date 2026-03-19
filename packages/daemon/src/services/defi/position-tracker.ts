/**
 * PositionTracker: Periodic DeFi position synchronization service.
 *
 * Maintains per-category timers to sync positions from registered
 * IPositionProvider implementations into the defi_positions table
 * via PositionWriteQueue.
 *
 * Features:
 *   - Per-category intervals (LENDING=5min, PERP=1min, STAKING=15min, YIELD=1h)
 *   - Overlap prevention per category (running flag)
 *   - Per-wallet error isolation (one wallet failure does not block others)
 *   - On-demand syncCategory() for urgent refresh (e.g., HealthFactorMonitor)
 *   - Dynamic provider registration/unregistration
 *
 * Design source: m29-00 design doc section 6.2.
 * Pattern: BalanceMonitorService + IncomingTxQueue hybrid.
 * @see LEND-03, LEND-04
 */

import type { Database } from 'better-sqlite3';
import type { IPositionProvider, PositionCategory, PositionQueryContext } from '@waiaas/core';
import type { ChainType, EnvironmentType } from '@waiaas/core';
import { POSITION_CATEGORIES, getNetworksForEnvironment } from '@waiaas/core';
import type { RpcPool } from '@waiaas/core';
import { PositionWriteQueue } from './position-write-queue.js';
import { resolveRpcUrl, resolveRpcUrlFromPool } from '../../infrastructure/adapter-pool.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface PositionTrackerConfig {
  enabled: boolean;
}

/** Default polling intervals per category (milliseconds). */
const DEFAULT_INTERVALS: Record<PositionCategory, number> = {
  LENDING: 300_000, // 5 min
  PERP: 60_000, // 1 min
  STAKING: 900_000, // 15 min
  YIELD: 3_600_000, // 1 hour
};

// ---------------------------------------------------------------------------
// PositionTracker
// ---------------------------------------------------------------------------

export class PositionTracker {
  private readonly sqlite: Database;
  private readonly settingsService?: SettingsService;
  private readonly rpcConfig: Record<string, string>;
  private readonly rpcPool?: RpcPool;
  private readonly writeQueue: PositionWriteQueue;
  private readonly providers = new Map<string, IPositionProvider>();
  private readonly timers = new Map<PositionCategory, NodeJS.Timeout>();
  private readonly running = new Map<PositionCategory, boolean>();

  constructor(opts: {
    sqlite: Database;
    settingsService?: SettingsService;
    rpcConfig?: Record<string, string>;
    rpcPool?: RpcPool;
  }) {
    this.sqlite = opts.sqlite;
    this.settingsService = opts.settingsService;
    this.rpcConfig = opts.rpcConfig ?? {};
    this.rpcPool = opts.rpcPool;
    this.writeQueue = new PositionWriteQueue();
  }

  // -----------------------------------------------------------------------
  // Provider management
  // -----------------------------------------------------------------------

  /** Register a position provider for periodic sync. */
  registerProvider(provider: IPositionProvider): void {
    this.providers.set(provider.getProviderName(), provider);
  }

  /** Unregister a position provider by name. */
  unregisterProvider(name: string): void {
    this.providers.delete(name);
  }

  /** Number of registered providers. */
  get providerCount(): number {
    return this.providers.size;
  }

  /** Current write queue size. */
  get queueSize(): number {
    return this.writeQueue.size;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Start per-category polling timers. */
  start(): void {
    for (const category of POSITION_CATEGORIES) {
      this.running.set(category, false);
      let intervalMs = DEFAULT_INTERVALS[category];
      // Runtime override from Admin Settings (Phase 278)
      if (category === 'LENDING' && this.settingsService) {
        try {
          const val = this.settingsService.get('actions.aave_v3_position_sync_interval_sec');
          const parsed = Number(val);
          if (!Number.isNaN(parsed) && parsed > 0) {
            intervalMs = parsed * 1000; // seconds -> milliseconds
          }
        } catch { /* fallback to default */ }
      }
      const timer = setInterval(() => void this.syncCategory(category), intervalMs);
      timer.unref();
      this.timers.set(category, timer);
    }
    // Immediate first sync for all categories
    for (const category of POSITION_CATEGORIES) {
      void this.syncCategory(category);
    }
  }

  /** Stop all polling timers. */
  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.running.clear();
  }

  // -----------------------------------------------------------------------
  // Sync
  // -----------------------------------------------------------------------

  /**
   * Synchronize all positions for the given category.
   *
   * Callable on-demand (e.g., from HealthFactorMonitor for urgent LENDING refresh)
   * or by the periodic timer.
   *
   * Overlap prevention: if a sync for this category is already running, the call
   * returns immediately (no queuing).
   */
  async syncCategory(category: PositionCategory): Promise<void> {
    // Overlap prevention
    if (this.running.get(category)) return;
    this.running.set(category, true);

    try {
      const categoryProviders = this.getProvidersForCategory(category);
      if (categoryProviders.length === 0) return;

      // Get active wallets with chain/environment metadata
      const wallets = this.sqlite
        .prepare("SELECT id, public_key, chain, environment FROM wallets WHERE status = 'ACTIVE'")
        .all() as Array<{ id: string; public_key: string; chain: string; environment: string }>;

      for (const provider of categoryProviders) {
        for (const wallet of wallets) {
          try {
            // Build PositionQueryContext from wallet metadata
            const chain = wallet.chain as ChainType;
            const environment = wallet.environment as EnvironmentType;
            const networks = getNetworksForEnvironment(chain, environment);
            const rpcUrls: Record<string, string> = {};
            for (const net of networks) {
              let url: string | undefined;
              if (this.rpcPool && this.settingsService) {
                try {
                  url = resolveRpcUrlFromPool(this.rpcPool, this.settingsService.get.bind(this.settingsService), chain, net);
                } catch { /* fall through to legacy */ }
              }
              if (!url) {
                url = resolveRpcUrl(this.rpcConfig, chain, net);
              }
              if (url) rpcUrls[net] = url;
            }
            const ctx: PositionQueryContext = {
              walletId: wallet.id,
              walletAddress: wallet.public_key,
              chain,
              networks,
              environment,
              rpcUrls,
            };
            const positions = await provider.getPositions(ctx);
            for (const pos of positions) {
              pos.environment = wallet.environment;
              this.writeQueue.enqueue(pos);
            }
          } catch (err) {
            // Per-wallet error isolation: one wallet failure does not block others
            console.warn(
              `PositionTracker: sync error for wallet ${wallet.id} via ${provider.getProviderName()}:`,
              err,
            );
          }
        }
      }

      // Flush all enqueued positions to DB
      this.writeQueue.flush(this.sqlite);
    } finally {
      this.running.set(category, false);
    }
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Filter registered providers that support the given category. */
  private getProvidersForCategory(category: PositionCategory): IPositionProvider[] {
    const result: IPositionProvider[] = [];
    for (const provider of this.providers.values()) {
      if (provider.getSupportedCategories().includes(category)) {
        result.push(provider);
      }
    }
    return result;
  }
}
