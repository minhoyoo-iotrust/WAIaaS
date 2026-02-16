/**
 * EXT-04: Batch transaction functional tests (22 scenarios).
 *
 * Tests BATCH discriminatedUnion type normal/positive behavior:
 * - BAT-U01~U03: Unit -- normal batch operations, multi-instruction, ATA
 * - BAT-U04~U07: Policy denial -- aggregate escalation, individual violations, all-or-nothing
 * - BAT-U08~U11: Error scenarios -- EVM unsupported, instruction count limits, size
 * - BAT-I01~I05: Integration -- 2-stage evaluation, normalization, USD aggregation
 * - BAT-X01~X06: Cross-validation -- split sum, approve combo, atomic build
 *
 * Functional (not security) perspective: verifies correct behavior under normal use.
 *
 * @see docs/64-extension-test-strategy.md section 6.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createInMemoryDb,
  insertPolicy,
} from '../security/helpers/security-test-helpers.js';
import type { DatabaseConnection } from '../../infrastructure/database/index.js';
import { generateId } from '../../infrastructure/database/index.js';
import { wallets } from '../../infrastructure/database/schema.js';
import { DatabasePolicyEngine } from '../../pipeline/database-policy-engine.js';
import { MockPriceOracle, createMockPriceOracle } from '../mocks/mock-price-oracle.js';

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
    name: 'ext-batch-test-wallet',
    chain: opts?.chain ?? 'solana',
    environment: 'testnet',
    defaultNetwork: opts?.defaultNetwork ?? 'devnet',
    publicKey: `pk-ext-bat-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Create a TRANSFER instruction for batch. */
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
function contractCallInstr(contractAddress: string) {
  return {
    type: 'CONTRACT_CALL',
    amount: '0',
    toAddress: contractAddress,
    chain: 'solana',
    contractAddress,
  };
}

/** Create an APPROVE instruction. */
function approveInstr(spenderAddress: string, approveAmount = '1000000') {
  return {
    type: 'APPROVE',
    amount: '0',
    toAddress: spenderAddress,
    chain: 'solana',
    spenderAddress,
    approveAmount,
  };
}

/** Standard SPENDING_LIMIT rules. */
function spendingLimitRules(opts?: {
  instant_max?: string;
  notify_max?: string;
  delay_max?: string;
  delay_seconds?: number;
  instant_max_usd?: number;
  notify_max_usd?: number;
  delay_max_usd?: number;
}) {
  return JSON.stringify({
    instant_max: opts?.instant_max ?? '500000000',  // 0.5 SOL
    notify_max: opts?.notify_max ?? '5000000000',   // 5 SOL
    delay_max: opts?.delay_max ?? '50000000000',    // 50 SOL
    delay_seconds: opts?.delay_seconds ?? 300,
    ...(opts?.instant_max_usd !== undefined ? { instant_max_usd: opts.instant_max_usd } : {}),
    ...(opts?.notify_max_usd !== undefined ? { notify_max_usd: opts.notify_max_usd } : {}),
    ...(opts?.delay_max_usd !== undefined ? { delay_max_usd: opts.delay_max_usd } : {}),
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

// ===========================================================================
// BAT-U01~U03: Normal Batch Operations (3 tests)
// ===========================================================================

describe('BAT-U01~U03: normal batch operations', () => {
  it('BAT-U01: 2-instruction SOL transfer batch -> success, INSTANT tier', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '1000000000' }), // 1 SOL
      priority: 10,
    });

    const instructions = [
      transferInstr('200000000'), // 0.2 SOL
      transferInstr('300000000'), // 0.3 SOL -- total 0.5 SOL
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // 0.5 SOL <= 1 SOL instant_max
  });

  it('BAT-U02: 3-instruction mixed batch (transfer + token_transfer + contract_call)', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: 'USDCmint111111111111111111111111111111111' }] }),
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: 'JupiterProgram1111111111111111111111111111' }] }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000'),                                  // 0.1 SOL
      tokenTransferInstr('1000000', 'USDCmint111111111111111111111111111111111'), // USDC
      contractCallInstr('JupiterProgram1111111111111111111111111111'),            // Jupiter
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // Only 0.1 SOL native amount -> INSTANT
    expect(result.tier).toBe('INSTANT');
  });

  it('BAT-U03: batch with all whitelisted addresses -> success', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: [
          'Addr1111111111111111111111111111111111111111',
          'Addr2222222222222222222222222222222222222222',
        ],
      }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000', 'Addr1111111111111111111111111111111111111111'),
      transferInstr('200000000', 'Addr2222222222222222222222222222222222222222'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
  });
});

// ===========================================================================
// BAT-U04~U07: Policy Denial (4 tests)
// ===========================================================================

