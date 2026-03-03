/**
 * AutoStopService: Registry-based anomaly detection engine with EventBus subscription.
 *
 * Refactored from direct rule references to RuleRegistry-based plugin architecture.
 * The registry enables per-rule enable/disable, runtime config, and external API access.
 *
 * Rules:
 *   AUTO-01 CONSECUTIVE_FAILURES -- 5 consecutive tx failures -> wallet SUSPENDED
 *   AUTO-02 UNUSUAL_ACTIVITY     -- High-frequency activity -> wallet SUSPENDED
 *   AUTO-03 IDLE_TIMEOUT         -- Idle session -> auto-revoke
 *   AUTO-04 MANUAL_TRIGGER       -- Manual trigger -> KillSwitch cascade
 *
 * @see PLUG-01, PLUG-02, AUTO-01~06 requirements
 */

import type { Database } from 'better-sqlite3';
import type { EventBus } from '@waiaas/core';
import type { KillSwitchService } from '../kill-switch-service.js';
import type { NotificationService } from '../../notifications/notification-service.js';
import { insertAuditLog } from '../../infrastructure/database/audit-helper.js';
import { RuleRegistry } from './rule-registry.js';
import type { IRuleRegistry } from './rule-registry.js';
import { ConsecutiveFailuresRule } from './rules/consecutive-failures.rule.js';
import { UnusualActivityRule } from './rules/unusual-activity.rule.js';
import { IdleTimeoutRule } from './rules/idle-timeout.rule.js';

// ---------------------------------------------------------------------------
// Configuration interface
// ---------------------------------------------------------------------------

export interface AutoStopConfig {
  consecutiveFailuresThreshold: number; // default 5
  unusualActivityThreshold: number; // default 20
  unusualActivityWindowSec: number; // default 300 (5 min)
  idleTimeoutSec: number; // default 3600 (1 hour)
  idleCheckIntervalSec: number; // default 60
  enabled: boolean; // default true
}

export const DEFAULT_AUTOSTOP_CONFIG: AutoStopConfig = {
  consecutiveFailuresThreshold: 5,
  unusualActivityThreshold: 20,
  unusualActivityWindowSec: 300,
  idleTimeoutSec: 3600,
  idleCheckIntervalSec: 60,
  enabled: true,
};

// ---------------------------------------------------------------------------
// AutoStopService
// ---------------------------------------------------------------------------

export class AutoStopService {
  private sqlite: Database;
  private eventBus: EventBus;
  private killSwitchService: KillSwitchService;
  private notificationService?: NotificationService;
  private config: AutoStopConfig;

  // Registry-based rule storage (PLUG-01)
  private _registry: RuleRegistry;

  // Keep typed references for backward-compatible direct access
  private consecutiveFailuresRule: ConsecutiveFailuresRule;
  private unusualActivityRule: UnusualActivityRule;
  private idleTimeoutRule: IdleTimeoutRule;

