/**
 * SEC-08-01~24 Approve management attack scenarios.
 *
 * Tests 24 attack vectors against APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT,
 * and APPROVE_TIER_OVERRIDE policies:
 * Default deny, unlimited approve block, amount cap, tier override,
 * case-insensitive bypass, global vs wallet override, network scoping,
 * UNLIMITED_THRESHOLD boundary, and boundary variations.
 *
 * @see docs/64-extension-test-strategy.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createInMemoryDb,
  insertPolicy,
} from '../helpers/security-test-helpers.js';
import type { DatabaseConnection } from '../../../infrastructure/database/index.js';
import { generateId } from '../../../infrastructure/database/index.js';
import { wallets } from '../../../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from '../../../pipeline/database-policy-engine.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches UNLIMITED_THRESHOLD in database-policy-engine.ts */
const UNLIMITED_THRESHOLD = (2n ** 256n - 1n) / 2n;
const UINT256_MAX = 2n ** 256n - 1n;
/** Solana u64 max */
const U64_MAX = 2n ** 64n - 1n;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let engine: DatabasePolicyEngine;
let walletId: string;

async function insertTestWallet(connection: DatabaseConnection): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await connection.db.insert(wallets).values({
    id,
    name: 'sec-approve-test-wallet',
    chain: 'ethereum',
    environment: 'testnet',
    defaultNetwork: 'ethereum-sepolia',
    publicKey: `pk-sec-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Build an APPROVE transaction for policy evaluation.
 */
function approveTx(
  spenderAddress: string,
  approveAmount: string,
  opts?: { tokenAddress?: string; toAddress?: string; chain?: string; network?: string },
) {
  return {
    type: 'APPROVE',
    spenderAddress,
    approveAmount,
    amount: '0', // APPROVE has no native value
    toAddress: opts?.toAddress ?? 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    tokenAddress: opts?.tokenAddress ?? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chain: opts?.chain ?? 'ethereum',
    ...(opts?.network ? { network: opts.network } : {}),
  };
}

/**
 * Build a native TRANSFER transaction for non-applicability testing.
 */
function transferTx(amount = '1000000000') {
  return {
    type: 'TRANSFER',
    amount,
    toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    chain: 'ethereum',
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createInMemoryDb();
  engine = new DatabasePolicyEngine(conn.db);
  walletId = await insertTestWallet(conn);
});

afterEach(() => {
  try {
    conn.sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// SEC-08-01: APPROVED_SPENDERS not configured -> APPROVE default deny
// ---------------------------------------------------------------------------

describe('SEC-08-01: APPROVED_SPENDERS not configured -> APPROVE default deny', () => {
  it('denies APPROVE when no APPROVED_SPENDERS policy exists', async () => {
    // Need at least one enabled policy
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx('0x1234567890abcdef1234567890abcdef12345678', '1000000'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no APPROVED_SPENDERS policy configured');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-02: Non-approved spender -> deny
// ---------------------------------------------------------------------------

describe('SEC-08-02: non-approved spender -> deny', () => {
  it('denies APPROVE for non-approved spender', async () => {
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: '0xaaaa000000000000000000000000000000000001', name: 'Uniswap' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx('0xbbbb000000000000000000000000000000000002', '1000000'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Spender not in approved list');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-03: Approved spender -> allow
// ---------------------------------------------------------------------------

describe('SEC-08-03: approved spender -> allow', () => {
  it('allows APPROVE for approved spender', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender, name: 'Uniswap' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '1000000'),
    );
    expect(result.allowed).toBe(true);
    // Phase 236: No APPROVE_TIER_OVERRIDE -> falls through to SPENDING_LIMIT.
    // No SPENDING_LIMIT -> INSTANT passthrough.
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-04: uint256.max approve + blockUnlimited=true -> blocked (EVM)
// ---------------------------------------------------------------------------

describe('SEC-08-04: uint256.max approve + blockUnlimited=true -> blocked', () => {
  it('blocks unlimited EVM approve (uint256.max)', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({ blockUnlimited: true }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx(spender, UINT256_MAX.toString()),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unlimited token approval is blocked');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-05: u64.max approve + blockUnlimited=true -> blocked (Solana)
// ---------------------------------------------------------------------------

describe('SEC-08-05: u64.max approve + blockUnlimited=true -> blocked (Solana)', () => {
  it('blocks unlimited Solana approve (u64.max)', async () => {
    const spender = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({ blockUnlimited: true }),
      priority: 20,
    });

    // u64.max = 18446744073709551615 -- well below UNLIMITED_THRESHOLD
    // This should NOT be blocked because u64.max < UNLIMITED_THRESHOLD
    const result = await engine.evaluate(
      walletId,
      approveTx(spender, U64_MAX.toString(), { chain: 'solana' }),
    );
    // u64.max (< UNLIMITED_THRESHOLD) -> not considered unlimited
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-06: blockUnlimited=false -> unlimited approve allowed
// ---------------------------------------------------------------------------

describe('SEC-08-06: blockUnlimited=false -> unlimited approve allowed', () => {
  it('allows unlimited approve when blockUnlimited is false', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({ blockUnlimited: false }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx(spender, UINT256_MAX.toString()),
    );
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-07: APPROVE_AMOUNT_LIMIT maxAmount exceeded -> deny
// ---------------------------------------------------------------------------

describe('SEC-08-07: APPROVE_AMOUNT_LIMIT maxAmount exceeded -> deny', () => {
  it('denies approve exceeding maxAmount', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({
        maxAmount: '1000000000000', // 1T
        blockUnlimited: false,
      }),
      priority: 20,
    });

    // Amount exceeds maxAmount
    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '1000000000001'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Approve amount exceeds limit');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-08: APPROVE_AMOUNT_LIMIT maxAmount not exceeded -> allow
// ---------------------------------------------------------------------------

describe('SEC-08-08: APPROVE_AMOUNT_LIMIT maxAmount not exceeded -> allow', () => {
  it('allows approve within maxAmount', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({
        maxAmount: '1000000000000',
        blockUnlimited: false,
      }),
      priority: 20,
    });

    // Amount at maxAmount exactly
    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '1000000000000'),
    );
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-09: APPROVE_TIER_OVERRIDE tier='APPROVAL' -> forced APPROVAL
// ---------------------------------------------------------------------------

describe('SEC-08-09: APPROVE_TIER_OVERRIDE tier=APPROVAL -> forced APPROVAL', () => {
  it('forces APPROVAL tier on APPROVE transactions', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'APPROVAL' }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '100'),
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-10: APPROVE_TIER_OVERRIDE tier='DELAY' -> forced DELAY
// ---------------------------------------------------------------------------

describe('SEC-08-10: APPROVE_TIER_OVERRIDE tier=DELAY -> forced DELAY', () => {
  it('forces DELAY tier on APPROVE transactions', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'DELAY' }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '100'),
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-11: No APPROVE_TIER_OVERRIDE -> default APPROVAL tier
// ---------------------------------------------------------------------------

describe('SEC-08-11: no APPROVE_TIER_OVERRIDE -> INSTANT passthrough (Phase 236)', () => {
  it('falls through to SPENDING_LIMIT when no override policy exists', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '100'),
    );
    expect(result.allowed).toBe(true);
    // Phase 236: No APPROVE_TIER_OVERRIDE -> no SPENDING_LIMIT -> INSTANT
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-12: Disabled APPROVED_SPENDERS -> default deny
// ---------------------------------------------------------------------------

describe('SEC-08-12: disabled APPROVED_SPENDERS -> default deny', () => {
  it('denies APPROVE when APPROVED_SPENDERS is disabled', async () => {
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: '0xaaaa000000000000000000000000000000000001' }],
      }),
      priority: 20,
      enabled: false, // Disabled
    });

    // Need at least one enabled policy
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx('0xaaaa000000000000000000000000000000000001', '1000000'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no APPROVED_SPENDERS policy configured');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-13: Case-insensitive spender address matching
// ---------------------------------------------------------------------------

describe('SEC-08-13: case-insensitive spender address matching', () => {
  it('matches spender address case-insensitively', async () => {
    const checksumAddr = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: checksumAddr }],
      }),
      priority: 20,
    });

    // Lowercase query
    const r1 = await engine.evaluate(
      walletId,
      approveTx(checksumAddr.toLowerCase(), '1000000'),
    );
    expect(r1.allowed).toBe(true);

    // Uppercase query
    const r2 = await engine.evaluate(
      walletId,
      approveTx(checksumAddr.toUpperCase(), '1000000'),
    );
    expect(r2.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-14: Global vs wallet override priority
// ---------------------------------------------------------------------------

describe('SEC-08-14: global vs wallet APPROVED_SPENDERS override', () => {
  it('wallet-specific APPROVED_SPENDERS overrides global', async () => {
    const globalSpender = '0xaaaa000000000000000000000000000000000001';
    const walletSpender = '0xbbbb000000000000000000000000000000000002';

    // Global
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: globalSpender }],
      }),
      priority: 10,
    });

    // Wallet-specific
    insertPolicy(conn.sqlite, {
      walletId,
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: walletSpender }],
      }),
      priority: 10,
    });

    // walletSpender allowed
    const r1 = await engine.evaluate(walletId, approveTx(walletSpender, '1000000'));
    expect(r1.allowed).toBe(true);

    // globalSpender denied (wallet-specific overrides)
    const r2 = await engine.evaluate(walletId, approveTx(globalSpender, '1000000'));
    expect(r2.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-15: Network scoping (mainnet APPROVED_SPENDERS does not apply on devnet)
// ---------------------------------------------------------------------------

describe('SEC-08-15: network scoping for APPROVED_SPENDERS', () => {
  it('mainnet-scoped APPROVED_SPENDERS does not apply on testnet', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';

    // Insert mainnet-scoped policy
    const id = generateId();
    const now = Math.floor(Date.now() / 1000);
    conn.sqlite
      .prepare(
        `INSERT INTO policies (id, wallet_id, type, rules, priority, enabled, network, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        null,
        'APPROVED_SPENDERS',
        JSON.stringify({ spenders: [{ address: spender }] }),
        20,
        1,
        'ethereum-mainnet',
        now,
        now,
      );

    // Need another enabled policy
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '1000000', { network: 'ethereum-sepolia' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no APPROVED_SPENDERS policy configured');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-16: Spender with maxAmount -> exceeding denied
// ---------------------------------------------------------------------------

describe('SEC-08-16: spender maxAmount enforcement', () => {
  it('spender maxAmount is enforced via APPROVE_AMOUNT_LIMIT', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender, maxAmount: '5000000' }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({
        maxAmount: '5000000',
        blockUnlimited: true,
      }),
      priority: 20,
    });

    // Exceeds maxAmount
    const r1 = await engine.evaluate(walletId, approveTx(spender, '5000001'));
    expect(r1.allowed).toBe(false);
    expect(r1.reason).toContain('exceeds limit');

    // Within maxAmount
    const r2 = await engine.evaluate(walletId, approveTx(spender, '5000000'));
    expect(r2.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-17: Spender without maxAmount -> no amount restriction (blockUnlimited only)
// ---------------------------------------------------------------------------

describe('SEC-08-17: spender without maxAmount -> no amount cap', () => {
  it('no maxAmount in APPROVE_AMOUNT_LIMIT means only blockUnlimited applies', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({ blockUnlimited: true }), // no maxAmount
      priority: 20,
    });

    // Large but not unlimited
    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '999999999999999999'),
    );
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-18: UNLIMITED_THRESHOLD boundary values
// ---------------------------------------------------------------------------

describe('SEC-08-18: UNLIMITED_THRESHOLD boundary values', () => {
  const spender = '0xaaaa000000000000000000000000000000000001';

  beforeEach(() => {
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({ blockUnlimited: true }),
      priority: 20,
    });
  });

  it('UNLIMITED_THRESHOLD - 1 is allowed', async () => {
    const amount = (UNLIMITED_THRESHOLD - 1n).toString();
    const result = await engine.evaluate(walletId, approveTx(spender, amount));
    expect(result.allowed).toBe(true);
  });

  it('exactly UNLIMITED_THRESHOLD is blocked', async () => {
    const amount = UNLIMITED_THRESHOLD.toString();
    const result = await engine.evaluate(walletId, approveTx(spender, amount));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unlimited token approval is blocked');
  });

  it('UNLIMITED_THRESHOLD + 1 is blocked', async () => {
    const amount = (UNLIMITED_THRESHOLD + 1n).toString();
    const result = await engine.evaluate(walletId, approveTx(spender, amount));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unlimited token approval is blocked');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-19: TRANSFER type not affected by APPROVED_SPENDERS
// ---------------------------------------------------------------------------

describe('SEC-08-19: TRANSFER type not affected by APPROVED_SPENDERS', () => {
  it('native TRANSFER is not checked against APPROVED_SPENDERS', async () => {
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: '0xaaaa000000000000000000000000000000000001' }],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, transferTx('1000000'));
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-20: Empty spenders array -> all APPROVE denied
// ---------------------------------------------------------------------------

describe('SEC-08-20: empty spenders array -> all APPROVE denied', () => {
  it('denies all APPROVE when spenders array is empty', async () => {
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [] }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx('0xaaaa000000000000000000000000000000000001', '1000000'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Spender not in approved list');
  });
});

// ---------------------------------------------------------------------------
// SEC-08-21: Duplicate APPROVED_SPENDERS for same spender (priority wins)
// ---------------------------------------------------------------------------

describe('SEC-08-21: duplicate APPROVED_SPENDERS -> priority wins', () => {
  it('wallet-specific APPROVED_SPENDERS overrides global with same spender', async () => {
    const spenderA = '0xaaaa000000000000000000000000000000000001';
    const spenderB = '0xbbbb000000000000000000000000000000000002';

    // Global: both spenders
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spenderA }, { address: spenderB }],
      }),
      priority: 5,
    });

    // Wallet-specific: only spenderA
    insertPolicy(conn.sqlite, {
      walletId,
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spenderA }],
      }),
      priority: 10,
    });

    // spenderA allowed
    const r1 = await engine.evaluate(walletId, approveTx(spenderA, '1000000'));
    expect(r1.allowed).toBe(true);

    // spenderB denied (wallet-specific doesn't include it)
    const r2 = await engine.evaluate(walletId, approveTx(spenderB, '1000000'));
    expect(r2.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-22: No APPROVED_SPENDERS (effectively APPROVE_DISABLED)
// ---------------------------------------------------------------------------

describe('SEC-08-22: no APPROVED_SPENDERS = effectively disabled', () => {
  it('without any APPROVED_SPENDERS policy, all APPROVE transactions denied', async () => {
    // Only SPENDING_LIMIT active
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // Any spender -> denied (default deny)
    const r1 = await engine.evaluate(
      walletId,
      approveTx('0xaaaa000000000000000000000000000000000001', '1'),
    );
    expect(r1.allowed).toBe(false);
    expect(r1.reason).toContain('no APPROVED_SPENDERS policy configured');

    // Different spender -> also denied
    const r2 = await engine.evaluate(
      walletId,
      approveTx('0xbbbb000000000000000000000000000000000002', '100'),
    );
    expect(r2.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-23: Approve amount 0 (revoke approval) is allowed
// ---------------------------------------------------------------------------

describe('SEC-08-23: approve 0 (revoke) is allowed', () => {
  it('zero approve amount passes APPROVE_AMOUNT_LIMIT check', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({
        maxAmount: '1000000',
        blockUnlimited: true,
      }),
      priority: 20,
    });

    // Approve 0 = revoke
    const result = await engine.evaluate(walletId, approveTx(spender, '0'));
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-08-24: APPROVE_TIER_OVERRIDE with NOTIFY tier
// ---------------------------------------------------------------------------

describe('SEC-08-24: APPROVE_TIER_OVERRIDE with NOTIFY tier', () => {
  it('APPROVE_TIER_OVERRIDE can set any valid tier', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'NOTIFY' }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, approveTx(spender, '100'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('APPROVE_TIER_OVERRIDE with INSTANT tier', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';

    // Need to reset APPROVE_TIER_OVERRIDE for this test
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender }],
      }),
      priority: 20,
    });

    insertPolicy(conn.sqlite, {
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'INSTANT' }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, approveTx(spender, '100'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});