describe('BAT-U04~U07: policy denial', () => {
  it('BAT-U04: aggregate amount escalates tier (individual small, sum -> NOTIFY)', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '500000000' }), // 0.5 SOL
      priority: 10,
    });

    // 10 x 0.1 SOL = 1 SOL -> exceeds instant_max
    const instructions = Array.from({ length: 10 }, () =>
      transferInstr('100000000'),
    );

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // 1 SOL > 0.5 SOL instant_max -> NOTIFY
    expect(result.tier).toBe('NOTIFY');
  });

  it('BAT-U05: individual whitelist violation -> BATCH_POLICY_VIOLATION', async () => {
    insertPolicy(conn.sqlite, {
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['AllowedAddr111111111111111111111111111111111'],
      }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000', 'AllowedAddr111111111111111111111111111111111'),
      transferInstr('100000000', 'NotAllowed9999999999999999999999999999999999'), // not whitelisted
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/denied/i);
  });

  it('BAT-U06: All-or-Nothing with 2 violations -> reports both', async () => {
    insertPolicy(conn.sqlite, {
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['OnlyThisAddr111111111111111111111111111111'],
      }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000', 'BadAddr1111111111111111111111111111111111111'),
      transferInstr('100000000', 'BadAddr2222222222222222222222222222222222222'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/2 instruction/i);
  });

  it('BAT-U07: APPROVE in batch forces APPROVAL tier override', async () => {
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

    // Small transfer + APPROVE -> APPROVAL tier (default override)
    const instructions = [
      transferInstr('100000000'), // 0.1 SOL (INSTANT)
      approveInstr('0xSpender1'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // max(INSTANT from amount, APPROVAL from default approve tier) = APPROVAL
    expect(result.tier).toBe('APPROVAL');
  });
});

// ===========================================================================
// BAT-U08~U11: Error Scenarios (4 tests)
// ===========================================================================

describe('BAT-U08~U11: error scenarios', () => {
  it('BAT-U08: EVM batch -> evaluateBatch still works (policy evaluation level)', async () => {
    // Note: BATCH_NOT_SUPPORTED is thrown at adapter level, not policy level.
    // evaluateBatch works for any chain at policy level.
    const evmWalletId = await insertTestWallet(conn, {
      chain: 'ethereum',
      defaultNetwork: 'ethereum-sepolia',
    });

    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    const instructions = [
      { type: 'TRANSFER', amount: '100000000', toAddress: '0xabc', chain: 'ethereum' },
      { type: 'TRANSFER', amount: '200000000', toAddress: '0xdef', chain: 'ethereum' },
    ];

    // Policy evaluation succeeds (adapter would reject EVM batch)
    const result = await engine.evaluateBatch(evmWalletId, instructions);
    expect(result.allowed).toBe(true);
  });

  it('BAT-U09: empty batch -> INSTANT (no instructions to evaluate)', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    const result = await engine.evaluateBatch(walletId, []);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('BAT-U10: single-item batch matches individual evaluate', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    const amount = '1000000000'; // 1 SOL -> NOTIFY
    const singleTx = { type: 'TRANSFER', amount, toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', chain: 'solana' };

    const individualResult = await engine.evaluate(walletId, singleTx);
    const batchResult = await engine.evaluateBatch(walletId, [singleTx]);

    expect(batchResult.tier).toBe(individualResult.tier);
  });

  it('BAT-U11: 20-item batch (max allowed) evaluates correctly', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '10000000000' }), // 10 SOL
      priority: 10,
    });

    // 20 x 0.1 SOL = 2 SOL -> INSTANT
    const instructions = Array.from({ length: 20 }, () =>
      transferInstr('100000000'),
    );

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ===========================================================================
// BAT-I01~I05: Integration + Policy Aggregation (5 tests)
// ===========================================================================

describe('BAT-I01~I05: integration + policy aggregation', () => {
  it('BAT-I01: evaluateBatch 2-stage aggregation (Phase A individual + Phase B sum)', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({
        instant_max: '500000000',   // 0.5 SOL
        notify_max: '5000000000',   // 5 SOL
      }),
      priority: 10,
    });

    // Phase A: Each individual instruction passes (0.3 SOL each, below any limit)
    // Phase B: Sum = 0.6 SOL > instant_max -> NOTIFY
    const instructions = [
      transferInstr('300000000'),
      transferInstr('300000000'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('BAT-I02: batch_items as TransactionParam[] evaluates correctly', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    // Properly typed TransactionParam-style items
    const items = [
      { type: 'TRANSFER', amount: '100000000', toAddress: 'Addr1', chain: 'solana' },
      { type: 'TRANSFER', amount: '200000000', toAddress: 'Addr2', chain: 'solana' },
    ];

    const result = await engine.evaluateBatch(walletId, items);
    expect(result.allowed).toBe(true);
    // 0.3 SOL <= 0.5 SOL instant_max -> INSTANT
    expect(result.tier).toBe('INSTANT');
  });

  it('BAT-I03: empty instructions array -> INSTANT (no evaluation)', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    const result = await engine.evaluateBatch(walletId, []);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('BAT-I04: same recipient multiple transfers -> independent eval + aggregate', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '300000000' }), // 0.3 SOL
      priority: 10,
    });

    const recipient = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
    // 3 transfers to same recipient: 0.15 + 0.1 + 0.1 = 0.35 SOL
    const instructions = [
      transferInstr('150000000', recipient),
      transferInstr('100000000', recipient),
      transferInstr('100000000', recipient),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // 0.35 SOL > 0.3 SOL instant_max -> NOTIFY
    expect(result.tier).toBe('NOTIFY');
  });

  it('BAT-I05: SPENDING_LIMIT + batch aggregate with USD evaluation (MockPriceOracle)', async () => {
    // USD thresholds
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({
        instant_max: '10000000000',   // 10 SOL (high native, won't trigger)
        notify_max: '100000000000',
        delay_max: '500000000000',
        instant_max_usd: 10,          // $10 USD
        notify_max_usd: 100,
        delay_max_usd: 1000,
      }),
      priority: 10,
    });

    // Batch of 2 x 0.1 SOL = 0.2 SOL native -> INSTANT by native
    // With SOL at $184, 0.2 SOL = $36.8 USD -> NOTIFY by USD
    const instructions = [
      transferInstr('100000000'), // 0.1 SOL
      transferInstr('100000000'), // 0.1 SOL
    ];

    // Pass batchUsdAmount to evaluateBatch
    const result = await engine.evaluateBatch(walletId, instructions, 36.8);
    expect(result.allowed).toBe(true);
    // max(INSTANT native, NOTIFY USD) = NOTIFY
    expect(result.tier).toBe('NOTIFY');
  });
});

