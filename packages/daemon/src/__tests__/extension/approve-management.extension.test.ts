/**
 * EXT-03: Approve management functional tests (24 scenarios).
 *
 * Tests APPROVE discriminatedUnion type normal/positive behavior:
 * - APR-U01~U10: Unit -- Zod validation, unlimited detection, policy evaluation
 * - APR-I01~I08: Integration -- pipeline flow, DB round-trip, override priority
 * - APR-X01~X06: Cross-validation -- blockUnlimited, approve 0 reset, complex combos
 *
 * Functional (not security) perspective: verifies correct behavior under normal use.
 *
 * @see docs/64-extension-test-strategy.md section 6.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createInMemoryDb,
  insertPolicy,
} from '../security/helpers/security-test-helpers.js';
import type { DatabaseConnection } from '../../infrastructure/database/index.js';
import { generateId } from '../../infrastructure/database/index.js';
import { wallets } from '../../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from '../../pipeline/database-policy-engine.js';

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

async function insertTestWallet(
  connection: DatabaseConnection,
  opts?: { chain?: string; defaultNetwork?: string },
): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await connection.db.insert(wallets).values({
    id,
    name: 'ext-approve-test-wallet',
    chain: opts?.chain ?? 'ethereum',
    environment: 'testnet',
    defaultNetwork: opts?.defaultNetwork ?? 'ethereum-sepolia',
    publicKey: `pk-ext-apr-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Build an APPROVE transaction for policy evaluation. */
function approveTx(
  spenderAddress: string,
  approveAmount: string,
  opts?: { tokenAddress?: string; toAddress?: string; chain?: string; network?: string },
) {
  return {
    type: 'APPROVE',
    spenderAddress,
    approveAmount,
    amount: '0',
    toAddress: opts?.toAddress ?? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenAddress: opts?.tokenAddress ?? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    chain: opts?.chain ?? 'ethereum',
    ...(opts?.network ? { network: opts.network } : {}),
  };
}

/** Build a native TRANSFER transaction. */
function _transferTx(amount = '1000000000') {
  return {
    type: 'TRANSFER',
    amount,
    toAddress: '0xbbbb000000000000000000000000000000000002',
    chain: 'ethereum',
  };
}

/** Build a TOKEN_TRANSFER transaction. */
function tokenTransferTx(
  amount: string,
  tokenAddress: string,
  toAddress = '0xbbbb000000000000000000000000000000000002',
) {
  return {
    type: 'TOKEN_TRANSFER',
    amount,
    toAddress,
    tokenAddress,
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

// ===========================================================================
// APR-U01~U05: ApproveRequest Zod + Unlimited Detection (5 tests)
// ===========================================================================

describe('APR-U01~U05: ApproveRequest Zod + unlimited detection', () => {
  it('APR-U01: valid APPROVE request passes policy evaluation with approved spender', async () => {
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
    expect(result.tier).toBeDefined();
  });

  it('APR-U02: APPROVE without spenderAddress fails evaluation', async () => {
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: '0xaaaa000000000000000000000000000000000001' }],
      }),
      priority: 20,
    });

    // Missing spenderAddress
    const result = await engine.evaluate(walletId, {
      type: 'APPROVE',
      amount: '0',
      toAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chain: 'ethereum',
      approveAmount: '1000000',
    });
    // spenderAddress is undefined -> denied
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Approve missing spender address');
  });

  it('APR-U03: EVM MAX_UINT256 detected as unlimited (>= UNLIMITED_THRESHOLD)', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });

    // No APPROVE_AMOUNT_LIMIT -> default blockUnlimited=true
    const result = await engine.evaluate(
      walletId,
      approveTx(spender, UINT256_MAX.toString()),
    );
    // uint256.max >= UNLIMITED_THRESHOLD -> blocked by default
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unlimited token approval is blocked');
  });

  it('APR-U04: Solana MAX_U64 is NOT considered unlimited (below UNLIMITED_THRESHOLD)', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });

    // u64.max (18446744073709551615) < UNLIMITED_THRESHOLD -> NOT unlimited
    const result = await engine.evaluate(
      walletId,
      approveTx(spender, U64_MAX.toString(), { chain: 'solana' }),
    );
    expect(result.allowed).toBe(true);
    // Confirm u64.max is below threshold
    expect(U64_MAX < UNLIMITED_THRESHOLD).toBe(true);
  });

  it('APR-U05: sub-threshold amount is NOT unlimited', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });

    const belowThreshold = (UNLIMITED_THRESHOLD - 1n).toString();
    const result = await engine.evaluate(
      walletId,
      approveTx(spender, belowThreshold),
    );
    expect(result.allowed).toBe(true);
  });
});

