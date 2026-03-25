/**
 * MarginMonitor: Adaptive polling margin ratio monitor for perp positions.
 *
 * Reads PERP positions from defi_positions DB cache and evaluates
 * margin ratio against configurable severity thresholds. Adjusts its
 * own polling interval based on worst severity across all positions.
 *
 * Implements IDeFiMonitor for DeFiMonitorService orchestration.
 *
 * Features:
 *   - 4-level severity: SAFE(5min) -> WARNING(1min) -> DANGER(15s) -> CRITICAL(5s)
 *   - Recursive setTimeout (not setInterval) for dynamic interval changes
 *   - Cooldown: WARNING/DANGER 4-hour cooldown per walletId:positionId, no cooldown for CRITICAL
 *   - On-demand PositionTracker sync when entering DANGER/CRITICAL
 *   - Cooldown cleanup on recovery to SAFE
 *   - EventBus 'perp:margin-warning' event emission
 *
 * NOTE: marginRatio = currentMargin / maintenanceMarginRequired.
 * Lower marginRatio = more dangerous (opposite of health factor direction for interpretation).
 * marginRatio < dangerThreshold = CRITICAL, < warningThreshold = DANGER, etc.
 *
 * @see PERP-03, PERP-04
 */

import type { Database } from 'better-sqlite3';
import type { IDeFiMonitor, MonitorSeverity, MonitorEvaluation, EventBus } from '@waiaas/core';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { PositionTracker } from '../defi/position-tracker.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface MarginMonitorConfig {
  safeThreshold: number;     // default 0.30 (30% margin ratio -- above this = safe)
  warningThreshold: number;  // default 0.15 (15% -- below safe, above this = WARNING)
  dangerThreshold: number;   // default 0.10 (10% -- below warning, above this = DANGER)
  cooldownHours: number;     // default 4
}

const DEFAULT_CONFIG: MarginMonitorConfig = {
  safeThreshold: 0.30,
  warningThreshold: 0.15,
  dangerThreshold: 0.10,
  cooldownHours: 4,
};

/** Polling intervals per severity level (milliseconds). */
const SEVERITY_INTERVALS: Record<MonitorSeverity, number> = {
  SAFE: 300_000,    // 5 min
  WARNING: 60_000,  // 1 min
  DANGER: 15_000,   // 15 sec
  CRITICAL: 5_000,  // 5 sec
};

// ---------------------------------------------------------------------------
// DB row type
// ---------------------------------------------------------------------------

interface PositionRow {
  id: string;
  wallet_id: string;
  provider: string;
  metadata: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// MarginMonitor
// ---------------------------------------------------------------------------

export class MarginMonitor implements IDeFiMonitor {
  readonly name = 'margin';

  private readonly sqlite: Database;
  private readonly eventBus: EventBus | null;
  private readonly notificationService: NotificationService | null;
  private config: MarginMonitorConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentSeverity: MonitorSeverity = 'SAFE';
  private readonly cooldownMap = new Map<string, number>();

