/**
 * TDD tests for ALLOWED_NETWORKS policy evaluation + 4-level resolveOverrides + evaluateAndReserve network filter.
 *
 * Tests:
 * - Group 1: evaluateAllowedNetworks (5 tests)
 * - Group 2: resolveOverrides 4-level override priority (6 tests)
 * - Group 3: evaluateAndReserve network SQL filter (3 tests)
 * - Group 4: evaluateBatch network (2 tests)
 *
 * Uses in-memory SQLite + Drizzle + pushSchema() (same pattern as database-policy-engine.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let engine: DatabasePolicyEngine;
let engineWithSqlite: DatabasePolicyEngine;
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
    publicKey: `0x${id.replace(/-/g, '').slice(0, 40)}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Insert a policy using raw SQL to support the `network` column.
 * The existing insertPolicy() helper doesn't pass `network`, so we use raw SQL.
 */
function insertPolicyRaw(overrides: {
  walletId?: string | null;
  type: string;
  rules: string;
  priority?: number;
  enabled?: boolean;
  network?: string | null;
}): string {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite
    .prepare(
      `INSERT INTO policies (id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      overrides.walletId ?? null,
      overrides.type,
      overrides.rules,
      overrides.priority ?? 0,
      overrides.enabled !== false ? 1 : 0,
      overrides.network ?? null,
      now,
      now,
    );
  return id;
}

function insertTransaction(overrides: {
  walletId: string;
  status?: string;
  amount?: string;
  reservedAmount?: string | null;
}): string {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite
    .prepare(
      `INSERT INTO transactions (id, wallet_id, chain, type, amount, to_address, status, reserved_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      overrides.walletId,
      'ethereum',
      'TRANSFER',
      overrides.amount ?? '0',
      '0x1234567890123456789012345678901234567890',
      overrides.status ?? 'PENDING',
      overrides.reservedAmount ?? null,
      now,
    );
  return id;
}

/** TRANSFER transaction with optional network */
function tx(
  amount: string,
  toAddress = '0x1234567890123456789012345678901234567890',
  network?: string,
) {
  return { type: 'TRANSFER', amount, toAddress, chain: 'ethereum', network };
}

/** TOKEN_TRANSFER transaction with optional network */
function tokenTx(
  amount: string,
  tokenAddress: string,
  toAddress = '0x1234567890123456789012345678901234567890',
  network?: string,
) {
  return { type: 'TOKEN_TRANSFER', amount, toAddress, chain: 'ethereum', tokenAddress, network };
}

/** CONTRACT_CALL transaction with optional network */
function contractCallTx(opts: {
  contractAddress: string;
  amount?: string;
  selector?: string;
  network?: string;
}) {
  return {
    type: 'CONTRACT_CALL',
    amount: opts.amount ?? '0',
    toAddress: opts.contractAddress,
    chain: 'ethereum',
    contractAddress: opts.contractAddress,
    selector: opts.selector,
    network: opts.network,
  };
}

/** APPROVE transaction with optional network */
function approveTx(opts: {
  spenderAddress: string;
  approveAmount?: string;
  amount?: string;
  network?: string;
}) {
  return {
    type: 'APPROVE',
    amount: opts.amount ?? '0',
    toAddress: opts.spenderAddress,
    chain: 'ethereum',
    spenderAddress: opts.spenderAddress,
    approveAmount: opts.approveAmount ?? '1000000',
    network: opts.network,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  engine = new DatabasePolicyEngine(conn.db);
  engineWithSqlite = new DatabasePolicyEngine(conn.db, conn.sqlite);
  walletId = await insertTestWallet();
});

afterEach(() => {
  conn.sqlite.close();
});

// ===========================================================================
// GROUP 1: evaluateAllowedNetworks (5 tests)
// ===========================================================================

describe('DatabasePolicyEngine - ALLOWED_NETWORKS evaluation', () => {
  it('should allow any network when no ALLOWED_NETWORKS policy exists (permissive default)', async () => {
    // Only a SPENDING_LIMIT policy, no ALLOWED_NETWORKS
    insertPolicyRaw({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000000000000000000',
        notify_max: '50000000000000000000',
        delay_max: '100000000000000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(walletId, tx('1000000', undefined, 'polygon-amoy'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should allow network when it is in the ALLOWED_NETWORKS list', async () => {
    insertPolicyRaw({
      type: 'ALLOWED_NETWORKS',
      rules: JSON.stringify({
        networks: [
          { network: 'ethereum-sepolia', name: 'Ethereum Sepolia' },
          { network: 'polygon-amoy', name: 'Polygon Amoy' },
        ],
      }),
      priority: 10,
    });

    const result = await engine.evaluate(walletId, tx('1000000', undefined, 'polygon-amoy'));

    expect(result.allowed).toBe(true);
  });

  it('should deny network when it is NOT in the ALLOWED_NETWORKS list', async () => {
    insertPolicyRaw({
      type: 'ALLOWED_NETWORKS',
      rules: JSON.stringify({
        networks: [{ network: 'ethereum-sepolia' }],
      }),
      priority: 10,
    });

    const result = await engine.evaluate(walletId, tx('1000000', undefined, 'polygon-amoy'));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('not in allowed networks');
  });

  it('should skip ALLOWED_NETWORKS check when network is undefined', async () => {
    insertPolicyRaw({
      type: 'ALLOWED_NETWORKS',
      rules: JSON.stringify({
        networks: [{ network: 'ethereum-sepolia' }],
      }),
      priority: 10,
    });

    // No network provided -> skip check, should pass
    const result = await engine.evaluate(walletId, tx('1000000'));

    expect(result.allowed).toBe(true);
  });

  it('should evaluate ALLOWED_NETWORKS for all 5 transaction types', async () => {
    // ALLOWED_NETWORKS only allows ethereum-sepolia
    insertPolicyRaw({
      type: 'ALLOWED_NETWORKS',
      rules: JSON.stringify({
        networks: [{ network: 'ethereum-sepolia' }],
      }),
      priority: 10,
    });

    // Also add required type-specific policies so they don't deny first
    insertPolicyRaw({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: '0xTokenAddr' }] }),
      priority: 5,
    });
    insertPolicyRaw({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: '0xContractAddr' }] }),
      priority: 5,
    });
    insertPolicyRaw({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: '0xSpenderAddr' }] }),
      priority: 5,
    });

    // All 5 types on a blocked network (polygon-amoy) should be denied
    const transferResult = await engine.evaluate(
      walletId,
      tx('1000000', undefined, 'polygon-amoy'),
    );
    expect(transferResult.allowed).toBe(false);
    expect(transferResult.reason).toContain('not in allowed networks');

    const tokenResult = await engine.evaluate(
      walletId,
      tokenTx('1000000', '0xTokenAddr', undefined, 'polygon-amoy'),
    );
    expect(tokenResult.allowed).toBe(false);
    expect(tokenResult.reason).toContain('not in allowed networks');

    const contractResult = await engine.evaluate(
      walletId,
      contractCallTx({ contractAddress: '0xContractAddr', network: 'polygon-amoy' }),
    );
    expect(contractResult.allowed).toBe(false);
    expect(contractResult.reason).toContain('not in allowed networks');

    const approveResult = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: '0xSpenderAddr', network: 'polygon-amoy' }),
    );
    expect(approveResult.allowed).toBe(false);
    expect(approveResult.reason).toContain('not in allowed networks');
  });
});

