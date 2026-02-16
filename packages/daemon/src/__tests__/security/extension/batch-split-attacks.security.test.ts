/**
 * SEC-09: Batch split attack scenarios (22 tests).
 *
 * Tests batch transaction policy evaluation against:
 * - Small amount splitting to bypass SPENDING_LIMIT
 * - Batch All-or-Nothing deny semantics
 * - Mixed-type batch evaluation
 * - Boundary conditions for aggregate amounts
 * - Policy override interactions with batch evaluation
 *
 * @see docs/64-extension-test-strategy.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createInMemoryDb,
  insertPolicy,
} from '../helpers/security-test-helpers.js';
import type { DatabaseConnection } from '../../../infrastructure/database/index.js';
import { generateId } from '../../../infrastructure/database/index.js';
import { wallets } from '../../../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from '../../../pipeline/database-policy-engine.js';

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
    name: 'sec-batch-wallet',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'devnet',
    publicKey: `pk-bat-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Create a single TRANSFER instruction for batch. */
function transferInstr(
  amount: string,
  toAddress = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
) {
  return { type: 'TRANSFER', amount, toAddress, chain: 'solana' };
}

/** Create a TOKEN_TRANSFER instruction. */
function tokenTransferInstr(
  amount: string,
  tokenAddress: string,
  toAddress = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
) {
  return { type: 'TOKEN_TRANSFER', amount, toAddress, chain: 'solana', tokenAddress };
}

/** Create a CONTRACT_CALL instruction. */
function contractCallInstr(
  contractAddress: string,
  toAddress?: string,
) {
  return {
    type: 'CONTRACT_CALL',
    amount: '0',
    toAddress: toAddress ?? contractAddress,
    chain: 'solana',
    contractAddress,
  };
}

/** Create an APPROVE instruction. */
function approveInstr(
  spenderAddress: string,
  approveAmount = '1000000',
) {
  return {
    type: 'APPROVE',
    amount: '0',
    toAddress: spenderAddress,
    chain: 'solana',
    spenderAddress,
    approveAmount,
  };
}

