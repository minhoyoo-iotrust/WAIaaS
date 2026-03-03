/**
 * AutoStop plugin module barrel export.
 *
 * Re-exports types, registry, service, and individual rule implementations.
 */

export type {
  IAutoStopRule,
  AutoStopEventType,
  AutoStopEvent,
  RuleResult,
  RuleAction,
  RuleTickResult,
  RuleStatus,
} from './types.js';

export type { IRuleRegistry } from './rule-registry.js';
export { RuleRegistry } from './rule-registry.js';
