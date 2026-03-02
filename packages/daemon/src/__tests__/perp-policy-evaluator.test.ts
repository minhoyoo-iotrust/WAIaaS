/**
 * Unit tests for DatabasePolicyEngine perp policy evaluation.
 *
 * Tests PERP_ALLOWED_MARKETS (Step 4i), PERP_MAX_LEVERAGE (Step 4i-b),
 * PERP_MAX_POSITION_USD (Step 4i-c) for perp actions.
 * @see PERP-05, PERP-06, PERP-07
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, policies } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let engine: DatabasePolicyEngine;
let walletId: string;

async function insertTestWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'mainnet',
    publicKey: `pk-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertPolicy(overrides: {
  walletId?: string | null;
  type: string;
  rules: string;
  priority?: number;
  enabled?: boolean;
}): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id,
    walletId: overrides.walletId ?? null,
    type: overrides.type,
    rules: overrides.rules,
    priority: overrides.priority ?? 0,
    enabled: overrides.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function perpTx(
  actionName: string,
  contractAddress = '0xDriftProgram',
  perpLeverage?: number,
  perpSizeUsd?: number,
) {
  return {
    type: 'CONTRACT_CALL',
    amount: '0',
    toAddress: contractAddress,
    chain: 'solana',
    contractAddress,
    actionProvider: 'drift',
    actionName,
    perpLeverage,
    perpSizeUsd,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  // Create SettingsService with default_deny_contracts=false so CONTRACT_WHITELIST
  // doesn't block perp CONTRACT_CALL transactions (perp actions use provider-trust
  // in production; in tests we just disable default-deny for contracts)
  const config = DaemonConfigSchema.parse({});
  const ss = new SettingsService({
    db: conn.db,
    config,
    masterPassword: 'test-master-password',
  });
  ss.set('policy.default_deny_contracts', 'false');

  engine = new DatabasePolicyEngine(conn.db, conn.sqlite, ss);
  walletId = await insertTestWallet();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// PERP_ALLOWED_MARKETS - Step 4i
// ---------------------------------------------------------------------------

describe('PERP_ALLOWED_MARKETS - Step 4i', () => {
  it('denies perp action when no whitelist configured (default-deny)', async () => {
    // Need at least one policy so we don't hit "no policies -> INSTANT passthrough" (Step 2)
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max: '999999999', notify_max: '999999999', delay_max: '999999999', delay_seconds: 300 }),
    });

    const result = await engine.evaluate(walletId, perpTx('drift_open_position'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No PERP_ALLOWED_MARKETS policy configured');
  });

  it('allows perp action when market is whitelisted', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_ALLOWED_MARKETS',
      rules: JSON.stringify({
        markets: [{ market: '0xDriftProgram', name: 'Drift' }],
      }),
    });

    const result = await engine.evaluate(walletId, perpTx('drift_open_position', '0xDriftProgram'));
    expect(result.allowed).toBe(true);
  });

  it('denies perp action when market is NOT whitelisted', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_ALLOWED_MARKETS',
      rules: JSON.stringify({
        markets: [{ market: '0xOtherProgram' }],
      }),
    });

    const result = await engine.evaluate(walletId, perpTx('drift_open_position', '0xDriftProgram'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in perp allowed markets whitelist');
  });

  it('matches market case-insensitively', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_ALLOWED_MARKETS',
      rules: JSON.stringify({
        markets: [{ market: '0xdriftprogram' }],
      }),
    });

    const result = await engine.evaluate(walletId, perpTx('drift_open_position', '0xDriftProgram'));
    expect(result.allowed).toBe(true);
  });

  it('does not affect non-perp actions (supply, borrow, etc.)', async () => {
    // Need at least one policy to avoid Step 2 passthrough
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max: '999999999', notify_max: '999999999', delay_max: '999999999', delay_seconds: 300 }),
    });

    // supply is a lending action, not a perp action -- PERP_ALLOWED_MARKETS should not apply
    // (but LENDING_ASSET_WHITELIST will deny it; we check that it's not denied by PERP reason)
    const result = await engine.evaluate(walletId, {
      type: 'CONTRACT_CALL',
      amount: '0',
      toAddress: '0xSomeContract',
      chain: 'solana',
      contractAddress: '0xSomeContract',
      actionProvider: 'aave-v3',
      actionName: 'supply',
    });
    // It should be denied by LENDING_ASSET_WHITELIST (not PERP_ALLOWED_MARKETS)
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('LENDING_ASSET_WHITELIST');
  });

  it('applies to all 5 perp actions with prefix matching', async () => {
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max: '999999999', notify_max: '999999999', delay_max: '999999999', delay_seconds: 300 }),
    });

    // Without whitelist, all perp actions should be denied
    const perpActions = [
      'drift_open_position',
      'drift_close_position',
      'drift_modify_position',
      'drift_add_margin',
      'drift_withdraw_margin',
    ];

    for (const action of perpActions) {
      const result = await engine.evaluate(walletId, perpTx(action));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('PERP_ALLOWED_MARKETS');
    }
  });

  it('matches suffix correctly (drift_open_position -> open_position)', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_ALLOWED_MARKETS',
      rules: JSON.stringify({
        markets: [{ market: '0xDriftProgram' }],
      }),
    });

    // Prefixed action should match via suffix
    const result = await engine.evaluate(walletId, perpTx('drift_open_position', '0xDriftProgram'));
    expect(result.allowed).toBe(true);

    // Unprefixed action should also match
    const result2 = await engine.evaluate(walletId, perpTx('open_position', '0xDriftProgram'));
    expect(result2.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PERP_MAX_LEVERAGE - Step 4i-b
// ---------------------------------------------------------------------------

describe('PERP_MAX_LEVERAGE - Step 4i-b', () => {
  beforeEach(async () => {
    // All leverage tests need PERP_ALLOWED_MARKETS to pass first
    await insertPolicy({
      walletId,
      type: 'PERP_ALLOWED_MARKETS',
      rules: JSON.stringify({
        markets: [{ market: '0xDriftProgram' }],
      }),
    });
  });

  it('denies when perpLeverage exceeds maxLeverage', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_MAX_LEVERAGE',
      rules: JSON.stringify({ maxLeverage: 10, warningLeverage: 5 }),
    });

    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram', 15),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Leverage 15x exceeds max allowed (10x)');
  });

  it('allows when perpLeverage is within limits', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_MAX_LEVERAGE',
      rules: JSON.stringify({ maxLeverage: 10, warningLeverage: 5 }),
    });

    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram', 3),
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('returns DELAY tier when leverage exceeds warningLeverage but within max', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_MAX_LEVERAGE',
      rules: JSON.stringify({ maxLeverage: 10, warningLeverage: 5 }),
    });

    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram', 7),
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.reason).toContain('approaching limit');
  });

  it('passes through when perpLeverage is not provided', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_MAX_LEVERAGE',
      rules: JSON.stringify({ maxLeverage: 10 }),
    });

    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram'), // no perpLeverage
    );
    expect(result.allowed).toBe(true);
  });

  it('passes through when no leverage policy configured', async () => {
    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram', 20),
    );
    expect(result.allowed).toBe(true);
  });

  it('does not apply to non-leverage actions (close_position, add_margin)', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_MAX_LEVERAGE',
      rules: JSON.stringify({ maxLeverage: 2 }),
    });

    // close_position should not be affected by leverage check
    const result = await engine.evaluate(
      walletId,
      perpTx('drift_close_position', '0xDriftProgram', 100), // high leverage but close action
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// PERP_MAX_POSITION_USD - Step 4i-c
// ---------------------------------------------------------------------------

describe('PERP_MAX_POSITION_USD - Step 4i-c', () => {
  beforeEach(async () => {
    // All position USD tests need PERP_ALLOWED_MARKETS to pass first
    await insertPolicy({
      walletId,
      type: 'PERP_ALLOWED_MARKETS',
      rules: JSON.stringify({
        markets: [{ market: '0xDriftProgram' }],
      }),
    });
  });

  it('denies when perpSizeUsd exceeds maxPositionUsd', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_MAX_POSITION_USD',
      rules: JSON.stringify({ maxPositionUsd: 10000, warningPositionUsd: 8000 }),
    });

    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram', 5, 15000),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds max allowed');
  });

  it('allows when perpSizeUsd is within limits', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_MAX_POSITION_USD',
      rules: JSON.stringify({ maxPositionUsd: 10000, warningPositionUsd: 8000 }),
    });

    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram', 5, 5000),
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('returns DELAY tier when position USD exceeds warning but within max', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_MAX_POSITION_USD',
      rules: JSON.stringify({ maxPositionUsd: 10000, warningPositionUsd: 8000 }),
    });

    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram', 5, 9000),
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.reason).toContain('approaching limit');
  });

  it('passes through when perpSizeUsd is not provided', async () => {
    await insertPolicy({
      walletId,
      type: 'PERP_MAX_POSITION_USD',
      rules: JSON.stringify({ maxPositionUsd: 10000 }),
    });

    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram', 5), // no perpSizeUsd
    );
    expect(result.allowed).toBe(true);
  });

  it('passes through when no position USD policy configured', async () => {
    const result = await engine.evaluate(
      walletId,
      perpTx('drift_open_position', '0xDriftProgram', 5, 99999),
    );
    expect(result.allowed).toBe(true);
  });
});