/** Standard SPENDING_LIMIT rules for tests. */
function spendingLimitRules(opts?: {
  instant_max?: string;
  notify_max?: string;
  delay_max?: string;
  delay_seconds?: number;
}) {
  return JSON.stringify({
    instant_max: opts?.instant_max ?? '500000000', // 0.5 SOL
    notify_max: opts?.notify_max ?? '5000000000', // 5 SOL
    delay_max: opts?.delay_max ?? '50000000000', // 50 SOL
    delay_seconds: opts?.delay_seconds ?? 300,
  });
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
  vi.useRealTimers();
  try { conn.sqlite.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// SEC-09-01: Small amount splitting to bypass SPENDING_LIMIT
// ---------------------------------------------------------------------------

describe('SEC-09-01: Small amount splitting to bypass SPENDING_LIMIT', () => {
  it('aggregates batch TRANSFER amounts and escalates tier when sum exceeds instant_max', async () => {
    // instant_max = 0.5 SOL (500_000_000 lamports)
    // 10 transfers x 100_000_000 each = 1_000_000_000 (1 SOL) -> exceeds instant_max
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    const instructions = Array.from({ length: 10 }, () =>
      transferInstr('100000000'), // 0.1 SOL each
    );

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // 1 SOL aggregate > 0.5 SOL instant_max -> at least NOTIFY
    expect(result.tier).not.toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-02: Batch approve + transferFrom combo -> APPROVE_TIER_OVERRIDE
// ---------------------------------------------------------------------------

describe('SEC-09-02: Batch with APPROVE forces APPROVE_TIER_OVERRIDE', () => {
  it('applies APPROVE_TIER_OVERRIDE and takes max(amount tier, approve tier)', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({ spenders: [{ address: '0xSpender1' }] }),
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'DELAY' }),
      priority: 10,
    });

    // Small transfer + APPROVE -> APPROVE_TIER_OVERRIDE forces at least DELAY
    const instructions = [
      transferInstr('100000000'), // 0.1 SOL (INSTANT alone)
      approveInstr('0xSpender1'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // max(INSTANT from amount, DELAY from approve override) = DELAY
    expect(['DELAY', 'APPROVAL']).toContain(result.tier);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-03: Batch with malicious instruction -> All-or-Nothing deny
// ---------------------------------------------------------------------------

describe('SEC-09-03: All-or-Nothing deny on batch with non-whitelisted address', () => {
  it('denies entire batch if any instruction targets non-whitelisted address', async () => {
    insertPolicy(conn.sqlite, {
      type: 'WHITELIST',
      rules: JSON.stringify({ allowed_addresses: ['AllowedAddr111111111111111111111111111111111'] }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000', 'AllowedAddr111111111111111111111111111111111'),
      transferInstr('100000000', 'MaliciousAddr9999999999999999999999999999999'), // not whitelisted
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/denied/i);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-04: Batch with non-whitelisted contract call -> deny
// ---------------------------------------------------------------------------

describe('SEC-09-04: Batch deny when CONTRACT_CALL targets non-whitelisted contract', () => {
  it('denies batch with non-whitelisted CONTRACT_CALL', async () => {
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: '0xAllowedContract' }] }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000'),
      contractCallInstr('0xMaliciousContract'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not whitelisted|denied/i);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-05: Batch with non-allowed token -> deny
// ---------------------------------------------------------------------------

describe('SEC-09-05: Batch deny when TOKEN_TRANSFER uses non-allowed token', () => {
  it('denies batch with non-allowed TOKEN_TRANSFER', async () => {
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: 'AllowedTokenMint11111111111111111111111111' }] }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000'),
      tokenTransferInstr('1000000', 'EvilTokenMint9999999999999999999999999999999'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not in allowed|denied/i);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-06: Empty batchItems
// ---------------------------------------------------------------------------

describe('SEC-09-06: Empty batchItems -> INSTANT (no instructions to evaluate)', () => {
  it('returns INSTANT for empty batch', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    const result = await engine.evaluateBatch(walletId, []);
    // No violations (no items), no amount -> INSTANT
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-07: Single-item batch -> same as individual evaluate
// ---------------------------------------------------------------------------

describe('SEC-09-07: Single-item batch matches individual evaluation', () => {
  it('produces same tier as individual evaluate for a single TRANSFER', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    const amount = '1000000000'; // 1 SOL -> NOTIFY tier
    const singleTx = { type: 'TRANSFER', amount, toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', chain: 'solana' };

    const individualResult = await engine.evaluate(walletId, singleTx);
    const batchResult = await engine.evaluateBatch(walletId, [singleTx]);

    expect(batchResult.tier).toBe(individualResult.tier);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-08: Batch sum exactly at instant_max boundary -> INSTANT
// ---------------------------------------------------------------------------

describe('SEC-09-08: Batch sum exactly at instant_max -> INSTANT', () => {
  it('allows INSTANT when batch sum equals instant_max', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '500000000' }),
      priority: 10,
    });

    // 2 transfers that sum to exactly 500_000_000
    const instructions = [
      transferInstr('250000000'),
      transferInstr('250000000'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-09: Batch sum is instant_max + 1 -> NOTIFY
// ---------------------------------------------------------------------------

describe('SEC-09-09: Batch sum instant_max + 1 -> escalates to NOTIFY', () => {
  it('escalates to NOTIFY when batch sum exceeds instant_max by 1 lamport', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '500000000' }),
      priority: 10,
    });

    const instructions = [
      transferInstr('250000000'),
      transferInstr('250000001'), // sum = 500_000_001
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-10: Mixed-type batch (TRANSFER + TOKEN_TRANSFER + CONTRACT_CALL)
// ---------------------------------------------------------------------------

describe('SEC-09-10: Mixed-type batch with valid policies', () => {
  it('evaluates each instruction type against its respective policy', async () => {
    // SPENDING_LIMIT for TRANSFER amounts
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    // ALLOWED_TOKENS for TOKEN_TRANSFER
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: 'USDC_MINT_ADDRESS' }] }),
      priority: 10,
    });

    // CONTRACT_WHITELIST for CONTRACT_CALL
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: '0xWhitelistedDex' }] }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000'), // 0.1 SOL
      tokenTransferInstr('1000000', 'USDC_MINT_ADDRESS'),
      contractCallInstr('0xWhitelistedDex'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-11: Global vs wallet policy override with batch
// ---------------------------------------------------------------------------

describe('SEC-09-11: Wallet-specific policy overrides global for batch', () => {
  it('wallet SPENDING_LIMIT overrides global in batch evaluation', async () => {
    // Global: instant_max = 1 SOL
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '1000000000' }),
      priority: 0,
    });

    // Wallet-specific: instant_max = 0.1 SOL (stricter)
    insertPolicy(conn.sqlite, {
      walletId,
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '100000000' }),
      priority: 10,
    });

    // Batch sum = 0.5 SOL -> INSTANT by global, NOTIFY by wallet-specific
    const instructions = [
      transferInstr('250000000'),
      transferInstr('250000000'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // Wallet-specific override (0.1 SOL instant_max) should apply
    expect(result.tier).toBe('NOTIFY');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-12: BATCH type not supported on chain
// ---------------------------------------------------------------------------

describe('SEC-09-12: evaluateBatch with no policies -> INSTANT passthrough', () => {
  it('returns INSTANT when no policies exist', async () => {
    const instructions = [
      transferInstr('1000000000'),
      transferInstr('2000000000'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-13: Batch sum exactly at notify_max boundary
// ---------------------------------------------------------------------------

describe('SEC-09-13: Batch sum exactly at notify_max -> NOTIFY', () => {
  it('stays at NOTIFY when batch sum equals notify_max', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ notify_max: '5000000000' }),
      priority: 10,
    });

    // Sum = 5 SOL = notify_max
    const instructions = [
      transferInstr('2500000000'),
      transferInstr('2500000000'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-14: Batch sum exactly at delay_max boundary
// ---------------------------------------------------------------------------

describe('SEC-09-14: Batch sum exactly at delay_max -> DELAY', () => {
  it('stays at DELAY when batch sum equals delay_max', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ delay_max: '50000000000' }),
      priority: 10,
    });

    // Sum = 50 SOL = delay_max
    const instructions = [
      transferInstr('25000000000'),
      transferInstr('25000000000'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-15: Batch sum exceeds delay_max -> APPROVAL
// ---------------------------------------------------------------------------

describe('SEC-09-15: Batch sum exceeds delay_max -> APPROVAL', () => {
  it('escalates to APPROVAL when batch sum exceeds delay_max', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ delay_max: '50000000000' }),
      priority: 10,
    });

    const instructions = [
      transferInstr('30000000000'),
      transferInstr('30000000000'), // sum = 60 SOL > 50 SOL delay_max
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-16: Large batch (20 items) -- max allowed
// ---------------------------------------------------------------------------

describe('SEC-09-16: Large batch with 20 items (max allowed)', () => {
  it('evaluates 20-item batch correctly', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '10000000000' }), // 10 SOL
      priority: 10,
    });

    // 20 x 100_000_000 = 2 SOL -> INSTANT
    const instructions = Array.from({ length: 20 }, () =>
      transferInstr('100000000'),
    );

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-17: All-or-Nothing with multiple violations
// ---------------------------------------------------------------------------

describe('SEC-09-17: Batch with multiple violations reports all', () => {
  it('reports all violations in denial reason', async () => {
    insertPolicy(conn.sqlite, {
      type: 'WHITELIST',
      rules: JSON.stringify({ allowed_addresses: ['OnlyThisAddr111111111111111111111111111111'] }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000', 'BadAddr1111111111111111111111111111111111111'),
      transferInstr('100000000', 'BadAddr2222222222222222222222222222222222222'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(false);
    // Should mention both violations
    expect(result.reason).toMatch(/2 instruction/i);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-18: Batch TOKEN_TRANSFER without ALLOWED_TOKENS policy -> deny
// ---------------------------------------------------------------------------

describe('SEC-09-18: TOKEN_TRANSFER in batch denied without ALLOWED_TOKENS policy', () => {
  it('denies batch TOKEN_TRANSFER when no ALLOWED_TOKENS policy exists', async () => {
    // Need at least one policy so evaluateBatch enters evaluation path (not passthrough)
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });
    // No ALLOWED_TOKENS policy -> default deny for TOKEN_TRANSFER
    const instructions = [
      transferInstr('100000000'),
      tokenTransferInstr('1000000', 'SomeTokenMint111111111111111111111111111111'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    // The TOKEN_TRANSFER should be denied due to default-deny
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-19: CONTRACT_CALL in batch denied without CONTRACT_WHITELIST
// ---------------------------------------------------------------------------

describe('SEC-09-19: CONTRACT_CALL in batch denied without CONTRACT_WHITELIST', () => {
  it('denies batch CONTRACT_CALL when no CONTRACT_WHITELIST policy exists', async () => {
    // Need at least one policy so evaluateBatch enters evaluation path
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });
    const instructions = [
      transferInstr('100000000'),
      contractCallInstr('0xSomeContract'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-20: APPROVE in batch denied without APPROVED_SPENDERS
// ---------------------------------------------------------------------------

describe('SEC-09-20: APPROVE in batch denied without APPROVED_SPENDERS', () => {
  it('denies batch APPROVE when no APPROVED_SPENDERS policy exists', async () => {
    // Need at least one policy so evaluateBatch enters evaluation path
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });
    const instructions = [
      transferInstr('100000000'),
      approveInstr('0xUnapprovedSpender'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SEC-09-21: Batch with network scoping
// ---------------------------------------------------------------------------

describe('SEC-09-21: Batch evaluation respects network scoping', () => {
  it('uses network-scoped policy for batch evaluation', async () => {
    // Global: instant_max = 10 SOL
    insertPolicy(conn.sqlite, {
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '10000000000' }),
      priority: 0,
    });

    const instructions = [
      { ...transferInstr('500000000'), network: 'devnet' },
      { ...transferInstr('500000000'), network: 'devnet' },
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// SEC-09-22: Only TRANSFER amounts count in aggregate (TOKEN_TRANSFER/CONTRACT_CALL = 0)
// ---------------------------------------------------------------------------

describe('SEC-09-22: Only TRANSFER amounts count in batch aggregate', () => {
  it('TOKEN_TRANSFER and CONTRACT_CALL do not add to native amount aggregate', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '500000000' }), // 0.5 SOL
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: 'USDC_MINT' }] }),
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: '0xDex' }] }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000'), // 0.1 SOL native amount
      tokenTransferInstr('999999999999', 'USDC_MINT'), // large token amount, no native
      contractCallInstr('0xDex'), // no native amount
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // Only 0.1 SOL counted -> INSTANT (below 0.5 SOL instant_max)
    expect(result.tier).toBe('INSTANT');
  });
});
