/**
 * Backward-compatible re-export barrel for autostop rule classes.
 *
 * The actual implementations have been moved to:
 *   - services/autostop/rules/consecutive-failures.rule.ts
 *   - services/autostop/rules/unusual-activity.rule.ts
 *   - services/autostop/rules/idle-timeout.rule.ts
 *
 * @deprecated Import from './autostop/rules/*.rule.js' directly.
 */

export { ConsecutiveFailuresRule } from './autostop/rules/consecutive-failures.rule.js';
export { UnusualActivityRule } from './autostop/rules/unusual-activity.rule.js';
export { IdleTimeoutRule } from './autostop/rules/idle-timeout.rule.js';
export type { IdleSession } from './autostop/rules/idle-timeout.rule.js';
export type { RuleResult } from './autostop/types.js';