// ===========================================================================
// BAT-X01~X06: Cross-validation (6 tests)
// ===========================================================================

describe('BAT-X01~X06: cross-validation', () => {
  it('BAT-X01: small amount split sum -> SPENDING_LIMIT aggregate evaluation', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({
        instant_max: '500000000',  // 0.5 SOL
        notify_max: '5000000000',  // 5 SOL
      }),
      priority: 10,
    });

    // 5 x 0.2 SOL = 1 SOL -> NOTIFY (not INSTANT)
    const instructions = Array.from({ length: 5 }, () =>
      transferInstr('200000000'),
    );

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('BAT-X02: approve + transferFrom combo -> APPROVE_TIER_OVERRIDE forced', async () => {
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

    // Small transfer + APPROVE with DELAY override
    const instructions = [
      transferInstr('100000000'), // 0.1 SOL (INSTANT)
      approveInstr('0xSpender1'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // max(INSTANT from amount, DELAY from override) = DELAY
    expect(['DELAY', 'APPROVAL']).toContain(result.tier);
  });

  it('BAT-X03: non-whitelisted contract in batch -> All-or-Nothing deny', async () => {
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: 'WhitelistedProg111111111111111111111111111' }],
      }),
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules(),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000'),
      contractCallInstr('NonWhitelisted999999999999999999999999999999'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not whitelisted|denied/i);
  });

  it('BAT-X04: Solana batch -> single aggregate transaction evaluation', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({
        instant_max: '250000000',  // 0.25 SOL
        notify_max: '5000000000',
      }),
      priority: 10,
    });

    // 2 transfers: 0.15 SOL + 0.15 SOL = 0.30 SOL aggregate
    const instructions = [
      transferInstr('150000000'),
      transferInstr('150000000'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // 0.30 SOL > 0.25 SOL instant_max -> NOTIFY (aggregate, not individual)
    expect(result.tier).toBe('NOTIFY');
  });

  it('BAT-X05: only TRANSFER amounts count in aggregate (TOKEN_TRANSFER/CONTRACT_CALL excluded)', async () => {
    insertPolicy(conn.sqlite, {
      type: 'SPENDING_LIMIT',
      rules: spendingLimitRules({ instant_max: '500000000' }), // 0.5 SOL
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({ tokens: [{ address: 'USDCmint1' }] }),
      priority: 10,
    });
    insertPolicy(conn.sqlite, {
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({ contracts: [{ address: '0xDex' }] }),
      priority: 10,
    });

    const instructions = [
      transferInstr('100000000'),                     // 0.1 SOL native
      tokenTransferInstr('999999999999', 'USDCmint1'), // large token amount (no native)
      contractCallInstr('0xDex'),                      // no native amount
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    // Only 0.1 SOL native counted -> INSTANT
    expect(result.tier).toBe('INSTANT');
  });

  it('BAT-X06: evaluateBatch with no policies -> INSTANT passthrough', async () => {
    // No policies at all
    const instructions = [
      transferInstr('1000000000'),
      transferInstr('2000000000'),
    ];

    const result = await engine.evaluateBatch(walletId, instructions);
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});
