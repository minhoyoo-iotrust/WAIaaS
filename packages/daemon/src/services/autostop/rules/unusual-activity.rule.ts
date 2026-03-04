/**
 * UnusualActivityRule: IAutoStopRule implementation.
 *
 * Sliding window frequency detection per wallet.
 * Triggers SUSPEND_WALLET when activity count within a time window exceeds threshold.
 *
 * @see AUTO-02 requirement
 */

import type { IAutoStopRule, AutoStopEvent, AutoStopEventType, RuleResult, RuleStatus } from '../types.js';

export class UnusualActivityRule implements IAutoStopRule {
  readonly id = 'unusual_activity';
  readonly displayName = 'Unusual Activity';
  readonly description = 'Suspends wallet when activity frequency exceeds threshold in sliding window';
  readonly subscribedEvents: AutoStopEventType[] = ['wallet:activity'];
  enabled = true;

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

  evaluate(event: AutoStopEvent): RuleResult {
    const cutoff = event.timestamp - this._windowSec;
    let timestamps = this.activityTimestamps.get(event.walletId) ?? [];

    // Prune timestamps outside the sliding window
    timestamps = timestamps.filter((t) => t > cutoff);
    timestamps.push(event.timestamp);
    this.activityTimestamps.set(event.walletId, timestamps);

    return {
      triggered: timestamps.length >= this._threshold,
      walletId: event.walletId,
      action: timestamps.length >= this._threshold ? 'SUSPEND_WALLET' : undefined,
    };
  }

  getStatus(): RuleStatus {
    return {
      trackedCount: this.activityTimestamps.size,
      config: { threshold: this._threshold, windowSec: this._windowSec },
      state: {},
    };
  }

  updateConfig(config: Record<string, unknown>): void {
    if (config.threshold !== undefined) {
      this._threshold = Number(config.threshold);
    }
    if (config.windowSec !== undefined) {
      this._windowSec = Number(config.windowSec);
    }
  }

  reset(): void {
    this.activityTimestamps.clear();
  }

  // --- Backward-compatible methods (used by existing tests and hot-reload) ---

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
