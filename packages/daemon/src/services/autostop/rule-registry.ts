/**
 * RuleRegistry: Map-based storage for IAutoStopRule instances.
 *
 * Supports register/unregister, enable/disable per-rule, and
 * query by event type or tickable capability.
 *
 * @see PLUG-01 requirements
 */

import type { IAutoStopRule, AutoStopEventType } from './types.js';

// ---------------------------------------------------------------------------
// IRuleRegistry interface
// ---------------------------------------------------------------------------

export interface IRuleRegistry {
  register(rule: IAutoStopRule): void;
  unregister(ruleId: string): void;
  getRules(): IAutoStopRule[];
  getRule(id: string): IAutoStopRule | undefined;
  getEnabledRules(): IAutoStopRule[];
  getRulesForEvent(eventType: AutoStopEventType): IAutoStopRule[];
  getTickableRules(): IAutoStopRule[];
  setEnabled(ruleId: string, enabled: boolean): void;
  readonly size: number;
}

// ---------------------------------------------------------------------------
// RuleRegistry implementation
// ---------------------------------------------------------------------------

export class RuleRegistry implements IRuleRegistry {
  private rules = new Map<string, IAutoStopRule>();

  /** Register a rule (replaces existing rule with same id). */
  register(rule: IAutoStopRule): void {
    this.rules.set(rule.id, rule);
  }

  /** Unregister a rule by id. */
  unregister(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /** Get all rules in insertion order. */
  getRules(): IAutoStopRule[] {
    return Array.from(this.rules.values());
  }

  /** Get a single rule by id. */
  getRule(id: string): IAutoStopRule | undefined {
    return this.rules.get(id);
  }

  /** Get only enabled rules. */
  getEnabledRules(): IAutoStopRule[] {
    return this.getRules().filter((r) => r.enabled);
  }

  /** Get enabled rules that subscribe to the given event type. */
  getRulesForEvent(eventType: AutoStopEventType): IAutoStopRule[] {
    return this.getEnabledRules().filter((r) => r.subscribedEvents.includes(eventType));
  }

  /** Get enabled rules that have a tick() method. */
  getTickableRules(): IAutoStopRule[] {
    return this.getEnabledRules().filter((r) => typeof r.tick === 'function');
  }

  /** Set enabled state for a specific rule. */
  setEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /** Number of registered rules. */
  get size(): number {
    return this.rules.size;
  }
}
