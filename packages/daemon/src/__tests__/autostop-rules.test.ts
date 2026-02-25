/**
 * Direct unit tests for autostop rule classes.
 * Covers accessors, runtime updates, and specific branches not exercised
 * through the higher-level AutoStopService integration tests.
 */
import { describe, it, expect } from 'vitest';

import {
  ConsecutiveFailuresRule,
  UnusualActivityRule,
  IdleTimeoutRule,
} from '../services/autostop-rules.js';

// ---------------------------------------------------------------------------
// ConsecutiveFailuresRule
// ---------------------------------------------------------------------------

describe('ConsecutiveFailuresRule', () => {
  it('exposes threshold via getter', () => {
    const rule = new ConsecutiveFailuresRule(3);
    expect(rule.threshold).toBe(3);
  });

  it('uses default threshold of 5', () => {
    const rule = new ConsecutiveFailuresRule();
    expect(rule.threshold).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// UnusualActivityRule
// ---------------------------------------------------------------------------

describe('UnusualActivityRule', () => {
  it('exposes threshold and windowSec via getters', () => {
    const rule = new UnusualActivityRule(10, 600);
    expect(rule.threshold).toBe(10);
    expect(rule.windowSec).toBe(600);
  });

  it('uses default threshold=20 and windowSec=300', () => {
    const rule = new UnusualActivityRule();
    expect(rule.threshold).toBe(20);
    expect(rule.windowSec).toBe(300);
  });

  it('updateThreshold changes threshold at runtime', () => {
    const rule = new UnusualActivityRule(10, 600);
    rule.updateThreshold(50);
    expect(rule.threshold).toBe(50);
  });

  it('updateWindow changes windowSec at runtime', () => {
    const rule = new UnusualActivityRule(10, 600);
    rule.updateWindow(120);
    expect(rule.windowSec).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// IdleTimeoutRule
// ---------------------------------------------------------------------------

describe('IdleTimeoutRule', () => {
  it('exposes idleTimeoutSec via getter', () => {
    const rule = new IdleTimeoutRule(1800);
    expect(rule.idleTimeoutSec).toBe(1800);
  });

  it('uses default idleTimeoutSec=3600', () => {
    const rule = new IdleTimeoutRule();
    expect(rule.idleTimeoutSec).toBe(3600);
  });

  it('updateTimeout changes idleTimeoutSec at runtime', () => {
    const rule = new IdleTimeoutRule(1800);
    rule.updateTimeout(900);
    expect(rule.idleTimeoutSec).toBe(900);
  });

  it('getTrackedSessionCount returns total sessions across wallets', () => {
    const rule = new IdleTimeoutRule();
    expect(rule.getTrackedSessionCount()).toBe(0);

    rule.registerSession('w1', 's1', 1000);
    rule.registerSession('w1', 's2', 1000);
    rule.registerSession('w2', 's3', 1000);
    expect(rule.getTrackedSessionCount()).toBe(3);
  });

  it('onWalletActivity with sessionId updates only that session', () => {
    const rule = new IdleTimeoutRule(100);
    rule.registerSession('w1', 's1', 1000);
    rule.registerSession('w1', 's2', 1000);

    // Update only s1
    rule.onWalletActivity('w1', 2000, 's1');

    // At time 1050, only s2 should be idle (s1 was updated to 2000)
    const idle = rule.checkIdle(1150);
    expect(idle).toEqual([{ walletId: 'w1', sessionId: 's2' }]);
  });

  it('onWalletActivity without sessionId updates all sessions for wallet', () => {
    const rule = new IdleTimeoutRule(100);
    rule.registerSession('w1', 's1', 1000);
    rule.registerSession('w1', 's2', 1000);

    // Update all sessions for w1
    rule.onWalletActivity('w1', 2000);

    // At time 2050, neither should be idle
    const idle = rule.checkIdle(2050);
    expect(idle).toEqual([]);
  });

  it('onWalletActivity ignores unknown walletId', () => {
    const rule = new IdleTimeoutRule();
    // Should not throw
    rule.onWalletActivity('unknown', 1000);
    expect(rule.getTrackedSessionCount()).toBe(0);
  });

  it('onWalletActivity with unknown sessionId does nothing', () => {
    const rule = new IdleTimeoutRule(100);
    rule.registerSession('w1', 's1', 1000);

    // s99 does not exist — should not throw or modify s1
    rule.onWalletActivity('w1', 2000, 's99');

    // s1 should still be at 1000
    const idle = rule.checkIdle(1150);
    expect(idle).toEqual([{ walletId: 'w1', sessionId: 's1' }]);
  });
});
