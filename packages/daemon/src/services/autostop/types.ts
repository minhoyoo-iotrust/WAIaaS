/**
 * AutoStop plugin architecture types.
 *
 * IAutoStopRule defines the contract for pluggable rules.
 * RuleRegistry manages rule lifecycle (register/unregister/query).
 *
 * @see PLUG-01, PLUG-02 requirements
 */

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type AutoStopEventType = 'transaction:failed' | 'transaction:completed' | 'wallet:activity';

export type RuleAction = 'SUSPEND_WALLET' | 'NOTIFY_IDLE' | 'KILL_SWITCH_CASCADE';

export interface AutoStopEvent {
  type: AutoStopEventType;
  walletId: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Rule result types
// ---------------------------------------------------------------------------

export interface RuleResult {
  triggered: boolean;
  walletId: string;
  action?: RuleAction;
}

export interface RuleTickResult {
  walletId: string;
  sessionId?: string;
  action: RuleAction;
}

export interface RuleStatus {
  trackedCount: number;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// IAutoStopRule interface
// ---------------------------------------------------------------------------

export interface IAutoStopRule {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly subscribedEvents: AutoStopEventType[];
  enabled: boolean;

  /** Evaluate an event against this rule. */
  evaluate(event: AutoStopEvent): RuleResult;

  /** Periodic tick for time-based rules (e.g., idle timeout). Optional. */
  tick?(nowSec: number): RuleTickResult[];

  /** Get current rule status for monitoring. */
  getStatus(): RuleStatus;

  /** Update rule configuration at runtime. */
  updateConfig(config: Record<string, unknown>): void;

  /** Reset all internal state. */
  reset(): void;
}