  constructor(opts: {
    sqlite: Database;
    eventBus?: EventBus;
    notificationService?: NotificationService;
    positionTracker?: PositionTracker;
    config?: Partial<MarginMonitorConfig>;
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
    if (typeof config['margin_safe_threshold'] === 'number') {
      this.config.safeThreshold = config['margin_safe_threshold'];
    }
    if (typeof config['margin_warning_threshold'] === 'number') {
      this.config.warningThreshold = config['margin_warning_threshold'];
    }
    if (typeof config['margin_danger_threshold'] === 'number') {
      this.config.dangerThreshold = config['margin_danger_threshold'];
    }
    if (typeof config['cooldown_hours'] === 'number') {
      this.config.cooldownHours = config['cooldown_hours'];
    }
  }

  /** Load config overrides from Admin Settings. */
  loadFromSettings(settingsService: SettingsService): void {
    try {
      const threshold = settingsService.get('actions.drift_margin_warning_threshold_pct');
      const parsed = Number(threshold);
      if (!Number.isNaN(parsed) && parsed > 0) {
        this.updateConfig({ margin_warning_threshold: parsed });
      }
    } catch { /* fallback to default */ }
  }

  // -----------------------------------------------------------------------
  // Testing accessors
  // -----------------------------------------------------------------------

  getCurrentSeverity(): MonitorSeverity {
    return this.currentSeverity;
  }

  getCooldownMapSize(): number {
    return this.cooldownMap.size;
  }

  // -----------------------------------------------------------------------
  // Core logic
  // -----------------------------------------------------------------------

  private scheduleNext(): void {
    const interval = SEVERITY_INTERVALS[this.currentSeverity];
    this.timer = setTimeout(async () => {
      try {
        await this.checkAllPositions();
      } catch (err) {
        console.warn('MarginMonitor check error:', err);
      }
      this.scheduleNext(); // recursive reschedule
    }, interval);
    this.timer.unref();
  }

  /**
   * Check all active PERP positions and evaluate margin ratios.
   * Exposed for direct testing access.
   */
  async checkAllPositions(): Promise<void> {
    // Read all ACTIVE PERP positions from DB cache
    const positions = this.sqlite
      .prepare(
        "SELECT id, wallet_id, provider, metadata, status FROM defi_positions WHERE category = 'PERP' AND status = 'ACTIVE'",
      )
      .all() as PositionRow[];

    let worstSeverity: MonitorSeverity = 'SAFE';

    for (const pos of positions) {
      if (!pos.metadata) continue;

      let meta: Record<string, unknown>;
      try {
        meta = JSON.parse(pos.metadata) as Record<string, unknown>;
      } catch {
        continue;
      }

      const marginRatio = meta.marginRatio;
      if (typeof marginRatio !== 'number') continue;

      const severity = this.classifySeverity(marginRatio);
      const key = `${pos.wallet_id}:${pos.id}`;

      // Track worst severity
      if (this.severityRank(severity) > this.severityRank(worstSeverity)) {
        worstSeverity = severity;
      }

      if (severity === 'SAFE') {
        // Recovery: clear cooldown
        if (this.cooldownMap.has(key)) {
          this.cooldownMap.delete(key);
        }
        continue;
      }

      const market = typeof meta.market === 'string' ? meta.market : '';

      // Non-SAFE: emit alert
      const evaluation: MonitorEvaluation = {
        walletId: pos.wallet_id,
        positionId: pos.id,
        severity,
        value: marginRatio,
        threshold: this.getThresholdForSeverity(severity),
        provider: pos.provider,
      };

      this.emitAlert(evaluation, market);
    }

    // Update current severity
    this.currentSeverity = worstSeverity;

    // On-demand sync removed (#455): periodic position sync replaced by
    // action-triggered sync to avoid RPC 429 flood from SDK calls.
  }

  // -----------------------------------------------------------------------
  // Alert emission
  // -----------------------------------------------------------------------

  private emitAlert(evaluation: MonitorEvaluation, market: string): void {
    const key = `${evaluation.walletId}:${evaluation.positionId}`;
    const now = Date.now();
    const cooldownMs = this.config.cooldownHours * 60 * 60 * 1000;

    const vars = {
      marginRatio: (evaluation.value * 100).toFixed(1),
      threshold: (evaluation.threshold * 100).toFixed(1),
      provider: evaluation.provider,
    };

    if (evaluation.severity === 'CRITICAL') {
      // CRITICAL: no cooldown -- always send
      this.eventBus?.emit('perp:margin-warning', {
        walletId: evaluation.walletId,
        positionId: evaluation.positionId,
        provider: evaluation.provider,
        market,
        marginRatio: evaluation.value,
        threshold: evaluation.threshold,
        severity: 'CRITICAL',
        timestamp: now,
      });
      void this.notificationService?.notify('LIQUIDATION_IMMINENT', evaluation.walletId, vars);
      this.cooldownMap.set(key, now);
    } else {
      // WARNING/DANGER: 4-hour cooldown
      const lastAlert = this.cooldownMap.get(key);
      if (lastAlert && now - lastAlert < cooldownMs) {
        return; // cooldown active
      }

      this.eventBus?.emit('perp:margin-warning', {
        walletId: evaluation.walletId,
        positionId: evaluation.positionId,
        provider: evaluation.provider,
        market,
        marginRatio: evaluation.value,
        threshold: evaluation.threshold,
        severity: evaluation.severity === 'DANGER' ? 'DANGER' : 'WARNING',
        timestamp: now,
      });
      void this.notificationService?.notify('MARGIN_WARNING', evaluation.walletId, vars);
      this.cooldownMap.set(key, now);
    }
  }

  // -----------------------------------------------------------------------
  // Severity classification
  // -----------------------------------------------------------------------

  private classifySeverity(marginRatio: number): MonitorSeverity {
    if (marginRatio < this.config.dangerThreshold) return 'CRITICAL';
    if (marginRatio < this.config.warningThreshold) return 'DANGER';
    if (marginRatio < this.config.safeThreshold) return 'WARNING';
    return 'SAFE';
  }

  private getThresholdForSeverity(severity: MonitorSeverity): number {
    switch (severity) {
      case 'CRITICAL':
        return this.config.dangerThreshold;
      case 'DANGER':
        return this.config.warningThreshold;
      case 'WARNING':
        return this.config.safeThreshold;
      default:
        return this.config.safeThreshold;
    }
  }

  /** Higher rank = more severe. */
  private severityRank(severity: MonitorSeverity): number {
    switch (severity) {
      case 'SAFE':
        return 0;
      case 'WARNING':
        return 1;
      case 'DANGER':
        return 2;
      case 'CRITICAL':
        return 3;
    }
  }
}