  // Idle check timer
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: {
    sqlite: Database;
    eventBus: EventBus;
    killSwitchService: KillSwitchService;
    notificationService?: NotificationService;
    config?: Partial<AutoStopConfig>;
  }) {
    this.sqlite = opts.sqlite;
    this.eventBus = opts.eventBus;
    this.killSwitchService = opts.killSwitchService;
    this.notificationService = opts.notificationService;
    this.config = { ...DEFAULT_AUTOSTOP_CONFIG, ...opts.config };

    // Create rule instances with configured thresholds
    this.consecutiveFailuresRule = new ConsecutiveFailuresRule(
      this.config.consecutiveFailuresThreshold,
    );
    this.unusualActivityRule = new UnusualActivityRule(
      this.config.unusualActivityThreshold,
      this.config.unusualActivityWindowSec,
    );
    this.idleTimeoutRule = new IdleTimeoutRule(this.config.idleTimeoutSec);

    // Register all 3 builtin rules in the registry (PLUG-01)
    this._registry = new RuleRegistry();
    this._registry.register(this.consecutiveFailuresRule);
    this._registry.register(this.unusualActivityRule);
    this._registry.register(this.idleTimeoutRule);
  }

  /** Expose registry for external access (API routes, hot-reload). */
  get registry(): IRuleRegistry {
    return this._registry;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Register EventBus listeners and start idle check timer. */
  start(): void {
    if (!this.config.enabled) return;

    // AUTO-01: CONSECUTIVE_FAILURES
    this.eventBus.on('transaction:failed', (data) => {
      if (!this.consecutiveFailuresRule.enabled) return;
      const result = this.consecutiveFailuresRule.evaluate({
        type: 'transaction:failed',
        walletId: data.walletId,
        timestamp: data.timestamp,
      });
      if (result.triggered) {
        this.suspendWallet(result.walletId, 'CONSECUTIVE_FAILURES');
      }
    });

    // Reset failure counter on successful transaction
    this.eventBus.on('transaction:completed', (data) => {
      if (!this.consecutiveFailuresRule.enabled) return;
      this.consecutiveFailuresRule.evaluate({
        type: 'transaction:completed',
        walletId: data.walletId,
        timestamp: data.timestamp,
      });
    });

    // AUTO-02: UNUSUAL_ACTIVITY + AUTO-03: IdleTimeout session tracking
    this.eventBus.on('wallet:activity', (data) => {
      // UnusualActivityRule
      if (this.unusualActivityRule.enabled) {
        const result = this.unusualActivityRule.evaluate({
          type: 'wallet:activity',
          walletId: data.walletId,
          timestamp: data.timestamp,
        });
        if (result.triggered) {
          this.suspendWallet(result.walletId, 'UNUSUAL_ACTIVITY');
        }
      }

      // IdleTimeoutRule: register new sessions or update activity
      if (this.idleTimeoutRule.enabled) {
        if (data.activity === 'SESSION_CREATED' && data.details?.sessionId) {
          this.idleTimeoutRule.registerSession(
            data.walletId,
            data.details.sessionId as string,
            data.timestamp,
          );
        } else if (data.details?.sessionId) {
          this.idleTimeoutRule.onWalletActivity(
            data.walletId,
            data.timestamp,
            data.details.sessionId as string,
          );
        } else {
          this.idleTimeoutRule.onWalletActivity(data.walletId, data.timestamp);
        }
      }
    });

    // AUTO-03: Periodic idle session check
    this.idleCheckTimer = setInterval(() => {
      this.checkIdleSessions();
    }, this.config.idleCheckIntervalSec * 1000);
  }

  /** Stop idle check timer. Does NOT remove EventBus listeners (shared resource). */
  stop(): void {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // AUTO-04: Manual Trigger
  // -----------------------------------------------------------------------

  /** Manually trigger Kill Switch cascade. */
  manualTrigger(triggeredBy: string): void {
    this.killSwitchService.activateWithCascade(triggeredBy);

    // Fire-and-forget notification (AUTO-06)
    void this.notificationService?.notify(
      'AUTO_STOP_TRIGGERED' as Parameters<NotificationService['notify']>[0],
      'system',
      { walletId: 'system', reason: 'Manual trigger by ' + triggeredBy, rule: 'MANUAL_TRIGGER' },
    );
  }

  // -----------------------------------------------------------------------
  // Wallet suspension (AUTO-01, AUTO-02)
  // -----------------------------------------------------------------------

  /** Suspend a wallet and log the action. Only affects ACTIVE wallets. */
  private suspendWallet(walletId: string, reason: string): void {
    const now = Math.floor(Date.now() / 1000);

    const result = this.sqlite
      .prepare(
        "UPDATE wallets SET status = 'SUSPENDED', suspended_at = ?, suspension_reason = ? WHERE id = ? AND status = 'ACTIVE'",
      )
      .run(now, reason, walletId);

    if (result.changes === 0) {
      // Wallet already suspended or not found -- skip notification/audit
      // Still reset counter to prevent re-checking
      this.consecutiveFailuresRule.resetWallet(walletId);
      return;
    }

    // Reset failure counter after trigger (must accumulate N new failures to re-trigger)
    this.consecutiveFailuresRule.resetWallet(walletId);

    // Audit log (best-effort via helper)
    insertAuditLog(this.sqlite, {
      eventType: 'AUTO_STOP_TRIGGERED',
      actor: 'autostop',
      walletId,
      details: { action: 'wallet_suspended', reason, walletId },
      severity: 'warning',
    });

    // Fire-and-forget notification (AUTO-06)
    void this.notificationService?.notify(
      'AUTO_STOP_TRIGGERED' as Parameters<NotificationService['notify']>[0],
      walletId,
      { walletId, reason, rule: reason },
    );
  }

  // -----------------------------------------------------------------------
  // Session idle detection (AUTO-03) -- notify only, no revoke (#204)
  // -----------------------------------------------------------------------

  /** Check idle sessions and send SESSION_IDLE notification instead of revoking. */
  private checkIdleSessions(): void {
    const now = Math.floor(Date.now() / 1000);
    const idleSessions = this.idleTimeoutRule.checkIdle(now);

    for (const { walletId, sessionId } of idleSessions) {
      this.notifyIdleSession(walletId, sessionId);
    }
  }

  /** Send SESSION_IDLE notification and remove from tracking to prevent duplicates (#204). */
  private notifyIdleSession(walletId: string, sessionId: string): void {
    // Remove from tracking to prevent duplicate notifications
    this.idleTimeoutRule.removeSession(walletId, sessionId);

    // Fire-and-forget notification
    void this.notificationService?.notify(
      'SESSION_IDLE' as Parameters<NotificationService['notify']>[0],
      walletId,
      { walletId, sessionId, reason: 'Idle session detected' },
    );
  }

  // -----------------------------------------------------------------------
  // Runtime configuration update (AUTO-05)
  // -----------------------------------------------------------------------

  /** Update configuration at runtime (e.g., from Admin Settings). */
  updateConfig(config: Partial<AutoStopConfig>): void {
    if (config.consecutiveFailuresThreshold !== undefined) {
      this.config.consecutiveFailuresThreshold = config.consecutiveFailuresThreshold;
      this.consecutiveFailuresRule.updateConfig({ threshold: config.consecutiveFailuresThreshold });
    }

    if (config.unusualActivityThreshold !== undefined) {
      this.config.unusualActivityThreshold = config.unusualActivityThreshold;
      this.unusualActivityRule.updateConfig({ threshold: config.unusualActivityThreshold });
    }

    if (config.unusualActivityWindowSec !== undefined) {
      this.config.unusualActivityWindowSec = config.unusualActivityWindowSec;
      this.unusualActivityRule.updateConfig({ windowSec: config.unusualActivityWindowSec });
    }

    if (config.idleTimeoutSec !== undefined) {
      this.config.idleTimeoutSec = config.idleTimeoutSec;
      this.idleTimeoutRule.updateConfig({ idleTimeoutSec: config.idleTimeoutSec });
    }

    if (config.idleCheckIntervalSec !== undefined) {
      this.config.idleCheckIntervalSec = config.idleCheckIntervalSec;
      // Restart timer with new interval
      if (this.idleCheckTimer) {
        clearInterval(this.idleCheckTimer);
        this.idleCheckTimer = setInterval(() => {
          this.checkIdleSessions();
        }, config.idleCheckIntervalSec * 1000);
      }
    }

    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
    }
  }

  // -----------------------------------------------------------------------
  // Monitoring / status
  // -----------------------------------------------------------------------

  /** Get current rule engine status for debugging/monitoring. */
  getStatus(): {
    enabled: boolean;
    config: AutoStopConfig;
    rules: {
      consecutiveFailures: { trackedWallets: number };
      unusualActivity: { trackedWallets: number };
      idleTimeout: { trackedSessions: number };
    };
  } {
    return {
      enabled: this.config.enabled,
      config: { ...this.config },
      rules: {
        consecutiveFailures: {
          trackedWallets: this.consecutiveFailuresRule.getStatus().trackedCount,
        },
        unusualActivity: {
          trackedWallets: this.unusualActivityRule.getStatus().trackedCount,
        },
        idleTimeout: {
          trackedSessions: this.idleTimeoutRule.getStatus().trackedCount,
        },
      },
    };
  }
}
