/**
 * PositionTracker: DeFi position synchronization service.
 *
 * Startup-once + action-triggered sync model (#455):
 *   - On daemon start: one-time sync for all categories
 *   - After that: on-demand sync triggered by action execution (syncWallet)
 *   - No periodic timers — eliminates SDK-driven RPC 429 flood
 *
 * Features:
 *   - Startup sync for all categories (one-time)
 *   - syncWallet() for per-wallet on-demand refresh after action execution
 *   - syncCategory() retained for manual/admin-triggered refresh
 *   - Per-wallet error isolation (one wallet failure does not block others)
 *   - Dynamic provider registration/unregistration
 *
 * Design source: m29-00 design doc section 6.2.
 * @see LEND-03, LEND-04, #455
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

  /** Register a position provider. */
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

  /**
   * Start position tracker: one-time sync for all categories (#455).
   * No periodic timers — subsequent syncs are triggered by action execution.
   */
  start(): void {
    for (const category of POSITION_CATEGORIES) {
      this.running.set(category, false);
    }
    // One-time startup sync for all categories
    for (const category of POSITION_CATEGORIES) {
      void this.syncCategory(category);
    }
  }

  /** Stop (no-op since no timers, retained for interface compatibility). */
  stop(): void {
    this.running.clear();
  }

  // -----------------------------------------------------------------------
  // Sync
  // -----------------------------------------------------------------------

  /**
   * Synchronize all positions for the given category.
   *
   * Callable on-demand (e.g., from admin refresh or startup).
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
            const ctx = this.buildQueryContext(wallet);
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

  /**
   * Sync positions for a single wallet across all providers in the given category (#455).
   *
   * Called after action execution (e.g., Kamino supply/borrow, Drift open/close)
   * to refresh that wallet's positions without scanning all wallets.
   */
  async syncWallet(walletId: string, category: PositionCategory): Promise<void> {
    const categoryProviders = this.getProvidersForCategory(category);
    if (categoryProviders.length === 0) return;

    const wallet = this.sqlite
      .prepare("SELECT id, public_key, chain, environment FROM wallets WHERE id = ?")
      .get(walletId) as { id: string; public_key: string; chain: string; environment: string } | undefined;

    if (!wallet) return;

    for (const provider of categoryProviders) {
      try {
        const ctx = this.buildQueryContext(wallet);
        const positions = await provider.getPositions(ctx);
        for (const pos of positions) {
          pos.environment = wallet.environment;
          this.writeQueue.enqueue(pos);
        }
      } catch (err) {
        console.warn(
          `PositionTracker: syncWallet error for wallet ${walletId} via ${provider.getProviderName()}:`,
          err,
        );
      }
    }

    this.writeQueue.flush(this.sqlite);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Build PositionQueryContext from wallet metadata. */
  private buildQueryContext(wallet: {
    id: string;
    public_key: string;
    chain: string;
    environment: string;
  }): PositionQueryContext {
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
    return {
      walletId: wallet.id,
      walletAddress: wallet.public_key,
      chain,
      networks,
      environment,
      rpcUrls,
    };
  }

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