// ===========================================================================
// GROUP 2: resolveOverrides 4-level priority (6 tests)
// ===========================================================================

describe('DatabasePolicyEngine - resolveOverrides 4-level priority', () => {
  // Use SPENDING_LIMIT with different instant_max values to identify which policy was applied.
  // Tier boundary: <=1000 INSTANT, <=5000 NOTIFY, <=10000 DELAY.
  // We insert a test amount and verify the resulting tier to determine which policy was selected.

  const makeSpendingRules = (instantMax: string) =>
    JSON.stringify({
      instant_max: instantMax,
      notify_max: '999999999999',
      delay_max: '9999999999999',
      delay_seconds: 300,
    });

  it('should resolve backward-compatible when all policies have network=NULL (2-level compat)', async () => {
    // Global + null (P1): instant_max = 100 (amount 500 -> NOTIFY)
    insertPolicyRaw({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('100'),
      priority: 10,
      network: null,
    });

    // Wallet + null (P2): instant_max = 1000 (amount 500 -> INSTANT)
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('1000'),
      priority: 10,
      network: null,
    });

    // Amount 500: with wallet+null applied (instant_max=1000) -> INSTANT
    const result = await engine.evaluate(walletId, tx('500', undefined, 'polygon-amoy'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should pick wallet+network (P4) over wallet+null (P2)', async () => {
    // Wallet + null (P2): instant_max = 100 (amount 500 -> NOTIFY)
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('100'),
      priority: 10,
      network: null,
    });

    // Wallet + network (P4): instant_max = 1000 (amount 500 -> INSTANT)
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('1000'),
      priority: 10,
      network: 'polygon-amoy',
    });

    const result = await engine.evaluate(walletId, tx('500', undefined, 'polygon-amoy'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // P4 applied (instant_max=1000)
  });

  it('should pick global+network (P3) over global+null (P1)', async () => {
    // Global + null (P1): instant_max = 100 (amount 500 -> NOTIFY)
    insertPolicyRaw({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('100'),
      priority: 10,
      network: null,
    });

    // Global + network (P3): instant_max = 1000 (amount 500 -> INSTANT)
    insertPolicyRaw({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('1000'),
      priority: 10,
      network: 'polygon-amoy',
    });

    const result = await engine.evaluate(walletId, tx('500', undefined, 'polygon-amoy'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // P3 applied (instant_max=1000)
  });

  it('should pick wallet+null (P2) over global+network (P3)', async () => {
    // Global + network (P3): instant_max = 100 (amount 500 -> NOTIFY)
    insertPolicyRaw({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('100'),
      priority: 10,
      network: 'polygon-amoy',
    });

    // Wallet + null (P2): instant_max = 1000 (amount 500 -> INSTANT)
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('1000'),
      priority: 10,
      network: null,
    });

    const result = await engine.evaluate(walletId, tx('500', undefined, 'polygon-amoy'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // P2 applied (2nd priority > 3rd priority)
  });

  it('should pick wallet+network (1st) when all 4 levels exist', async () => {
    // P1: global+null, instant_max=10
    insertPolicyRaw({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('10'),
      priority: 10,
      network: null,
    });

    // P3: global+network, instant_max=100
    insertPolicyRaw({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('100'),
      priority: 10,
      network: 'polygon-amoy',
    });

    // P2: wallet+null, instant_max=500
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('500'),
      priority: 10,
      network: null,
    });

    // P4: wallet+network, instant_max=2000
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('2000'),
      priority: 10,
      network: 'polygon-amoy',
    });

    // Amount 1500: only P4 (instant_max=2000) yields INSTANT
    const result = await engine.evaluate(walletId, tx('1500', undefined, 'polygon-amoy'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // P4 applied (1st priority)
  });

  it('should fallback to wallet+null (2nd) when wallet+network (1st) is absent', async () => {
    // P1: global+null, instant_max=10
    insertPolicyRaw({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('10'),
      priority: 10,
      network: null,
    });

    // P3: global+network, instant_max=100
    insertPolicyRaw({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('100'),
      priority: 10,
      network: 'polygon-amoy',
    });

    // P2: wallet+null, instant_max=1000
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: makeSpendingRules('1000'),
      priority: 10,
      network: null,
    });

    // No P4 (wallet+network)

    // Amount 500: P2 (instant_max=1000) -> INSTANT; P3 (instant_max=100) -> NOTIFY
    const result = await engine.evaluate(walletId, tx('500', undefined, 'polygon-amoy'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // P2 applied (2nd priority fallback)
  });
});

