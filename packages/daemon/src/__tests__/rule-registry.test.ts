/**
 * RuleRegistry unit tests + Zod SSoT schema validation.
 *
 * @see packages/daemon/src/services/autostop/rule-registry.ts
 * @see packages/core/src/schemas/admin-stats.schema.ts
 */

import { describe, it, expect } from 'vitest';
import { RuleRegistry } from '../services/autostop/rule-registry.js';
import type { IAutoStopRule, AutoStopEvent, RuleTickResult } from '../services/autostop/types.js';
import { AdminStatsResponseSchema, AutoStopRulesResponseSchema } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Helper: create mock rules
// ---------------------------------------------------------------------------

function createMockRule(overrides: Partial<IAutoStopRule> & { id: string }): IAutoStopRule {
  return {
    displayName: overrides.displayName ?? overrides.id,
    description: overrides.description ?? `Rule ${overrides.id}`,
    subscribedEvents: overrides.subscribedEvents ?? [],
    enabled: overrides.enabled ?? true,
    evaluate: overrides.evaluate ?? ((_e: AutoStopEvent) => ({ triggered: false, walletId: '' })),
    tick: overrides.tick,
    getStatus: overrides.getStatus ?? (() => ({ trackedCount: 0, config: {}, state: {} })),
    updateConfig: overrides.updateConfig ?? (() => {}),
    reset: overrides.reset ?? (() => {}),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RuleRegistry tests
// ---------------------------------------------------------------------------

describe('RuleRegistry', () => {
  it('register 3 rules -> getRules() returns 3 in insertion order', () => {
    const reg = new RuleRegistry();
    reg.register(createMockRule({ id: 'a' }));
    reg.register(createMockRule({ id: 'b' }));
    reg.register(createMockRule({ id: 'c' }));

    const rules = reg.getRules();
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(reg.size).toBe(3);
  });

  it('unregister -> getRules() returns 2', () => {
    const reg = new RuleRegistry();
    reg.register(createMockRule({ id: 'a' }));
    reg.register(createMockRule({ id: 'b' }));
    reg.register(createMockRule({ id: 'c' }));

    reg.unregister('b');

    const rules = reg.getRules();
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.id)).toEqual(['a', 'c']);
    expect(reg.size).toBe(2);
  });

  it('setEnabled(false) -> getEnabledRules() excludes disabled', () => {
    const reg = new RuleRegistry();
    reg.register(createMockRule({ id: 'a' }));
    reg.register(createMockRule({ id: 'b' }));
    reg.register(createMockRule({ id: 'c' }));

    reg.setEnabled('b', false);

    const enabled = reg.getEnabledRules();
    expect(enabled).toHaveLength(2);
    expect(enabled.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('getRulesForEvent returns only rules subscribed to the event', () => {
    const reg = new RuleRegistry();
    reg.register(createMockRule({ id: 'consecutive_failures', subscribedEvents: ['transaction:failed', 'transaction:completed'] }));
    reg.register(createMockRule({ id: 'unusual_activity', subscribedEvents: ['wallet:activity'] }));
    reg.register(createMockRule({ id: 'idle_timeout', subscribedEvents: ['wallet:activity'] }));

    const failedRules = reg.getRulesForEvent('transaction:failed');
    expect(failedRules).toHaveLength(1);
    expect(failedRules[0].id).toBe('consecutive_failures');

    const activityRules = reg.getRulesForEvent('wallet:activity');
    expect(activityRules).toHaveLength(2);
  });

  it('getTickableRules returns only rules with tick()', () => {
    const reg = new RuleRegistry();
    reg.register(createMockRule({ id: 'a' })); // no tick
    reg.register(createMockRule({
      id: 'b',
      tick: (_now: number) => [] as RuleTickResult[],
    }));
    reg.register(createMockRule({ id: 'c' })); // no tick

    const tickable = reg.getTickableRules();
    expect(tickable).toHaveLength(1);
    expect(tickable[0].id).toBe('b');
  });

  it('re-register same id -> replaces existing', () => {
    const reg = new RuleRegistry();
    reg.register(createMockRule({ id: 'a', displayName: 'First' }));
    reg.register(createMockRule({ id: 'a', displayName: 'Second' }));

    expect(reg.size).toBe(1);
    expect(reg.getRule('a')?.displayName).toBe('Second');
  });

  it('getRule returns undefined for unknown id', () => {
    const reg = new RuleRegistry();
    expect(reg.getRule('nonexistent')).toBeUndefined();
  });

  it('setEnabled on unknown id does nothing', () => {
    const reg = new RuleRegistry();
    // Should not throw
    reg.setEnabled('nonexistent', false);
    expect(reg.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Zod schema validation tests
// ---------------------------------------------------------------------------

describe('AdminStatsResponseSchema', () => {
  it('parses valid 7-category object', () => {
    const valid = {
      transactions: {
        total: 100,
        byStatus: { CONFIRMED: 80, FAILED: 20 },
        byType: { TRANSFER: 60, TOKEN_TRANSFER: 40 },
        last24h: { count: 10, totalUsd: 500.50 },
        last7d: { count: 70, totalUsd: 3500.00 },
      },
      sessions: { active: 5, total: 20, revokedLast24h: 2 },
      wallets: { total: 10, byStatus: { ACTIVE: 8, SUSPENDED: 2 }, withOwner: 5 },
      rpc: {
        totalCalls: 1000, totalErrors: 5, avgLatencyMs: 120.5,
        byNetwork: [{ network: 'solana-mainnet', calls: 500, errors: 2, avgLatencyMs: 100.0 }],
      },
      autostop: {
        enabled: true, triggeredTotal: 3,
        rules: [{ id: 'consecutive_failures', displayName: 'Consecutive Failures', enabled: true, trackedCount: 2 }],
        lastTriggeredAt: 1709555555,
      },
      notifications: { sentLast24h: 15, failedLast24h: 1, channelStatus: { telegram: 'active', discord: 'active' } },
      system: {
        uptimeSeconds: 86400, version: '2.9.0', schemaVersion: 37,
        dbSizeBytes: 1048576, nodeVersion: 'v22.0.0', platform: 'darwin', timestamp: 1709555555,
      },
    };

    const result = AdminStatsResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe('AutoStopRulesResponseSchema', () => {
  it('parses valid rules array', () => {
    const valid = {
      globalEnabled: true,
      rules: [
        {
          id: 'consecutive_failures',
          displayName: 'Consecutive Failures',
          description: 'Suspends wallet after N consecutive transaction failures',
          enabled: true,
          subscribedEvents: ['transaction:failed', 'transaction:completed'],
          config: { threshold: 5 },
          state: {},
        },
        {
          id: 'unusual_activity',
          displayName: 'Unusual Activity',
          description: 'Suspends wallet when activity frequency exceeds threshold',
          enabled: true,
          subscribedEvents: ['wallet:activity'],
          config: { threshold: 20, windowSec: 300 },
          state: {},
        },
      ],
    };

    const result = AutoStopRulesResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});
