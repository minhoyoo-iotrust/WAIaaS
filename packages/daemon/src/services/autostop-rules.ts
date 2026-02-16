/**
 * AutoStop rule implementations: pure in-memory logic for detecting anomalous behavior.
 *
 * Three rules:
 * 1. ConsecutiveFailuresRule -- Track consecutive transaction failures per wallet.
 *    Triggers when a wallet reaches N consecutive failures (default: 5).
 *
 * 2. UnusualActivityRule -- Sliding window frequency detection per wallet.
 *    Triggers when activity count within a time window exceeds threshold.
 *
 * 3. IdleTimeoutRule -- Track session last-activity timestamps per wallet.
 *    Returns idle sessions whose inactivity exceeds the configured timeout.
 *
 * All rules are stateless with respect to external dependencies (no DB, no network).
 * State is held in in-memory Maps and is lost on restart (acceptable for reactive rules).
 *
 * MANUAL_TRIGGER is handled directly by AutoStopService (no separate rule class).
 *
 * @see AUTO-01, AUTO-02, AUTO-03 requirements
 */

// ---------------------------------------------------------------------------
// Rule result types
// ---------------------------------------------------------------------------

export interface RuleResult {
  triggered: boolean;
  walletId: string;
}

export interface IdleSession {
  walletId: string;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Rule 1: ConsecutiveFailuresRule (AUTO-01)
// ---------------------------------------------------------------------------

export class ConsecutiveFailuresRule {
  private failureCounts = new Map<string, number>();
  private _threshold: number;

  constructor(threshold = 5) {
    this._threshold = threshold;
  }

  get threshold(): number {
    return this._threshold;
  }

  /** Record a transaction failure for a wallet. Returns triggered=true if threshold reached. */
  onTransactionFailed(walletId: string): RuleResult {
    const count = (this.failureCounts.get(walletId) ?? 0) + 1;
    this.failureCounts.set(walletId, count);

    return {
      triggered: count >= this._threshold,
      walletId,
    };
  }

  /** Reset failure counter on successful transaction. */
  onTransactionCompleted(walletId: string): void {
    this.failureCounts.set(walletId, 0);
  }

  /** Reset counter after trigger (prevents repeated triggers without new failures). */
  resetWallet(walletId: string): void {
    this.failureCounts.delete(walletId);
  }

  /** Update threshold at runtime. */
  updateThreshold(threshold: number): void {
    this._threshold = threshold;
  }

  /** Current state for monitoring. */
  getTrackedCount(): number {
    return this.failureCounts.size;
  }
}

// ---------------------------------------------------------------------------
// Rule 2: UnusualActivityRule (AUTO-02)
// ---------------------------------------------------------------------------

export class UnusualActivityRule {
  private activityTimestamps = new Map<string, number[]>();
  private _threshold: number;
  private _windowSec: number;

  constructor(threshold = 20, windowSec = 300) {
    this._threshold = threshold;
    this._windowSec = windowSec;
  }

  get threshold(): number {
    return this._threshold;
  }

  get windowSec(): number {
    return this._windowSec;
  }

  /** Record wallet activity. Returns triggered=true if frequency exceeds threshold. */
  onWalletActivity(walletId: string, timestamp: number): RuleResult {
    const cutoff = timestamp - this._windowSec;
    let timestamps = this.activityTimestamps.get(walletId) ?? [];

    // Prune timestamps outside the sliding window
    timestamps = timestamps.filter((t) => t > cutoff);
    timestamps.push(timestamp);
    this.activityTimestamps.set(walletId, timestamps);

    return {
      triggered: timestamps.length >= this._threshold,
      walletId,
    };
  }

  /** Update threshold at runtime. */
  updateThreshold(threshold: number): void {
    this._threshold = threshold;
  }

  /** Update window at runtime. */
  updateWindow(windowSec: number): void {
    this._windowSec = windowSec;
  }

  /** Current state for monitoring. */
  getTrackedCount(): number {
    return this.activityTimestamps.size;
  }
}

// ---------------------------------------------------------------------------
// Rule 3: IdleTimeoutRule (AUTO-03)
// ---------------------------------------------------------------------------

export class IdleTimeoutRule {
  // Map<walletId, Map<sessionId, lastActivityTimestampSec>>
  private lastActivity = new Map<string, Map<string, number>>();
  private _idleTimeoutSec: number;

  constructor(idleTimeoutSec = 3600) {
    this._idleTimeoutSec = idleTimeoutSec;
  }

  get idleTimeoutSec(): number {
    return this._idleTimeoutSec;
  }

  /** Register a new session with current timestamp. */
  registerSession(walletId: string, sessionId: string, nowSec: number): void {
    let walletSessions = this.lastActivity.get(walletId);
    if (!walletSessions) {
      walletSessions = new Map<string, number>();
      this.lastActivity.set(walletId, walletSessions);
    }
    walletSessions.set(sessionId, nowSec);
  }

  /** Update last activity time for a session (or all sessions of a wallet). */
  onWalletActivity(walletId: string, nowSec: number, sessionId?: string): void {
    const walletSessions = this.lastActivity.get(walletId);
    if (!walletSessions) return;

    if (sessionId && walletSessions.has(sessionId)) {
      walletSessions.set(sessionId, nowSec);
    } else if (!sessionId) {
      // Update all sessions for this wallet
      for (const sid of walletSessions.keys()) {
        walletSessions.set(sid, nowSec);
      }
    }
  }

  /** Check all tracked sessions and return those that have been idle beyond the timeout. */
  checkIdle(nowSec: number): IdleSession[] {
    const idle: IdleSession[] = [];

    for (const [walletId, sessions] of this.lastActivity) {
      for (const [sessionId, lastTime] of sessions) {
        if (nowSec - lastTime > this._idleTimeoutSec) {
          idle.push({ walletId, sessionId });
        }
      }
    }

    return idle;
  }

  /** Remove a session from tracking (after revocation). */
  removeSession(walletId: string, sessionId: string): void {
    const walletSessions = this.lastActivity.get(walletId);
    if (walletSessions) {
      walletSessions.delete(sessionId);
      if (walletSessions.size === 0) {
        this.lastActivity.delete(walletId);
      }
    }
  }

  /** Update timeout at runtime. */
  updateTimeout(idleTimeoutSec: number): void {
    this._idleTimeoutSec = idleTimeoutSec;
  }

  /** Current state for monitoring. */
  getTrackedSessionCount(): number {
    let count = 0;
    for (const sessions of this.lastActivity.values()) {
      count += sessions.size;
    }
    return count;
  }
}
