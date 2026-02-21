/**
 * AutoStopService: 4-rule anomaly detection engine with EventBus subscription.
 *
 * Rules:
 *   AUTO-01 CONSECUTIVE_FAILURES -- 5 consecutive tx failures -> wallet SUSPENDED
 *   AUTO-02 UNUSUAL_ACTIVITY     -- High-frequency activity -> wallet SUSPENDED
 *   AUTO-03 IDLE_TIMEOUT         -- Idle session -> auto-revoke
 *   AUTO-04 MANUAL_TRIGGER       -- Manual trigger -> KillSwitch cascade
 *
 * EventBus subscriptions (registered in start()):
 *   - transaction:failed    -> ConsecutiveFailuresRule
 *   - transaction:completed -> ConsecutiveFailuresRule (reset on success)
 *   - wallet:activity       -> UnusualActivityRule + IdleTimeoutRule
 *
 * Idle session check runs on a periodic interval (setInterval).
 *
 * DB writes use better-sqlite3 directly (same pattern as KillSwitchService).
 *
 * @see AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-06 requirements
 */

import type { Database } from 'better-sqlite3';
import type { EventBus } from '@waiaas/core';
import type { KillSwitchService } from './kill-switch-service.js';
import type { NotificationService } from '../notifications/notification-service.js';
import {
  ConsecutiveFailuresRule,
  UnusualActivityRule,
  IdleTimeoutRule,
} from './autostop-rules.js';

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

  // Rule instances
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

    // Initialize rules with configured thresholds
    this.consecutiveFailuresRule = new ConsecutiveFailuresRule(
      this.config.consecutiveFailuresThreshold,
    );
    this.unusualActivityRule = new UnusualActivityRule(
      this.config.unusualActivityThreshold,
      this.config.unusualActivityWindowSec,
    );
    this.idleTimeoutRule = new IdleTimeoutRule(this.config.idleTimeoutSec);
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Register EventBus listeners and start idle check timer. */
  start(): void {
    if (!this.config.enabled) return;

    // AUTO-01: CONSECUTIVE_FAILURES
    this.eventBus.on('transaction:failed', (data) => {
      const result = this.consecutiveFailuresRule.onTransactionFailed(data.walletId);
      if (result.triggered) {
        this.suspendWallet(result.walletId, 'CONSECUTIVE_FAILURES');
      }
    });

    // Reset failure counter on successful transaction
    this.eventBus.on('transaction:completed', (data) => {
      this.consecutiveFailuresRule.onTransactionCompleted(data.walletId);
    });

    // AUTO-02: UNUSUAL_ACTIVITY + AUTO-03: IdleTimeout session tracking
    this.eventBus.on('wallet:activity', (data) => {
      // UnusualActivityRule
      const result = this.unusualActivityRule.onWalletActivity(
        data.walletId,
        data.timestamp,
      );
      if (result.triggered) {
        this.suspendWallet(result.walletId, 'UNUSUAL_ACTIVITY');
      }

      // IdleTimeoutRule: register new sessions or update activity
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

    // Audit log
    try {
      this.sqlite
        .prepare(
          'INSERT INTO audit_log (timestamp, event_type, actor, details, severity) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          now,
          'AUTO_STOP_TRIGGERED',
          'autostop',
          JSON.stringify({ action: 'wallet_suspended', reason, walletId }),
          'warning',
        );
    } catch {
      // Best-effort audit logging
    }

    // Fire-and-forget notification (AUTO-06)
    void this.notificationService?.notify(
      'AUTO_STOP_TRIGGERED' as Parameters<NotificationService['notify']>[0],
      walletId,
      { walletId, reason, rule: reason },
    );
  }

  // -----------------------------------------------------------------------
  // Session revocation (AUTO-03)
  // -----------------------------------------------------------------------

  /** Check and revoke idle sessions. */
  private checkIdleSessions(): void {
    const now = Math.floor(Date.now() / 1000);
    const idleSessions = this.idleTimeoutRule.checkIdle(now);

    for (const { walletId, sessionId } of idleSessions) {
      this.revokeSession(walletId, sessionId);
    }
  }

  /** Revoke a single session due to idle timeout. */
  private revokeSession(walletId: string, sessionId: string): void {
    const now = Math.floor(Date.now() / 1000);

    const result = this.sqlite
      .prepare(
        `UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL
         AND EXISTS (SELECT 1 FROM session_wallets WHERE session_id = sessions.id AND wallet_id = ?)`,
      )
      .run(now, sessionId, walletId);

    // Remove from tracking regardless of DB result
    this.idleTimeoutRule.removeSession(walletId, sessionId);

    if (result.changes === 0) return; // Already revoked or not found

    // Fire-and-forget notification (AUTO-06)
    void this.notificationService?.notify(
      'AUTO_STOP_TRIGGERED' as Parameters<NotificationService['notify']>[0],
      walletId,
      { walletId, reason: 'Idle session revoked: ' + sessionId, rule: 'IDLE_TIMEOUT' },
    );
  }

  // -----------------------------------------------------------------------
  // Runtime configuration update (AUTO-05)
  // -----------------------------------------------------------------------

  /** Update configuration at runtime (e.g., from Admin Settings). */
  updateConfig(config: Partial<AutoStopConfig>): void {
    if (config.consecutiveFailuresThreshold !== undefined) {
      this.config.consecutiveFailuresThreshold = config.consecutiveFailuresThreshold;
      this.consecutiveFailuresRule.updateThreshold(config.consecutiveFailuresThreshold);
    }

    if (config.unusualActivityThreshold !== undefined) {
      this.config.unusualActivityThreshold = config.unusualActivityThreshold;
      this.unusualActivityRule.updateThreshold(config.unusualActivityThreshold);
    }

    if (config.unusualActivityWindowSec !== undefined) {
      this.config.unusualActivityWindowSec = config.unusualActivityWindowSec;
      this.unusualActivityRule.updateWindow(config.unusualActivityWindowSec);
    }

    if (config.idleTimeoutSec !== undefined) {
      this.config.idleTimeoutSec = config.idleTimeoutSec;
      this.idleTimeoutRule.updateTimeout(config.idleTimeoutSec);
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
          trackedWallets: this.consecutiveFailuresRule.getTrackedCount(),
        },
        unusualActivity: {
          trackedWallets: this.unusualActivityRule.getTrackedCount(),
        },
        idleTimeout: {
          trackedSessions: this.idleTimeoutRule.getTrackedSessionCount(),
        },
      },
    };
  }
}