// ===========================================================================
// APR-U06~U10: Policy Evaluation (5 tests)
// ===========================================================================

describe('APR-U06~U10: policy evaluation', () => {
  it('APR-U06: APPROVED_SPENDERS not configured -> DENY (default deny for APPROVE)', async () => {
    // Need at least one enabled policy so we don't get INSTANT passthrough
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

  it('APR-U07: approved spender -> ALLOW', async () => {
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
  });

  it('APR-U08: non-approved spender -> DENY (SPENDER_NOT_APPROVED)', async () => {
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: '0xaaaa000000000000000000000000000000000001' }],
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

  it('APR-U09: APPROVE_AMOUNT_LIMIT maxAmount exceeded -> DENY', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });
    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({ maxAmount: '5000000', blockUnlimited: false }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '5000001'),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Approve amount exceeds limit');
  });

  it('APR-U10: APPROVE_TIER_OVERRIDE tier=NOTIFY -> forces NOTIFY tier', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });
    insertPolicy(conn.sqlite, {
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'NOTIFY' }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx(spender, '100'),
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });
});

// ===========================================================================
// APR-I01~I03: Integration Pipeline (3 tests)
// ===========================================================================

describe('APR-I01~I03: integration pipeline', () => {
  it('APR-I01: EVM approve full pipeline -> allowed with correct tier (APPROVAL default)', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender, name: 'Uniswap V3 Router' }],
      }),
      priority: 20,
    });

    const tx = approveTx(spender, '1000000000', {
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      chain: 'ethereum',
    });

    const result = await engine.evaluate(walletId, tx);
    expect(result.allowed).toBe(true);
    // Default APPROVE_TIER_OVERRIDE = APPROVAL
    expect(result.tier).toBe('APPROVAL');
  });

  it('APR-I02: Solana approve full pipeline -> allowed with APPROVAL tier', async () => {
    const solanaWalletId = await insertTestWallet(conn, {
      chain: 'solana',
      defaultNetwork: 'devnet',
    });
    const spender = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });

    const tx = approveTx(spender, '1000000', { chain: 'solana' });
    const result = await engine.evaluate(solanaWalletId, tx);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('APR-I03: unapproved spender in pipeline -> denied with reason', async () => {
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: '0xaaaa000000000000000000000000000000000001' }],
      }),
      priority: 20,
    });

    const tx = approveTx('0xMaliciousSpender1234567890123456789012', '1000000');
    const result = await engine.evaluate(walletId, tx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Spender not in approved list');
  });
});

// ===========================================================================
// APR-I04~I08: Policy DB Integration (5 tests)
// ===========================================================================

describe('APR-I04~I08: policy DB integration', () => {
  it('APR-I04: APPROVED_SPENDERS DB round-trip (insert -> evaluate -> consistent)', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';

    // Insert policy
    const policyId = insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: spender, name: 'Aave V3' }],
      }),
      priority: 20,
    });

    // Verify DB insertion
    const row = conn.sqlite
      .prepare('SELECT * FROM policies WHERE id = ?')
      .get(policyId) as { type: string; rules: string };
    expect(row.type).toBe('APPROVED_SPENDERS');

    const rules = JSON.parse(row.rules);
    expect(rules.spenders[0].address).toBe(spender);

    // Evaluate against DB
    const result = await engine.evaluate(walletId, approveTx(spender, '1000'));
    expect(result.allowed).toBe(true);
  });

  it('APR-I05: APPROVE_AMOUNT_LIMIT DB round-trip', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });

    const limitId = insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({ maxAmount: '10000000', blockUnlimited: true }),
      priority: 20,
    });

    // Verify DB
    const row = conn.sqlite
      .prepare('SELECT rules FROM policies WHERE id = ?')
      .get(limitId) as { rules: string };
    const rules = JSON.parse(row.rules);
    expect(rules.maxAmount).toBe('10000000');
    expect(rules.blockUnlimited).toBe(true);

    // Within limit -> allowed
    const r1 = await engine.evaluate(walletId, approveTx(spender, '10000000'));
    expect(r1.allowed).toBe(true);

    // Exceeds limit -> denied
    const r2 = await engine.evaluate(walletId, approveTx(spender, '10000001'));
    expect(r2.allowed).toBe(false);
  });

  it('APR-I06: APPROVE_TIER_OVERRIDE JSON stored/restored accurately', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });

    const tierId = insertPolicy(conn.sqlite, {
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'DELAY' }),
      priority: 20,
    });

    // Verify DB round-trip
    const row = conn.sqlite
      .prepare('SELECT rules FROM policies WHERE id = ?')
      .get(tierId) as { rules: string };
    const rules = JSON.parse(row.rules);
    expect(rules.tier).toBe('DELAY');

    // Evaluate -> DELAY tier
    const result = await engine.evaluate(walletId, approveTx(spender, '100'));
    expect(result.tier).toBe('DELAY');
  });

  it('APR-I07: global vs wallet-specific APPROVED_SPENDERS priority', async () => {
    const globalSpender = '0xaaaa000000000000000000000000000000000001';
    const walletSpender = '0xbbbb000000000000000000000000000000000002';

    // Global policy
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: globalSpender, name: 'Global DEX' }],
      }),
      priority: 10,
    });

    // Wallet-specific policy (overrides global)
    insertPolicy(conn.sqlite, {
      walletId,
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: walletSpender, name: 'Wallet DEX' }],
      }),
      priority: 10,
    });

    // Wallet-specific spender -> allowed
    const r1 = await engine.evaluate(walletId, approveTx(walletSpender, '1000'));
    expect(r1.allowed).toBe(true);

    // Global spender -> denied (wallet-specific overrides)
    const r2 = await engine.evaluate(walletId, approveTx(globalSpender, '1000'));
    expect(r2.allowed).toBe(false);
  });

  it('APR-I08: policy removal restores default deny', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';

    // Insert spender policy
    const policyId = insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });

    // Approve works
    const r1 = await engine.evaluate(walletId, approveTx(spender, '1000'));
    expect(r1.allowed).toBe(true);

    // Delete policy
    conn.sqlite.prepare('DELETE FROM policies WHERE id = ?').run(policyId);

    // Need another policy to avoid INSTANT passthrough
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

    // Now APPROVE denied (default deny restored)
    const r2 = await engine.evaluate(walletId, approveTx(spender, '1000'));
    expect(r2.allowed).toBe(false);
    expect(r2.reason).toContain('no APPROVED_SPENDERS policy configured');
  });
});