// ===========================================================================
// GROUP 3: evaluateAndReserve network SQL filter (3 tests)
// ===========================================================================

describe('DatabasePolicyEngine - evaluateAndReserve network SQL', () => {
  it('should load both network-specific and NULL policies when network is provided', () => {
    // Wallet+network policy: instant_max=2000 (should win via 4-level override)
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '2000',
        notify_max: '999999999999',
        delay_max: '9999999999999',
        delay_seconds: 300,
      }),
      priority: 10,
      network: 'polygon-amoy',
    });

    // Wallet+null policy: instant_max=100 (lower, should be overridden)
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100',
        notify_max: '999999999999',
        delay_max: '9999999999999',
        delay_seconds: 300,
      }),
      priority: 10,
      network: null,
    });

    const txId = insertTransaction({ walletId, amount: '1500' });

    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('1500', undefined, 'polygon-amoy'),
      txId,
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // wallet+network (instant_max=2000) applied
  });

  it('should load only network=NULL policies when no network is provided (backward compat)', () => {
    // A policy for a specific network
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '99999999',
        notify_max: '999999999999',
        delay_max: '9999999999999',
        delay_seconds: 300,
      }),
      priority: 10,
      network: 'polygon-amoy',
    });

    // A global policy
    insertPolicyRaw({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100',
        notify_max: '999999999999',
        delay_max: '9999999999999',
        delay_seconds: 300,
      }),
      priority: 10,
      network: null,
    });

    const txId = insertTransaction({ walletId, amount: '500' });

    // No network -> should only consider NULL policies -> instant_max=100 -> 500 > 100 -> NOTIFY
    const result = engineWithSqlite.evaluateAndReserve(walletId, tx('500'), txId);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('should not set reserved_amount when ALLOWED_NETWORKS denies the transaction', () => {
    insertPolicyRaw({
      type: 'ALLOWED_NETWORKS',
      rules: JSON.stringify({
        networks: [{ network: 'ethereum-sepolia' }],
      }),
      priority: 20,
    });

    insertPolicyRaw({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '99999999',
        notify_max: '999999999999',
        delay_max: '9999999999999',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const txId = insertTransaction({ walletId, amount: '1000' });

    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('1000', undefined, 'polygon-amoy'),
      txId,
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in allowed networks');

    // Verify reserved_amount was NOT set
    const row = conn.sqlite
      .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { reserved_amount: string | null };
    expect(row.reserved_amount).toBeNull();
  });
});

