/**
 * Tests for ACTION_CATEGORY_LIMIT policy evaluation.
 *
 * Covers:
 * 1. actionCategory absent -> policy not evaluated
 * 2. notionalUsd absent -> policy not evaluated
 * 3. per_action_limit_usd within limit -> passes
 * 4. per_action_limit_usd exceeded -> tier_on_exceed (DELAY)
 * 5. daily_limit_usd cumulative within limit -> passes
 * 6. daily_limit_usd cumulative exceeded -> tier_on_exceed
 * 7. monthly_limit_usd cumulative exceeded -> tier_on_exceed
 * 8. tier_on_exceed custom value (APPROVAL)
 * 9. trade category policy does not apply to withdraw category
 * 10. SPENDING_LIMIT + ACTION_CATEGORY_LIMIT coexistence
 *
 * Plan 389-02 Task 2
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, policies, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let walletId: string;

async function insertTestWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'testnet',
    publicKey: '11111111111111111111111111111112',
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
}): Promise<void> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id,
    walletId: overrides.walletId ?? null,
    type: overrides.type,
    rules: overrides.rules,
    priority: overrides.priority ?? 0,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function insertTransaction(overrides: {
  walletId: string;
  actionKind: string;
  metadata: string;
  createdAt: Date;
  status?: string;
}): Promise<void> {
  const id = generateId();
  await conn.db.insert(transactions).values({
    id,
    walletId: overrides.walletId,
    chain: 'solana',
    type: 'TRANSFER',
    amount: '0',
    toAddress: '0x1234',
    status: overrides.status ?? 'CONFIRMED',
    createdAt: overrides.createdAt,
    actionKind: overrides.actionKind,
    metadata: overrides.metadata,
  });
}

function createSettings(): SettingsService {
  const config = DaemonConfigSchema.parse({});
  return new SettingsService({ db: conn.db, config, masterPassword: 'test-pw' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ACTION_CATEGORY_LIMIT policy', () => {
  beforeEach(async () => {
    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
    walletId = await insertTestWallet();
  });

  afterEach(() => {
    conn.sqlite.close();
  });

  it('actionCategory absent -> ACTION_CATEGORY_LIMIT not evaluated, passes', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', per_action_limit_usd: 1000 }),
    });

    // No actionCategory in transaction
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      notionalUsd: 500,
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('notionalUsd absent -> ACTION_CATEGORY_LIMIT not evaluated, passes', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', per_action_limit_usd: 1000 }),
    });

    // No notionalUsd in transaction
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'trade',
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('per_action_limit_usd within limit -> passes', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', per_action_limit_usd: 1000 }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'trade',
      notionalUsd: 500,
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('per_action_limit_usd exceeded -> tier_on_exceed (default DELAY)', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', per_action_limit_usd: 1000 }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'trade',
      notionalUsd: 1500,
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.reason).toContain('ACTION_CATEGORY_LIMIT');
    expect(result.reason).toContain('per-action');
  });

  it('daily_limit_usd cumulative within limit -> passes', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', daily_limit_usd: 5000 }),
    });

    // Insert past transaction today (cumulative 3000)
    const today = new Date();
    today.setUTCHours(2, 0, 0, 0); // Earlier today
    await insertTransaction({
      walletId,
      actionKind: 'signedData',
      metadata: JSON.stringify({ notionalUsd: 3000, actionCategory: 'trade' }),
      createdAt: today,
    });

    // New transaction: 1500 (cumulative = 3000 + 1500 = 4500 < 5000)
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'trade',
      notionalUsd: 1500,
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('daily_limit_usd cumulative exceeded -> tier_on_exceed', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', daily_limit_usd: 5000 }),
    });

    // Insert past transaction today (cumulative 3000)
    const today = new Date();
    today.setUTCHours(2, 0, 0, 0);
    await insertTransaction({
      walletId,
      actionKind: 'signedData',
      metadata: JSON.stringify({ notionalUsd: 3000, actionCategory: 'trade' }),
      createdAt: today,
    });

    // New transaction: 2500 (cumulative = 3000 + 2500 = 5500 > 5000)
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'trade',
      notionalUsd: 2500,
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.reason).toContain('ACTION_CATEGORY_LIMIT');
    expect(result.reason).toContain('daily');
  });

  it('monthly_limit_usd cumulative exceeded -> tier_on_exceed', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', monthly_limit_usd: 50000 }),
    });

    // Insert past transaction this month (cumulative 45000)
    const thisMonth = new Date();
    thisMonth.setUTCDate(2);
    thisMonth.setUTCHours(12, 0, 0, 0);
    await insertTransaction({
      walletId,
      actionKind: 'signedHttp',
      metadata: JSON.stringify({ notionalUsd: 45000, actionCategory: 'trade' }),
      createdAt: thisMonth,
    });

    // New transaction: 6000 (cumulative = 45000 + 6000 = 51000 > 50000)
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'trade',
      notionalUsd: 6000,
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.reason).toContain('ACTION_CATEGORY_LIMIT');
    expect(result.reason).toContain('monthly');
  });

  it('tier_on_exceed=APPROVAL custom value', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'withdraw', per_action_limit_usd: 500, tier_on_exceed: 'APPROVAL' }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'withdraw',
      notionalUsd: 1000,
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('trade category policy does not apply to withdraw category', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', per_action_limit_usd: 100 }),
    });

    // Transaction is withdraw, not trade -> policy should not match
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'withdraw',
      notionalUsd: 500,
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('SPENDING_LIMIT + ACTION_CATEGORY_LIMIT coexist independently', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', per_action_limit_usd: 1000, tier_on_exceed: 'NOTIFY' }),
    });
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max_usd: 100, notify_max_usd: 500, delay_max_usd: 10000, delay_seconds: 60 }),
    });

    // ACTION_CATEGORY_LIMIT: 500 < 1000, passes
    // SPENDING_LIMIT: evaluates based on raw amount (0 -> INSTANT)
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'trade',
      notionalUsd: 500,
    });
    expect(result.allowed).toBe(true);
  });

  it('FAILED transactions excluded from cumulative daily query', async () => {
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'ACTION_CATEGORY_LIMIT',
      rules: JSON.stringify({ category: 'trade', daily_limit_usd: 5000 }),
    });

    // Insert FAILED transaction (should be excluded)
    const today = new Date();
    today.setUTCHours(2, 0, 0, 0);
    await insertTransaction({
      walletId,
      actionKind: 'signedData',
      metadata: JSON.stringify({ notionalUsd: 4000, actionCategory: 'trade' }),
      createdAt: today,
      status: 'FAILED',
    });

    // New transaction: 4500 (no cumulative from FAILED, so 0 + 4500 = 4500 < 5000)
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'solana',
      actionCategory: 'trade',
      notionalUsd: 4500,
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});