// ===========================================================================
// APR-X01~X06: Cross-validation + Security-related Functional (6 tests)
// ===========================================================================

describe('APR-X01~X06: cross-validation + security-related functional', () => {
  it('APR-X01: blockUnlimited=true + EVM uint256.max -> blocked', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
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

  it('APR-X02: blockUnlimited=false -> unlimited approve allowed', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
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

  it('APR-X03: approve 0 (revoke/reset) -> allowed even with maxAmount restriction', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });
    insertPolicy(conn.sqlite, {
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({ maxAmount: '1000000', blockUnlimited: true }),
      priority: 20,
    });

    // Approve 0 = revoke purpose -> allowed (0 is not > maxAmount)
    const result = await engine.evaluate(walletId, approveTx(spender, '0'));
    expect(result.allowed).toBe(true);
  });

  it('APR-X04: APPROVE + TOKEN_TRANSFER use independent policies', async () => {
    const spender = '0xaaaa000000000000000000000000000000000001';
    const tokenAddr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

    // Set up both policies
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: spender }] }),
      priority: 20,
    });
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: tokenAddr }] }),
      priority: 20,
    });
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

    // APPROVE uses APPROVED_SPENDERS
    const approveResult = await engine.evaluate(
      walletId,
      approveTx(spender, '1000000'),
    );
    expect(approveResult.allowed).toBe(true);
    expect(approveResult.tier).toBe('APPROVAL'); // Default APPROVE tier

    // TOKEN_TRANSFER uses ALLOWED_TOKENS
    const tokenResult = await engine.evaluate(
      walletId,
      tokenTransferTx('500000', tokenAddr),
    );
    expect(tokenResult.allowed).toBe(true);
    // TOKEN_TRANSFER evaluated against SPENDING_LIMIT, not APPROVE_TIER_OVERRIDE
    expect(tokenResult.tier).toBe('INSTANT');
  });

  it('APR-X05: case-insensitive spender matching (EVM checksum)', async () => {
    const checksumAddr = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: checksumAddr }] }),
      priority: 20,
    });

    // Lowercase match
    const r1 = await engine.evaluate(
      walletId,
      approveTx(checksumAddr.toLowerCase(), '1000'),
    );
    expect(r1.allowed).toBe(true);

    // Uppercase match
    const r2 = await engine.evaluate(
      walletId,
      approveTx(checksumAddr.toUpperCase(), '1000'),
    );
    expect(r2.allowed).toBe(true);
  });

  it('APR-X06: Solana single delegate behavior with empty spender list', async () => {
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [] }),
      priority: 20,
    });

    // Empty spender list -> any spender denied
    const result = await engine.evaluate(
      walletId,
      approveTx('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', '1000000', {
        chain: 'solana',
      }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Spender not in approved list');
  });
});
