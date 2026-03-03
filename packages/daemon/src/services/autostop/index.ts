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

export { AutoStopService, DEFAULT_AUTOSTOP_CONFIG } from './autostop-service.js';
export type { AutoStopConfig } from './autostop-service.js';

export { ConsecutiveFailuresRule } from './rules/consecutive-failures.rule.js';
export { UnusualActivityRule } from './rules/unusual-activity.rule.js';
export { IdleTimeoutRule } from './rules/idle-timeout.rule.js';
export type { IdleSession } from './rules/idle-timeout.rule.js';
