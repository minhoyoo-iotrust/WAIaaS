/**
 * MaturityMonitor: Yield position maturity warning monitor.
 *
 * Reads YIELD positions from defi_positions DB cache and checks
 * maturity dates against configurable warning thresholds.
 * Emits 'yield:maturity-warning' events via EventBus and sends
 * MATURITY_WARNING notifications.
 *
 * Implements IDeFiMonitor for DeFiMonitorService orchestration.
 *
 * Features:
 *   - 1-day polling interval (24h between checks)
 *   - 3 warning levels: 7-day, 1-day, post-maturity unredeemed
 *   - 24-hour cooldown per position per warning level
 *   - Configurable warning days via Admin Settings
 *
 * Design source: m29-00 design doc section 10.2.
 * @see YIELD-04
 */

import type { Database } from 'better-sqlite3';
import type { IDeFiMonitor, EventBus } from '@waiaas/core';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MaturityMonitorConfig {
  warningDays: number; // default 7 -- first warning at N days before maturity
  pollingIntervalMs: number; // default 86400000 (24h)
  cooldownMs: number; // default 86400000 (24h) per position:level
}

const DEFAULT_CONFIG: MaturityMonitorConfig = {
  warningDays: 7,
  pollingIntervalMs: 86_400_000, // 24 hours
  cooldownMs: 86_400_000, // 24 hours
};

// ---------------------------------------------------------------------------
// DB row type
// ---------------------------------------------------------------------------

interface YieldPositionRow {
  id: string;
  wallet_id: string;
  provider: string;
  metadata: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// MaturityMonitor
// ---------------------------------------------------------------------------

export class MaturityMonitor implements IDeFiMonitor {
  readonly name = 'maturity';

  private readonly sqlite: Database;
  private readonly eventBus: EventBus | null;
  private readonly notificationService: NotificationService | null;
  private config: MaturityMonitorConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // cooldown key = `${walletId}:${positionId}:${level}`
  private readonly cooldownMap = new Map<string, number>();

  constructor(opts: {
    sqlite: Database;
    eventBus?: EventBus;
    notificationService?: NotificationService;
    config?: Partial<MaturityMonitorConfig>;
  }) {
    this.sqlite = opts.sqlite;
    this.eventBus = opts.eventBus ?? null;
    this.notificationService = opts.notificationService ?? null;
    this.config = { ...DEFAULT_CONFIG, ...opts.config };
  }

  // -----------------------------------------------------------------------
  // IDeFiMonitor lifecycle
  // -----------------------------------------------------------------------

  start(): void {
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  updateConfig(config: Record<string, unknown>): void {
    if (typeof config['maturity_warning_days'] === 'number') {
      this.config.warningDays = config['maturity_warning_days'];
    }
    if (typeof config['maturity_polling_interval_ms'] === 'number') {
      this.config.pollingIntervalMs = config['maturity_polling_interval_ms'];
    }
  }

  /** Load config overrides from Admin Settings. */
  loadFromSettings(settingsService: SettingsService): void {
    try {
      const days = settingsService.get('actions.pendle_yield_maturity_warning_days');
      const parsed = Number(days);
      if (!Number.isNaN(parsed) && parsed > 0) {
        this.config.warningDays = parsed;
      }
    } catch { /* fallback to default */ }
  }

  // -----------------------------------------------------------------------
  // Testing accessors
  // -----------------------------------------------------------------------

  getCooldownMapSize(): number {
    return this.cooldownMap.size;
  }

  getConfig(): MaturityMonitorConfig {
    return { ...this.config };
  }

  // -----------------------------------------------------------------------
  // Core logic
  // -----------------------------------------------------------------------

  private scheduleNext(): void {
    this.timer = setTimeout(async () => {
      try {
        await this.checkAllPositions();
      } catch (err) {
        console.warn('MaturityMonitor check error:', err);
      }
      this.scheduleNext();
    }, this.config.pollingIntervalMs);
    this.timer.unref();
  }

  /**
   * Check all active YIELD positions for approaching maturity.
   * Exposed for direct testing access.
   */
  async checkAllPositions(): Promise<void> {
    const positions = this.sqlite
      .prepare(
        "SELECT id, wallet_id, provider, metadata, status FROM defi_positions WHERE category = 'YIELD' AND status = 'ACTIVE'",
      )
      .all() as YieldPositionRow[];

    const nowSec = Math.floor(Date.now() / 1000);

    for (const pos of positions) {
      if (!pos.metadata) continue;

      let meta: Record<string, unknown>;
      try {
        meta = JSON.parse(pos.metadata) as Record<string, unknown>;
      } catch {
        continue;
      }

      const maturity = meta.maturity;
      if (typeof maturity !== 'number') continue;

      const daysUntil = (maturity - nowSec) / 86_400;
      const marketId = typeof meta.market_id === 'string' ? meta.market_id : '';

      if (daysUntil <= 0) {
        // Post-maturity: unredeemed
        this.emitWarning(pos.wallet_id, pos.id, pos.provider, marketId, daysUntil, maturity, 'post-maturity');
      } else if (daysUntil <= 1) {
        // 1-day warning
        this.emitWarning(pos.wallet_id, pos.id, pos.provider, marketId, daysUntil, maturity, '1-day');
      } else if (daysUntil <= this.config.warningDays) {
        // N-day warning
        this.emitWarning(pos.wallet_id, pos.id, pos.provider, marketId, daysUntil, maturity, 'n-day');
      }
    }
  }

  // -----------------------------------------------------------------------
  // Warning emission
  // -----------------------------------------------------------------------

  private emitWarning(
    walletId: string,
    positionId: string,
    provider: string,
    marketId: string,
    daysUntil: number,
    maturityDate: number,
    level: 'n-day' | '1-day' | 'post-maturity',
  ): void {
    const key = `${walletId}:${positionId}:${level}`;
    const now = Date.now();

    // Check cooldown
    const lastAlert = this.cooldownMap.get(key);
    if (lastAlert && now - lastAlert < this.config.cooldownMs) {
      return;
    }

    // Emit EventBus event
    this.eventBus?.emit('yield:maturity-warning', {
      walletId,
      positionId,
      provider,
      marketId,
      daysUntilMaturity: Math.max(0, Math.round(daysUntil)),
      maturityDate,
      timestamp: now,
    });

    // Send notification
    void this.notificationService?.notify('MATURITY_WARNING', walletId, {
      daysUntilMaturity: String(Math.max(0, Math.round(daysUntil))),
      maturityDate: new Date(maturityDate * 1000).toISOString(),
      provider,
      marketId,
    });

    this.cooldownMap.set(key, now);
  }
}
