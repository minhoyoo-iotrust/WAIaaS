/**
 * IdleTimeoutRule: IAutoStopRule implementation.
 *
 * Tracks session last-activity timestamps per wallet.
 * tick() returns idle sessions whose inactivity exceeds the configured timeout.
 *
 * @see AUTO-03 requirement
 */

import type { IAutoStopRule, AutoStopEvent, AutoStopEventType, RuleResult, RuleTickResult, RuleStatus } from '../types.js';

/** Type alias for backward compatibility with old tests. */
export interface IdleSession {
  walletId: string;
  sessionId: string;
}

export class IdleTimeoutRule implements IAutoStopRule {
  readonly id = 'idle_timeout';
  readonly displayName = 'Idle Session Timeout';
  readonly description = 'Notifies when sessions remain idle beyond configured timeout';
  readonly subscribedEvents: AutoStopEventType[] = ['wallet:activity'];
  enabled = true;

  // Map<walletId, Map<sessionId, lastActivityTimestampSec>>
  private lastActivity = new Map<string, Map<string, number>>();
  private _idleTimeoutSec: number;

  constructor(idleTimeoutSec = 3600) {
    this._idleTimeoutSec = idleTimeoutSec;
  }

  get idleTimeoutSec(): number {
    return this._idleTimeoutSec;
  }

  evaluate(event: AutoStopEvent): RuleResult {
    // Session registration and activity updates via evaluate
    if (event.details?.activity === 'SESSION_CREATED' && event.details?.sessionId) {
      this.registerSession(event.walletId, event.details.sessionId as string, event.timestamp);
    } else if (event.details?.sessionId) {
      this.onWalletActivity(event.walletId, event.timestamp, event.details.sessionId as string);
    } else {
      this.onWalletActivity(event.walletId, event.timestamp);
    }

    // Idle detection is via tick(), not evaluate
    return { triggered: false, walletId: event.walletId };
  }

  tick(nowSec: number): RuleTickResult[] {
    const results: RuleTickResult[] = [];
    for (const [walletId, sessions] of this.lastActivity) {
      for (const [sessionId, lastTime] of sessions) {
        if (nowSec - lastTime > this._idleTimeoutSec) {
          results.push({ walletId, sessionId, action: 'NOTIFY_IDLE' });
        }
      }
    }
    return results;
  }

  getStatus(): RuleStatus {
    let sessionCount = 0;
    for (const sessions of this.lastActivity.values()) {
      sessionCount += sessions.size;
    }
    return {
      trackedCount: sessionCount,
      config: { idleTimeoutSec: this._idleTimeoutSec },
      state: {},
    };
  }

  updateConfig(config: Record<string, unknown>): void {
    if (config.idleTimeoutSec !== undefined) {
      this._idleTimeoutSec = Number(config.idleTimeoutSec);
    }
  }

  reset(): void {
    this.lastActivity.clear();
  }

  // --- Public methods (used by AutoStopService directly) ---

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

  /** Update timeout at runtime (backward compat). */
  updateTimeout(idleTimeoutSec: number): void {
    this._idleTimeoutSec = idleTimeoutSec;
  }

  /** Current state for monitoring (backward compat). */
  getTrackedSessionCount(): number {
    let count = 0;
    for (const sessions of this.lastActivity.values()) {
      count += sessions.size;
    }
    return count;
  }
}
