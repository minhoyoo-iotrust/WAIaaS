/**
 * Tests for cumulative USD spending limit evaluation in DatabasePolicyEngine.
 *
 * Verifies:
 * - daily_limit_usd / monthly_limit_usd APPROVAL escalation
 * - PENDING/QUEUED reserved_amount_usd inclusion in cumulative aggregation
 * - CANCELLED/EXPIRED transactions excluded from cumulative aggregation
 * - max(per_tx tier, cumulative tier) final tier selection
 * - 80% warning threshold (cumulativeWarning field)
 * - usdAmount undefined -> cumulative evaluation skipped
 * - approvalReason field (per_tx / cumulative_daily / cumulative_monthly)
 *
 * Uses in-memory SQLite + Drizzle (same pattern as database-policy-engine.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, policies } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';

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
    environment: 'testnet',
    defaultNetwork: 'devnet',
    publicKey: generateId(),
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

/** Insert a transaction with optional USD amounts and custom created_at. */
function insertTransaction(overrides: {
  walletId: string;
  status?: string;
  amount?: string;
  reservedAmount?: string | null;
  amountUsd?: number | null;
  reservedAmountUsd?: number | null;
  createdAt?: number; // epoch seconds
}): string {
  const id = generateId();
  const now = overrides.createdAt ?? Math.floor(Date.now() / 1000);
  conn.sqlite
    .prepare(
      `INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, reserved_amount, amount_usd, reserved_amount_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      overrides.walletId,
      'solana',
      'TRANSFER',
      overrides.amount ?? '0',
      'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      overrides.status ?? 'PENDING',
      overrides.reservedAmount ?? null,
      overrides.amountUsd ?? null,
      overrides.reservedAmountUsd ?? null,
      now,
    );
  return id;
}

function tx(amount: string) {
  return { type: 'TRANSFER', amount, toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', chain: 'solana' };
}

/** Standard SPENDING_LIMIT policy with cumulative limits. */
const CUMULATIVE_POLICY_RULES = JSON.stringify({
  instant_max: '1000000000',  // 1 SOL
  notify_max: '10000000000',  // 10 SOL
  delay_max: '50000000000',   // 50 SOL
  delay_seconds: 300,
  daily_limit_usd: 100,       // $100/day
  monthly_limit_usd: 1000,    // $1000/month
});

/** Policy with only daily limit. */
const DAILY_ONLY_RULES = JSON.stringify({
  instant_max: '1000000000',
  notify_max: '10000000000',
  delay_max: '50000000000',
  delay_seconds: 300,
  daily_limit_usd: 100,
});

/** Policy with only monthly limit. */
const MONTHLY_ONLY_RULES = JSON.stringify({
  instant_max: '1000000000',
  notify_max: '10000000000',
  delay_max: '50000000000',
  delay_seconds: 300,
  monthly_limit_usd: 1000,
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  engine = new DatabasePolicyEngine(conn.db, conn.sqlite);
  walletId = await insertTestWallet();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Cumulative USD spending limit tests
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - Cumulative USD Spending Limits', () => {
  it('a) daily_limit_usd 설정, 누적 미초과 -> 건별 tier 유지', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: DAILY_ONLY_RULES,
      priority: 10,
    });

    // Insert a confirmed tx with $30 from 1 hour ago
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    insertTransaction({
      walletId,
      status: 'CONFIRMED',
      amount: '500000000',
      amountUsd: 30,
      createdAt: oneHourAgo,
    });

    // Current tx: $20 -> total $50 < $100 daily limit
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId, 20);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // native 0.5 SOL < 1 SOL instant_max
    expect(result.approvalReason).toBeUndefined();
  });

  it('b) daily_limit_usd 설정, 누적 초과 -> APPROVAL 격상 + approvalReason === cumulative_daily', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: DAILY_ONLY_RULES,
      priority: 10,
    });

    // Insert confirmed tx with $80 from 2 hours ago
    const twoHoursAgo = Math.floor(Date.now() / 1000) - 7200;
    insertTransaction({
      walletId,
      status: 'CONFIRMED',
      amount: '500000000',
      amountUsd: 80,
      createdAt: twoHoursAgo,
    });

    // Current tx: $25 -> total $105 > $100 daily limit
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId, 25);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
    expect(result.approvalReason).toBe('cumulative_daily');
  });

  it('c) monthly_limit_usd 설정, 누적 초과 -> APPROVAL 격상 + approvalReason === cumulative_monthly', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: MONTHLY_ONLY_RULES,
      priority: 10,
    });

    // Insert confirmed tx with $900 from 10 days ago
    const tenDaysAgo = Math.floor(Date.now() / 1000) - 864000;
    insertTransaction({
      walletId,
      status: 'CONFIRMED',
      amount: '500000000',
      amountUsd: 900,
      createdAt: tenDaysAgo,
    });

    // Current tx: $150 -> total $1050 > $1000 monthly limit
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId, 150);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
    expect(result.approvalReason).toBe('cumulative_monthly');
  });

  it('d) PENDING 트랜잭션의 reserved_amount_usd가 누적에 포함됨 (이중 지출 방지)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: DAILY_ONLY_RULES,
      priority: 10,
    });

    // Insert a PENDING tx with $70 reserved (no amount_usd, just reserved_amount_usd)
    insertTransaction({
      walletId,
      status: 'PENDING',
      amount: '500000000',
      reservedAmount: '500000000',
      reservedAmountUsd: 70,
    });

    // Current tx: $35 -> total $70 + $35 = $105 > $100 daily limit
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId, 35);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
    expect(result.approvalReason).toBe('cumulative_daily');
  });

  it('e) CANCELLED/EXPIRED 트랜잭션은 누적에 미포함 (reserved_amount_usd === NULL)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: DAILY_ONLY_RULES,
      priority: 10,
    });

    // Insert CANCELLED tx with amount_usd = 80 but reserved_amount_usd = NULL
    // (approval-workflow clears reserved_amount_usd on cancel)
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    insertTransaction({
      walletId,
      status: 'CANCELLED',
      amount: '500000000',
      amountUsd: 80,
      reservedAmountUsd: null,
      createdAt: oneHourAgo,
    });

    // Insert EXPIRED tx similarly
    insertTransaction({
      walletId,
      status: 'EXPIRED',
      amount: '500000000',
      amountUsd: 80,
      reservedAmountUsd: null,
      createdAt: oneHourAgo,
    });

    // Current tx: $50 -> only this tx counts, $50 < $100 daily limit
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId, 50);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
    expect(result.approvalReason).toBeUndefined();
  });

  it('f) 건별 DELAY + 누적 APPROVAL -> 최종 APPROVAL (max tier)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: CUMULATIVE_POLICY_RULES,
      priority: 10,
    });

    // Insert confirmed tx with $80 from 1 hour ago
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    insertTransaction({
      walletId,
      status: 'CONFIRMED',
      amount: '500000000',
      amountUsd: 80,
      createdAt: oneHourAgo,
    });

    // Current tx: 30 SOL (native DELAY: 10B < 30B <= 50B), $25 -> cumulative $105 > $100 daily
    // Per-tx tier: DELAY, Cumulative tier: APPROVAL -> max = APPROVAL
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '30000000000' });
    const result = engine.evaluateAndReserve(walletId, tx('30000000000'), txId, 25);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
    expect(result.approvalReason).toBe('cumulative_daily');
    // delaySeconds should NOT be set since final tier is APPROVAL, not DELAY
    expect(result.delaySeconds).toBeUndefined();
  });

  it('g) daily 80% 도달 -> cumulativeWarning 필드 설정 (한도 미초과)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: DAILY_ONLY_RULES,
      priority: 10,
    });

    // Insert confirmed tx with $70 from 1 hour ago
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    insertTransaction({
      walletId,
      status: 'CONFIRMED',
      amount: '500000000',
      amountUsd: 70,
      createdAt: oneHourAgo,
    });

    // Current tx: $15 -> total $85 = 85% of $100 daily limit (>= 80%, not exceeded)
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId, 15);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
    expect(result.approvalReason).toBeUndefined();
    expect(result.cumulativeWarning).toBeDefined();
    expect(result.cumulativeWarning!.type).toBe('daily');
    expect(result.cumulativeWarning!.spent).toBe(85);
    expect(result.cumulativeWarning!.limit).toBe(100);
    expect(result.cumulativeWarning!.ratio).toBeCloseTo(0.85, 1);
  });

  it('h) usdAmount undefined (오라클 장애) -> 누적 평가 스킵, 건별만 수행', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: CUMULATIVE_POLICY_RULES,
      priority: 10,
    });

    // Insert lots of confirmed USD to exceed limits
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    insertTransaction({
      walletId,
      status: 'CONFIRMED',
      amount: '500000000',
      amountUsd: 500,
      createdAt: oneHourAgo,
    });

    // Current tx: no usdAmount -> cumulative evaluation skipped
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // native 0.5 SOL < 1 SOL instant_max
    expect(result.approvalReason).toBeUndefined();
    expect(result.cumulativeWarning).toBeUndefined();
  });

  it('i) 24시간 윈도우 밖 트랜잭션은 daily 누적에 미포함', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: DAILY_ONLY_RULES,
      priority: 10,
    });

    // Insert confirmed tx with $90 from 25 hours ago (outside 24h window)
    const twentyFiveHoursAgo = Math.floor(Date.now() / 1000) - 90000;
    insertTransaction({
      walletId,
      status: 'CONFIRMED',
      amount: '500000000',
      amountUsd: 90,
      createdAt: twentyFiveHoursAgo,
    });

    // Current tx: $50 -> only $50 in window < $100 daily limit
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId, 50);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
    expect(result.approvalReason).toBeUndefined();
  });

  it('j) 건별 per-tx APPROVAL 시 approvalReason === per_tx', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: CUMULATIVE_POLICY_RULES,
      priority: 10,
    });

    // Current tx: 100 SOL (native APPROVAL: > 50 SOL delay_max), $5 -> cumulative $5 < $100
    // Per-tx: APPROVAL, Cumulative: INSTANT -> max = APPROVAL, reason = per_tx
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '100000000000' });
    const result = engine.evaluateAndReserve(walletId, tx('100000000000'), txId, 5);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
    expect(result.approvalReason).toBe('per_tx');
  });

  it('k) monthly 80% 경고 (daily 미설정)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: MONTHLY_ONLY_RULES,
      priority: 10,
    });

    // Insert confirmed tx with $750 from 10 days ago
    const tenDaysAgo = Math.floor(Date.now() / 1000) - 864000;
    insertTransaction({
      walletId,
      status: 'CONFIRMED',
      amount: '500000000',
      amountUsd: 750,
      createdAt: tenDaysAgo,
    });

    // Current tx: $100 -> total $850 = 85% of $1000 monthly limit
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId, 100);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
    expect(result.cumulativeWarning).toBeDefined();
    expect(result.cumulativeWarning!.type).toBe('monthly');
    expect(result.cumulativeWarning!.spent).toBe(850);
    expect(result.cumulativeWarning!.limit).toBe(1000);
    expect(result.cumulativeWarning!.ratio).toBeCloseTo(0.85, 1);
  });

  it('l) QUEUED 트랜잭션의 reserved_amount_usd가 누적에 포함됨', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: DAILY_ONLY_RULES,
      priority: 10,
    });

    // Insert a QUEUED tx (awaiting owner approval) with $60 reserved
    insertTransaction({
      walletId,
      status: 'QUEUED',
      amount: '500000000',
      reservedAmount: '500000000',
      reservedAmountUsd: 60,
    });

    // Current tx: $45 -> total $60 + $45 = $105 > $100 daily limit
    const txId = insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engine.evaluateAndReserve(walletId, tx('500000000'), txId, 45);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
    expect(result.approvalReason).toBe('cumulative_daily');
  });
});
