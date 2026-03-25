/**
 * HealthFactorMonitor: Adaptive polling health factor monitor.
 *
 * Reads LENDING positions from defi_positions DB cache and evaluates
 * health factor against configurable severity thresholds. Adjusts its
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
 *
 * Design source: m29-00 design doc section 10.1.
 * @see LEND-05, LEND-06
 */

import type { Database } from 'better-sqlite3';
import type { IDeFiMonitor, MonitorSeverity, MonitorEvaluation } from '@waiaas/core';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { PositionTracker } from '../defi/position-tracker.js';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HealthFactorMonitorConfig {
  safeThreshold: number; // default 2.0
  warningThreshold: number; // default 1.5
  dangerThreshold: number; // default 1.2
  cooldownHours: number; // default 4
  maxLtvPct?: number; // default undefined (LendingPolicyEvaluator reference)
}

const DEFAULT_CONFIG: HealthFactorMonitorConfig = {
  safeThreshold: 2.0,
  warningThreshold: 1.5,
  dangerThreshold: 1.2,
  cooldownHours: 4,
};

/** Polling intervals per severity level (milliseconds). */
const SEVERITY_INTERVALS: Record<MonitorSeverity, number> = {
  SAFE: 300_000, // 5 min
  WARNING: 60_000, // 1 min
  DANGER: 15_000, // 15 sec
  CRITICAL: 5_000, // 5 sec
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
// HealthFactorMonitor
// ---------------------------------------------------------------------------

export class HealthFactorMonitor implements IDeFiMonitor {
  readonly name = 'health-factor';

  private readonly sqlite: Database;
  private readonly notificationService: NotificationService | null;
  private config: HealthFactorMonitorConfig;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentSeverity: MonitorSeverity = 'SAFE';
  private readonly cooldownMap = new Map<string, number>();

  constructor(opts: {
    sqlite: Database;
    notificationService?: NotificationService;
    positionTracker?: PositionTracker;
    config?: Partial<HealthFactorMonitorConfig>;
  }) {
    this.sqlite = opts.sqlite;
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
    if (typeof config['health_factor_safe_threshold'] === 'number') {
      this.config.safeThreshold = config['health_factor_safe_threshold'];
    }
    if (typeof config['health_factor_warning_threshold'] === 'number') {
      this.config.warningThreshold = config['health_factor_warning_threshold'];
    }
    if (typeof config['health_factor_danger_threshold'] === 'number') {
      this.config.dangerThreshold = config['health_factor_danger_threshold'];
    }
    if (typeof config['cooldown_hours'] === 'number') {
      this.config.cooldownHours = config['cooldown_hours'];
    }
    if (typeof config['max_ltv_pct'] === 'number') {
      this.config.maxLtvPct = config['max_ltv_pct'];
    }
  }

  /** Load config overrides from Admin Settings (Phase 278). */
  loadFromSettings(settingsService: SettingsService): void {
    try {
      const threshold = settingsService.get('actions.aave_v3_health_factor_warning_threshold');
      const parsed = Number(threshold);
      if (!Number.isNaN(parsed) && parsed > 0) {
        this.updateConfig({ health_factor_warning_threshold: parsed });
      }
    } catch { /* fallback to default */ }
    try {
      const maxLtv = settingsService.get('actions.aave_v3_max_ltv_pct');
      const parsed = Number(maxLtv);
      if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 1) {
        this.updateConfig({ max_ltv_pct: parsed });
      }
    } catch { /* fallback to default */ }
    // Also read Kamino HF threshold (KINT-07: use minimum across providers)
    try {
      const kaminoThreshold = settingsService.get('actions.kamino_hf_threshold');
      const kaminoParsed = Number(kaminoThreshold);
      if (!Number.isNaN(kaminoParsed) && kaminoParsed > 0) {
        // Use the lower threshold (more conservative) between current and kamino
        const currentWarning = this.config.warningThreshold;
        if (kaminoParsed < currentWarning) {
          this.updateConfig({ health_factor_warning_threshold: kaminoParsed });
        }
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
        console.warn('HealthFactorMonitor check error:', err);
      }
      this.scheduleNext(); // recursive reschedule
    }, interval);
    this.timer.unref();
  }

  /**
   * Check all active LENDING positions and evaluate health factors.
   * Exposed for direct testing access.
   */
  async checkAllPositions(): Promise<void> {
    // Read all ACTIVE LENDING positions from DB cache
    const positions = this.sqlite
      .prepare(
        "SELECT id, wallet_id, provider, metadata, status FROM defi_positions WHERE category = 'LENDING' AND status = 'ACTIVE'",
      )
      .all() as PositionRow[];

    let worstSeverity: MonitorSeverity = 'SAFE';
    const recoveredKeys = new Set<string>();

    // Track which keys we've seen to identify recoveries
    const seenKeys = new Set<string>();

    for (const pos of positions) {
      if (!pos.metadata) continue;

      let meta: Record<string, unknown>;
      try {
        meta = JSON.parse(pos.metadata) as Record<string, unknown>;
      } catch {
        continue;
      }

      const hf = meta.healthFactor;
      if (typeof hf !== 'number') continue;

      const severity = this.classifySeverity(hf);
      const key = `${pos.wallet_id}:${pos.id}`;
      seenKeys.add(key);

      // Track worst severity
      if (this.severityRank(severity) > this.severityRank(worstSeverity)) {
        worstSeverity = severity;
      }

      if (severity === 'SAFE') {
        // Recovery: clear cooldown
        if (this.cooldownMap.has(key)) {
          recoveredKeys.add(key);
          this.cooldownMap.delete(key);
        }
        continue;
      }

      // Non-SAFE: emit alert
      const evaluation: MonitorEvaluation = {
        walletId: pos.wallet_id,
        positionId: pos.id,
        severity,
        value: hf,
        threshold: this.getThresholdForSeverity(severity),
        provider: pos.provider,
      };

      this.emitAlert(evaluation);
    }

    // Update current severity
    this.currentSeverity = worstSeverity;

    // On-demand sync removed (#455): periodic position sync replaced by
    // action-triggered sync to avoid RPC 429 flood from SDK calls.
  }

  // -----------------------------------------------------------------------
  // Alert emission
  // -----------------------------------------------------------------------

  private emitAlert(evaluation: MonitorEvaluation): void {
    const key = `${evaluation.walletId}:${evaluation.positionId}`;
    const now = Date.now();
    const cooldownMs = this.config.cooldownHours * 60 * 60 * 1000;
    const vars = {
      healthFactor: evaluation.value.toFixed(2),
      threshold: evaluation.threshold.toFixed(2),
    };

    if (evaluation.severity === 'CRITICAL') {
      // CRITICAL: no cooldown -- always send
      void this.notificationService?.notify('LIQUIDATION_IMMINENT', evaluation.walletId, vars);
      this.cooldownMap.set(key, now);
    } else {
      // WARNING/DANGER: 4-hour cooldown
      const lastAlert = this.cooldownMap.get(key);
      if (lastAlert && now - lastAlert < cooldownMs) {
        return; // cooldown active
      }
      void this.notificationService?.notify('LIQUIDATION_WARNING', evaluation.walletId, vars);
      this.cooldownMap.set(key, now);
    }
  }

  // -----------------------------------------------------------------------
  // Severity classification
  // -----------------------------------------------------------------------

  private classifySeverity(hf: number): MonitorSeverity {
    if (hf < this.config.dangerThreshold) return 'CRITICAL';
    if (hf < this.config.warningThreshold) return 'DANGER';
    if (hf < this.config.safeThreshold) return 'WARNING';
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