// ===========================================================================
// GROUP 4: evaluateBatch network (2 tests)
// ===========================================================================

describe('DatabasePolicyEngine - evaluateBatch network', () => {
  it('should deny entire batch when ALLOWED_NETWORKS blocks the network', async () => {
    // Only allow ethereum-sepolia
    insertPolicyRaw({
      type: 'ALLOWED_NETWORKS',
      rules: JSON.stringify({
        networks: [{ network: 'ethereum-sepolia' }],
      }),
      priority: 20,
    });

    const instructions = [
      tx('1000', undefined, 'polygon-amoy'),
      tx('2000', undefined, 'polygon-amoy'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not in allowed networks');
  });

  it('should allow batch and evaluate normally when network is permitted', async () => {
    // Allow polygon-amoy
    insertPolicyRaw({
      type: 'ALLOWED_NETWORKS',
      rules: JSON.stringify({
        networks: [{ network: 'polygon-amoy' }],
      }),
      priority: 20,
    });

    insertPolicyRaw({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000',
        notify_max: '999999999999',
        delay_max: '9999999999999',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const instructions = [
      tx('3000', undefined, 'polygon-amoy'),
      tx('2000', undefined, 'polygon-amoy'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);

    expect(result.allowed).toBe(true);
    // Total amount = 5000 (3000 + 2000), within instant_max=10000
    expect(result.tier).toBe('INSTANT');
  });
});
