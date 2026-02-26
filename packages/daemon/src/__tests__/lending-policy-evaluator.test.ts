/**
 * Unit tests for DatabasePolicyEngine lending policy evaluation.
 *
 * Tests LENDING_ASSET_WHITELIST (Step 4h), LENDING_LTV_LIMIT (Step 4h-b),
 * and non-spending classification (Step 5) for lending actions.
 *
 * Uses in-memory SQLite + Drizzle (same pattern as database-policy-engine.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, policies, defiPositions } from '../infrastructure/database/schema.js';
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
    chain: 'ethereum',
    environment: 'testnet',
    defaultNetwork: 'ethereum-sepolia',
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

async function insertPosition(
  targetWalletId: string,
  positionType: 'SUPPLY' | 'BORROW',
  amountUsd: number,
): Promise<void> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(defiPositions).values({
    id,
    walletId: targetWalletId,
    category: 'LENDING',
    provider: 'aave-v3',
    chain: 'ethereum',
    network: 'ethereum-sepolia',
    assetId: `eip155:11155111/erc20:0x${id.replace(/-/g, '').slice(0, 40)}`,
    amount: '1000000',
    amountUsd,
    metadata: JSON.stringify({ positionType }),
    status: 'ACTIVE',
    openedAt: now,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

function lendingTx(actionName: string, contractAddress = '0xAavePoolAddress') {
  return {
    type: 'CONTRACT_CALL',
    amount: '0',
    toAddress: contractAddress,
    chain: 'ethereum',
    contractAddress,
    actionProvider: 'aave-v3',
    actionName,
  };
}

/**
 * Insert a transaction row for evaluateAndReserve tests.
 */
function insertTransactionRow(txId: string, targetWalletId: string): void {
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite.prepare(
    `INSERT INTO transactions (id, wallet_id, type, status, chain, network, to_address, amount, created_at)
     VALUES (?, ?, 'CONTRACT_CALL', 'PENDING', 'ethereum', 'ethereum-sepolia', '0xAavePoolAddress', '0', ?)`,
  ).run(txId, targetWalletId, now);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  // Create SettingsService with default_deny_contracts=false so CONTRACT_WHITELIST
  // doesn't block lending CONTRACT_CALL transactions (lending actions use provider-trust
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
// LENDING_ASSET_WHITELIST - Step 4h
// ---------------------------------------------------------------------------

describe('LENDING_ASSET_WHITELIST - Step 4h', () => {
  it('denies lending action when no whitelist configured (default-deny)', async () => {
    // Need at least one policy so we don't hit "no policies -> INSTANT passthrough" (Step 2)
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max: '999999999', notify_max: '999999999', delay_max: '999999999', delay_seconds: 300 }),
    });

    const result = await engine.evaluate(walletId, lendingTx('supply'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No LENDING_ASSET_WHITELIST policy configured');
  });

  it('allows lending action when asset is whitelisted', async () => {
    await insertPolicy({
      walletId,
      type: 'LENDING_ASSET_WHITELIST',
      rules: JSON.stringify({
        assets: [{ address: '0xAavePoolAddress', symbol: 'AAVE' }],
      }),
    });

    const result = await engine.evaluate(walletId, lendingTx('supply', '0xAavePoolAddress'));
    expect(result.allowed).toBe(true);
  });

  it('allows lending action with case-insensitive address matching', async () => {
    await insertPolicy({
      walletId,
      type: 'LENDING_ASSET_WHITELIST',
      rules: JSON.stringify({
        assets: [{ address: '0xaavepooladdress' }],
      }),
    });

    const result = await engine.evaluate(walletId, lendingTx('supply', '0xAavePoolAddress'));
    expect(result.allowed).toBe(true);
  });

  it('denies lending action when asset is NOT whitelisted', async () => {
    await insertPolicy({
      walletId,
      type: 'LENDING_ASSET_WHITELIST',
      rules: JSON.stringify({
        assets: [{ address: '0xOtherAddress' }],
      }),
    });

    const result = await engine.evaluate(walletId, lendingTx('supply', '0xAavePoolAddress'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in lending asset whitelist');
  });

  it('skips evaluation for non-lending actions (no actionName)', async () => {
    // Regular CONTRACT_CALL without actionName should not be affected by LENDING_ASSET_WHITELIST
    // Need at least one policy to avoid Step 2 passthrough
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max: '999999999', notify_max: '999999999', delay_max: '999999999', delay_seconds: 300 }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'CONTRACT_CALL',
      amount: '0',
      toAddress: '0xSomeContract',
      chain: 'ethereum',
      contractAddress: '0xSomeContract',
    });
    // Without actionName, LENDING_ASSET_WHITELIST is skipped (not a lending action)
    // Should pass through since default_deny_contracts=false
    expect(result.allowed).toBe(true);
  });

  it('applies to all lending actions (supply/borrow/repay/withdraw)', async () => {
    // Need a policy present so Step 2 doesn't passthrough
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max: '999999999', notify_max: '999999999', delay_max: '999999999', delay_seconds: 300 }),
    });

    // Without whitelist, all lending actions should be denied
    for (const action of ['supply', 'borrow', 'repay', 'withdraw']) {
      const result = await engine.evaluate(walletId, lendingTx(action));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('LENDING_ASSET_WHITELIST');
    }
  });
});

