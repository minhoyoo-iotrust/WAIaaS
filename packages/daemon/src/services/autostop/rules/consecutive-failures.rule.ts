/**
 * ConsecutiveFailuresRule: IAutoStopRule implementation.
 *
 * Tracks consecutive transaction failures per wallet.
 * Triggers SUSPEND_WALLET when a wallet reaches N consecutive failures (default: 5).
 *
 * @see AUTO-01 requirement
 */

import type { IAutoStopRule, AutoStopEvent, AutoStopEventType, RuleResult, RuleStatus } from '../types.js';

export class ConsecutiveFailuresRule implements IAutoStopRule {
  readonly id = 'consecutive_failures';
  readonly displayName = 'Consecutive Failures';
  readonly description = 'Suspends wallet after N consecutive transaction failures';
  readonly subscribedEvents: AutoStopEventType[] = ['transaction:failed', 'transaction:completed'];
  enabled = true;

  private failureCounts = new Map<string, number>();
  private _threshold: number;

  constructor(threshold = 5) {
    this._threshold = threshold;
  }

  get threshold(): number {
    return this._threshold;
  }

  evaluate(event: AutoStopEvent): RuleResult {
    if (event.type === 'transaction:completed') {
      // Reset failure counter on successful transaction
      this.failureCounts.set(event.walletId, 0);
      return { triggered: false, walletId: event.walletId };
    }

    // transaction:failed
    const count = (this.failureCounts.get(event.walletId) ?? 0) + 1;
    this.failureCounts.set(event.walletId, count);

    return {
      triggered: count >= this._threshold,
      walletId: event.walletId,
      action: count >= this._threshold ? 'SUSPEND_WALLET' : undefined,
    };
  }

  getStatus(): RuleStatus {
    return {
      trackedCount: this.failureCounts.size,
      config: { threshold: this._threshold },
      state: {},
    };
  }

  updateConfig(config: Record<string, unknown>): void {
    if (config.threshold !== undefined) {
      this._threshold = Number(config.threshold);
    }
  }

  reset(): void {
    this.failureCounts.clear();
  }

  /** Reset counter after trigger (prevents repeated triggers without new failures). */
  resetWallet(walletId: string): void {
    this.failureCounts.delete(walletId);
  }

  // --- Backward-compatible methods ---

  /** Record a transaction failure (backward compat -- delegates to evaluate). */
  onTransactionFailed(walletId: string): { triggered: boolean; walletId: string } {
    return this.evaluate({ type: 'transaction:failed', walletId, timestamp: Date.now() / 1000 });
  }

  /** Reset failure counter on successful transaction (backward compat). */
  onTransactionCompleted(walletId: string): void {
    this.evaluate({ type: 'transaction:completed', walletId, timestamp: Date.now() / 1000 });
  }

  /** Update threshold at runtime (backward compat). */
  updateThreshold(threshold: number): void {
    this._threshold = threshold;
  }

  /** Current state for monitoring (backward compat). */
  getTrackedCount(): number {
    return this.failureCounts.size;
  }
}