// ---------------------------------------------------------------------------
// LENDING_LTV_LIMIT - Step 4h-b
// ---------------------------------------------------------------------------

describe('LENDING_LTV_LIMIT - Step 4h-b', () => {
  beforeEach(async () => {
    // All LTV tests need LENDING_ASSET_WHITELIST to pass first
    await insertPolicy({
      walletId,
      type: 'LENDING_ASSET_WHITELIST',
      rules: JSON.stringify({
        assets: [{ address: '0xAavePoolAddress' }],
      }),
    });
  });

  it('denies borrow when current LTV exceeds maxLtv', async () => {
    // $10,000 collateral, $8,000 debt -> 80% LTV
    await insertPosition(walletId, 'SUPPLY', 10000);
    await insertPosition(walletId, 'BORROW', 8000);

    await insertPolicy({
      walletId,
      type: 'LENDING_LTV_LIMIT',
      rules: JSON.stringify({ maxLtv: 0.75, warningLtv: 0.70 }),
    });

    const result = await engine.evaluate(walletId, lendingTx('borrow'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceed max LTV');
    expect(result.reason).toContain('80.0%');
  });

  it('denies borrow when projected LTV (with usdAmount) would exceed maxLtv', async () => {
    // $10,000 collateral, $5,000 debt -> 50% LTV current
    await insertPosition(walletId, 'SUPPLY', 10000);
    await insertPosition(walletId, 'BORROW', 5000);

    await insertPolicy({
      walletId,
      type: 'LENDING_LTV_LIMIT',
      rules: JSON.stringify({ maxLtv: 0.75, warningLtv: 0.70 }),
    });

    // evaluateAndReserve passes usdAmount; projected LTV = (5000+3000)/10000 = 80%
    const txId = generateId();
    insertTransactionRow(txId, walletId);

    const result = engine.evaluateAndReserve(
      walletId,
      lendingTx('borrow'),
      txId,
      3000, // usdAmount = $3,000
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceed max LTV');
    expect(result.reason).toContain('80.0%');
  });

  it('allows borrow when projected LTV is within limits', async () => {
    // $10,000 collateral, $5,000 debt -> 50% LTV
    await insertPosition(walletId, 'SUPPLY', 10000);
    await insertPosition(walletId, 'BORROW', 5000);

    await insertPolicy({
      walletId,
      type: 'LENDING_LTV_LIMIT',
      rules: JSON.stringify({ maxLtv: 0.80, warningLtv: 0.70 }),
    });

    // projected LTV = (5000+1000)/10000 = 60% < warningLtv
    const txId = generateId();
    insertTransactionRow(txId, walletId);

    const result = engine.evaluateAndReserve(
      walletId,
      lendingTx('borrow'),
      txId,
      1000,
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('returns DELAY tier when projected LTV exceeds warningLtv but within maxLtv', async () => {
    // $10,000 collateral, $6,000 debt -> 60% LTV
    await insertPosition(walletId, 'SUPPLY', 10000);
    await insertPosition(walletId, 'BORROW', 6000);

    await insertPolicy({
      walletId,
      type: 'LENDING_LTV_LIMIT',
      rules: JSON.stringify({ maxLtv: 0.80, warningLtv: 0.70 }),
    });

    // projected LTV = (6000+1200)/10000 = 72% > warningLtv(70%) but < maxLtv(80%)
    const txId = generateId();
    insertTransactionRow(txId, walletId);

    const result = engine.evaluateAndReserve(
      walletId,
      lendingTx('borrow'),
      txId,
      1200,
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.reason).toContain('LTV approaching limit');
    expect(result.reason).toContain('72.0%');
  });

  it('only applies to borrow actions', async () => {
    await insertPosition(walletId, 'SUPPLY', 10000);
    await insertPosition(walletId, 'BORROW', 9000); // 90% LTV -- should deny borrow

    await insertPolicy({
      walletId,
      type: 'LENDING_LTV_LIMIT',
      rules: JSON.stringify({ maxLtv: 0.75, warningLtv: 0.70 }),
    });

    // supply should not be affected by LTV check
    const result = await engine.evaluate(walletId, lendingTx('supply'));
    expect(result.allowed).toBe(true);
  });

  it('passes through when no LTV policy configured', async () => {
    await insertPosition(walletId, 'SUPPLY', 10000);
    await insertPosition(walletId, 'BORROW', 9000);

    // No LENDING_LTV_LIMIT policy -- borrow should pass through
    const result = await engine.evaluate(walletId, lendingTx('borrow'));
    expect(result.allowed).toBe(true);
  });

  it('uses usdAmount=0 fallback when usdAmount not provided', async () => {
    // $10,000 collateral, $7,000 debt -> 70% current LTV
    await insertPosition(walletId, 'SUPPLY', 10000);
    await insertPosition(walletId, 'BORROW', 7000);

    await insertPolicy({
      walletId,
      type: 'LENDING_LTV_LIMIT',
      rules: JSON.stringify({ maxLtv: 0.80, warningLtv: 0.65 }),
    });

    // evaluate() does not pass usdAmount -> projected LTV = 70% (just current)
    // 70% > warningLtv(65%) -> DELAY
    const result = await engine.evaluate(walletId, lendingTx('borrow'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
  });

  it('denies borrow when no collateral but has debt (infinite LTV)', async () => {
    await insertPosition(walletId, 'BORROW', 1000); // No SUPPLY

    await insertPolicy({
      walletId,
      type: 'LENDING_LTV_LIMIT',
      rules: JSON.stringify({ maxLtv: 0.80, warningLtv: 0.70 }),
    });

    const result = await engine.evaluate(walletId, lendingTx('borrow'));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceed max LTV');
  });
});

// ---------------------------------------------------------------------------
// Non-spending classification - Step 5
// ---------------------------------------------------------------------------

describe('Non-spending classification - Step 5', () => {
  beforeEach(async () => {
    // Need LENDING_ASSET_WHITELIST so lending asset check passes before Step 5
    await insertPolicy({
      walletId,
      type: 'LENDING_ASSET_WHITELIST',
      rules: JSON.stringify({
        assets: [{ address: '0xAavePoolAddress' }],
      }),
    });

    // Insert a tight SPENDING_LIMIT policy
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100',
        notify_max: '1000',
        delay_max: '10000',
        delay_seconds: 300,
      }),
    });
  });

  it('supply skips SPENDING_LIMIT', async () => {
    const result = await engine.evaluate(walletId, {
      ...lendingTx('supply'),
      amount: '999999999', // Exceeds all spending limits
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('repay skips SPENDING_LIMIT', async () => {
    const result = await engine.evaluate(walletId, {
      ...lendingTx('repay'),
      amount: '999999999',
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('withdraw skips SPENDING_LIMIT', async () => {
    const result = await engine.evaluate(walletId, {
      ...lendingTx('withdraw'),
      amount: '999999999',
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('borrow is subject to SPENDING_LIMIT', async () => {
    const result = await engine.evaluate(walletId, {
      ...lendingTx('borrow'),
      amount: '999999999', // Exceeds delay_max -> should be APPROVAL
    });
    // borrow should hit SPENDING_LIMIT
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });
});
