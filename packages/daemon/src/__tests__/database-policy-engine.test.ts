/**
 * TDD tests for DatabasePolicyEngine.
 *
 * Tests DB-backed policy evaluation with SPENDING_LIMIT 4-tier classification,
 * WHITELIST address filtering, and ALLOWED_TOKENS token transfer whitelist.
 *
 * Uses in-memory SQLite + Drizzle (same pattern as pipeline.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, policies } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { CreatePolicyRequestSchema, SpendingLimitRulesSchema } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let engine: DatabasePolicyEngine;
let engineWithSqlite: DatabasePolicyEngine;
let walletId: string;

async function insertTestAgent(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'devnet',
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

function tx(amount: string, toAddress = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr') {
  return { type: 'TRANSFER', amount, toAddress, chain: 'solana' };
}

function tokenTx(
  amount: string,
  tokenAddress: string,
  toAddress = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
) {
  return { type: 'TOKEN_TRANSFER', amount, toAddress, chain: 'solana', tokenAddress };
}

function contractCallTx(opts: {
  amount?: string;
  contractAddress: string;
  selector?: string;
  toAddress?: string;
  chain?: string;
}) {
  return {
    type: 'CONTRACT_CALL',
    amount: opts.amount ?? '0',
    toAddress: opts.toAddress ?? opts.contractAddress,
    chain: opts.chain ?? 'ethereum',
    contractAddress: opts.contractAddress,
    selector: opts.selector,
  };
}

function approveTx(opts: {
  amount?: string;
  spenderAddress: string;
  approveAmount?: string;
  toAddress?: string;
  chain?: string;
}) {
  return {
    type: 'APPROVE',
    amount: opts.amount ?? '0',
    toAddress: opts.toAddress ?? opts.spenderAddress,
    chain: opts.chain ?? 'ethereum',
    spenderAddress: opts.spenderAddress,
    approveAmount: opts.approveAmount ?? '1000000',
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function insertTransaction(overrides: {
  walletId: string;
  status?: string;
  amount?: string;
  reservedAmount?: string | null;
}): Promise<string> {
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
      'solana',
      'TRANSFER',
      overrides.amount ?? '0',
      'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      overrides.status ?? 'PENDING',
      overrides.reservedAmount ?? null,
      now,
    );
  return id;
}

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  engine = new DatabasePolicyEngine(conn.db);
  engineWithSqlite = new DatabasePolicyEngine(conn.db, conn.sqlite);
  walletId = await insertTestAgent();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// SPENDING_LIMIT tests (7 tests)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - SPENDING_LIMIT', () => {
  it('should return INSTANT passthrough when no policies exist', async () => {
    const result = await engine.evaluate(walletId, tx('500000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should classify amount below instant_max as INSTANT', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000', // 1 SOL
        notify_max: '10000000000', // 10 SOL
        delay_max: '50000000000', // 50 SOL
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // 0.5 SOL = 500M lamports < 1B instant_max
    const result = await engine.evaluate(walletId, tx('500000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should classify amount between instant_max and notify_max as NOTIFY', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // 5 SOL = 5B lamports: instant_max < 5B <= notify_max
    const result = await engine.evaluate(walletId, tx('5000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('should classify amount between notify_max and delay_max as DELAY with delaySeconds', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // 30 SOL = 30B lamports: notify_max < 30B <= delay_max
    const result = await engine.evaluate(walletId, tx('30000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.delaySeconds).toBe(300);
  });

  it('should classify amount above delay_max as APPROVAL', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // 100 SOL = 100B lamports > 50B delay_max
    const result = await engine.evaluate(walletId, tx('100000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('should use wallet-specific policy over global policy of same type', async () => {
    // Global: generous limits
    await insertPolicy({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000', // 100 SOL
        notify_max: '200000000000',
        delay_max: '500000000000',
        delay_seconds: 600,
      }),
      priority: 10,
    });

    // Agent-specific: restrictive limits
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000', // 1 SOL
        notify_max: '5000000000',
        delay_max: '10000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // 5 SOL = 5B: under global instant_max but at agent notify_max
    const result = await engine.evaluate(walletId, tx('5000000000'));

    // Agent-specific should win: 5B <= 5B notify_max -> NOTIFY
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('should ignore disabled policies', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100', // very low - would deny most
        notify_max: '200',
        delay_max: '300',
        delay_seconds: 60,
      }),
      priority: 10,
      enabled: false, // disabled
    });

    // No enabled policies -> INSTANT passthrough
    const result = await engine.evaluate(walletId, tx('999999999999'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// WHITELIST tests (5 tests)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - WHITELIST', () => {
  it('should allow transaction when no whitelist policy exists', async () => {
    const result = await engine.evaluate(walletId, tx('1000'));

    expect(result.allowed).toBe(true);
  });

  it('should allow transaction when whitelist has empty allowed_addresses', async () => {
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({ allowed_addresses: [] }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tx('1000'));

    expect(result.allowed).toBe(true);
  });

  it('should allow transaction when toAddress is in whitelist', async () => {
    const target = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({ allowed_addresses: [target, 'AnotherAddr123'] }),
      priority: 20,
    });

    const result = await engine.evaluate(walletId, tx('1000', target));

    expect(result.allowed).toBe(true);
  });

  it('should deny transaction when toAddress is NOT in whitelist', async () => {
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['AllowedAddr1', 'AllowedAddr2'],
      }),
      priority: 20,
    });

    const result = await engine.evaluate(
      walletId,
      tx('1000', 'UnknownAddress999'),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('whitelist');
  });

  it('should do case-insensitive comparison for EVM address compat', async () => {
    const evmAddress = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: [evmAddress.toLowerCase()],
      }),
      priority: 20,
    });

    // Send with mixed-case address -> should still match
    const result = await engine.evaluate(
      walletId,
      tx('1000', evmAddress),
    );

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Priority + Override tests (2 tests)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - Priority + Override', () => {
  it('should evaluate higher priority policy first', async () => {
    // Low priority: WHITELIST that would deny
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['OnlyThisAddress'],
      }),
      priority: 5,
    });

    // High priority SPENDING_LIMIT
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 100,
    });

    // WHITELIST should still deny since it filters regardless of priority
    const result = await engine.evaluate(
      walletId,
      tx('500000000', 'NotWhitelisted'),
    );

    expect(result.allowed).toBe(false);
  });

  it('should override global SPENDING_LIMIT with wallet-specific SPENDING_LIMIT', async () => {
    // Global policy
    await insertPolicy({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // Agent-specific override with higher limits
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000', // 100 SOL
        notify_max: '200000000000',
        delay_max: '500000000000',
        delay_seconds: 600,
      }),
      priority: 10,
    });

    // 50 SOL: would be DELAY under global but INSTANT under wallet-specific
    const result = await engine.evaluate(walletId, tx('50000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// TOCTOU Prevention tests (evaluateAndReserve)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - TOCTOU Prevention', () => {
  it('should set reserved_amount on the transaction row', async () => {
    // Setup: SPENDING_LIMIT policy with 10 SOL instant_max
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000000000', // 10 SOL
        notify_max: '50000000000',
        delay_max: '100000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // Create a PENDING transaction row
    const txId = await insertTransaction({
      walletId,
      status: 'PENDING',
      amount: '5000000000',
    });

    // Evaluate and reserve 5 SOL (under 10 SOL instant_max)
    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('5000000000'),
      txId,
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');

    // Verify reserved_amount was set in DB
    const row = conn.sqlite
      .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { reserved_amount: string | null };

    expect(row.reserved_amount).toBe('5000000000');
  });

  it('should accumulate reserved amounts across sequential calls', async () => {
    // Setup: SPENDING_LIMIT with 10 SOL instant_max, 50 SOL notify_max
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000000000', // 10 SOL
        notify_max: '50000000000', // 50 SOL
        delay_max: '100000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // First request: 5 SOL (INSTANT -- 5 <= 10)
    const txId1 = await insertTransaction({
      walletId,
      status: 'PENDING',
      amount: '5000000000',
    });
    const result1 = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('5000000000'),
      txId1,
    );
    expect(result1.tier).toBe('INSTANT');

    // Second request: 6 SOL
    // Without TOCTOU: 6 SOL alone would be INSTANT (6 <= 10)
    // With TOCTOU: effective = 5 (reserved) + 6 = 11 -> NOTIFY (11 > 10, 11 <= 50)
    const txId2 = await insertTransaction({
      walletId,
      status: 'PENDING',
      amount: '6000000000',
    });
    const result2 = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('6000000000'),
      txId2,
    );

    expect(result2.tier).toBe('NOTIFY');
  });

  it('should release reservation when releaseReservation is called', async () => {
    // Create a transaction with reserved amount
    const txId = await insertTransaction({
      walletId,
      status: 'PENDING',
      amount: '5000000000',
      reservedAmount: '5000000000',
    });

    // Verify reservation exists
    const before = conn.sqlite
      .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { reserved_amount: string | null };
    expect(before.reserved_amount).toBe('5000000000');

    // Release reservation
    engineWithSqlite.releaseReservation(txId);

    // Verify reservation cleared
    const after = conn.sqlite
      .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { reserved_amount: string | null };
    expect(after.reserved_amount).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ALLOWED_TOKENS tests (7 tests)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - ALLOWED_TOKENS', () => {
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

  it('should deny TOKEN_TRANSFER when no ALLOWED_TOKENS policy exists (default deny)', async () => {
    // Add a SPENDING_LIMIT policy so that policies array is non-empty
    // (with zero policies, Step 2 returns INSTANT passthrough before ALLOWED_TOKENS check)
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000',
        notify_max: '200000000000',
        delay_max: '500000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // No ALLOWED_TOKENS policy -> deny TOKEN_TRANSFER
    const result = await engine.evaluate(walletId, tokenTx('1000000', USDC_MINT));

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no ALLOWED_TOKENS policy configured');
  });

  it('should allow TOKEN_TRANSFER when token is in ALLOWED_TOKENS whitelist', async () => {
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [
          { address: USDC_MINT },
          { address: USDT_MINT },
        ],
      }),
      priority: 15,
    });

    const result = await engine.evaluate(walletId, tokenTx('1000000', USDC_MINT));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should deny TOKEN_TRANSFER when token is NOT in ALLOWED_TOKENS whitelist', async () => {
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT }],
      }),
      priority: 15,
    });

    const unknownMint = 'UnknownMint111111111111111111111111111111111';
    const result = await engine.evaluate(walletId, tokenTx('1000000', unknownMint));

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Token not in allowed list');
    expect(result.reason).toContain(unknownMint);
  });

  it('should match token addresses case-insensitively (EVM hex addresses)', async () => {
    const evmToken = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: evmToken.toLowerCase() }],
      }),
      priority: 15,
    });

    // Send with mixed-case address
    const result = await engine.evaluate(walletId, tokenTx('1000000', evmToken));

    expect(result.allowed).toBe(true);
  });

  it('should NOT evaluate ALLOWED_TOKENS for native TRANSFER type (passthrough)', async () => {
    // Only ALLOWED_TOKENS policy exists, no SPENDING_LIMIT or WHITELIST
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT }],
      }),
      priority: 15,
    });

    // Native TRANSFER -> ALLOWED_TOKENS not applicable -> INSTANT passthrough
    const result = await engine.evaluate(walletId, tx('1000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should deny TOKEN_TRANSFER when tokenAddress is missing', async () => {
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT }],
      }),
      priority: 15,
    });

    // TOKEN_TRANSFER without tokenAddress
    const result = await engine.evaluate(walletId, {
      type: 'TOKEN_TRANSFER',
      amount: '1000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
      // tokenAddress intentionally omitted
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('missing token address');
  });

  it('should continue to SPENDING_LIMIT after ALLOWED_TOKENS passes', async () => {
    // ALLOWED_TOKENS allows USDC
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT }],
      }),
      priority: 15,
    });

    // SPENDING_LIMIT with tiers
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000',   // 1 USDC
        notify_max: '10000000',   // 10 USDC
        delay_max: '50000000',    // 50 USDC
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // 5 USDC = 5M -> NOTIFY (between instant_max and notify_max)
    const result = await engine.evaluate(walletId, tokenTx('5000000', USDC_MINT));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });
});

// ---------------------------------------------------------------------------
// ALLOWED_TOKENS CAIP-19 4-scenario matching tests
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - ALLOWED_TOKENS CAIP-19 matching', () => {
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('Scenario 2: denies when policy assetId is invalid CAIP-19 and TX has address only', async () => {
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ assetId: 'not-a-valid-caip19', address: USDC_MINT }],
      }),
      priority: 15,
    });

    // TX has tokenAddress only (no assetId) -> Scenario 2 catch returns false
    const result = await engine.evaluate(walletId, tokenTx('1000000', USDC_MINT));

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Token not in allowed list');
  });

  it('Scenario 3: denies when TX assetId is invalid CAIP-19 and policy has address only', async () => {
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT }],
      }),
      priority: 15,
    });

    // TX has assetId (invalid) but no tokenAddress -> Scenario 3 catch returns false
    const result = await engine.evaluate(walletId, {
      type: 'TOKEN_TRANSFER',
      amount: '1000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
      assetId: 'garbage-not-caip19',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Token not in allowed list');
  });
});

// ---------------------------------------------------------------------------
// CONTRACT_WHITELIST + METHOD_WHITELIST tests (8 tests)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - CONTRACT_WHITELIST + METHOD_WHITELIST', () => {
  const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
  const SWAP_SELECTOR = '0x38ed1739'; // swapExactTokensForTokens
  const SUPPLY_SELECTOR = '0x617ba037'; // supply

  it('should deny CONTRACT_CALL when no CONTRACT_WHITELIST policy exists (CONTRACT_CALL_DISABLED)', async () => {
    // Need at least one policy so we don't get the "no policies" passthrough
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000',
        notify_max: '200000000000',
        delay_max: '500000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      contractCallTx({ contractAddress: UNISWAP_ROUTER, selector: SWAP_SELECTOR }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no CONTRACT_WHITELIST policy configured');
  });

  it('should allow CONTRACT_CALL when contract is in CONTRACT_WHITELIST', async () => {
    await insertPolicy({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [
          { address: UNISWAP_ROUTER, name: 'Uniswap V2 Router' },
          { address: AAVE_POOL, name: 'Aave V3 Pool' },
        ],
      }),
      priority: 15,
    });

    const result = await engine.evaluate(
      walletId,
      contractCallTx({ contractAddress: UNISWAP_ROUTER, selector: SWAP_SELECTOR }),
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should deny CONTRACT_CALL when contract is NOT in CONTRACT_WHITELIST', async () => {
    await insertPolicy({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: UNISWAP_ROUTER, name: 'Uniswap V2 Router' }],
      }),
      priority: 15,
    });

    const unknownContract = '0x1111111111111111111111111111111111111111';
    const result = await engine.evaluate(
      walletId,
      contractCallTx({ contractAddress: unknownContract, selector: SWAP_SELECTOR }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Contract not whitelisted');
    expect(result.reason).toContain(unknownContract);
  });

  it('should allow CONTRACT_CALL when CONTRACT_WHITELIST passes and METHOD_WHITELIST selector matches', async () => {
    await insertPolicy({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [
          { contractAddress: UNISWAP_ROUTER, selectors: [SWAP_SELECTOR] },
        ],
      }),
      priority: 14,
    });

    const result = await engine.evaluate(
      walletId,
      contractCallTx({ contractAddress: UNISWAP_ROUTER, selector: SWAP_SELECTOR }),
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should deny CONTRACT_CALL when CONTRACT_WHITELIST passes but METHOD_WHITELIST selector does NOT match', async () => {
    await insertPolicy({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [
          { contractAddress: UNISWAP_ROUTER, selectors: [SWAP_SELECTOR] },
        ],
      }),
      priority: 14,
    });

    const forbiddenSelector = '0xdeadbeef';
    const result = await engine.evaluate(
      walletId,
      contractCallTx({ contractAddress: UNISWAP_ROUTER, selector: forbiddenSelector }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Method not whitelisted');
    expect(result.reason).toContain(forbiddenSelector);
    expect(result.reason).toContain(UNISWAP_ROUTER);
  });

  it('should allow CONTRACT_CALL when METHOD_WHITELIST has no entry for this contract (no restriction)', async () => {
    await insertPolicy({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: UNISWAP_ROUTER }, { address: AAVE_POOL }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'METHOD_WHITELIST',
      rules: JSON.stringify({
        methods: [
          // Only restrict Uniswap, not Aave
          { contractAddress: UNISWAP_ROUTER, selectors: [SWAP_SELECTOR] },
        ],
      }),
      priority: 14,
    });

    // Aave has no METHOD_WHITELIST entry -> no method restriction -> allow
    const result = await engine.evaluate(
      walletId,
      contractCallTx({ contractAddress: AAVE_POOL, selector: SUPPLY_SELECTOR }),
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should NOT affect non-CONTRACT_CALL types (TRANSFER passthrough)', async () => {
    await insertPolicy({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    // Native TRANSFER -> CONTRACT_WHITELIST not applicable -> passthrough
    const result = await engine.evaluate(walletId, tx('1000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should match contract addresses case-insensitively (EVM hex compat)', async () => {
    const mixedCaseAddress = '0x7a250D5630B4cF539739dF2C5dAcB4c659F2488D';
    await insertPolicy({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: mixedCaseAddress.toLowerCase() }],
      }),
      priority: 15,
    });

    // Send with mixed-case address -> should still match
    const result = await engine.evaluate(
      walletId,
      contractCallTx({ contractAddress: mixedCaseAddress, selector: SWAP_SELECTOR }),
    );

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT + APPROVE_TIER_OVERRIDE tests (13 tests)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT + APPROVE_TIER_OVERRIDE', () => {
  const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  const AAVE_POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';

  it('should deny APPROVE when no APPROVED_SPENDERS policy exists (APPROVE_DISABLED)', async () => {
    // Need at least one policy so we don't get the "no policies" passthrough
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000',
        notify_max: '200000000000',
        delay_max: '500000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no APPROVED_SPENDERS policy configured');
  });

  it('should allow APPROVE when spender is in APPROVED_SPENDERS list', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [
          { address: UNISWAP_ROUTER, name: 'Uniswap V2 Router' },
          { address: AAVE_POOL, name: 'Aave V3 Pool' },
        ],
      }),
      priority: 15,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER, approveAmount: '1000000' }),
    );

    // Should pass APPROVED_SPENDERS and reach APPROVE_TIER_OVERRIDE (default APPROVAL)
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL'); // default tier for APPROVE
  });

  it('should deny APPROVE when spender is NOT in APPROVED_SPENDERS list (SPENDER_NOT_APPROVED)', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER, name: 'Uniswap V2 Router' }],
      }),
      priority: 15,
    });

    const unknownSpender = '0x1111111111111111111111111111111111111111';
    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: unknownSpender }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Spender not in approved list');
    expect(result.reason).toContain(unknownSpender);
  });

  it('should deny APPROVE with large amount (~MAX_UINT256) + no APPROVE_AMOUNT_LIMIT (default block)', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    // MAX_UINT256 = 2^256 - 1
    const maxUint256 = (2n ** 256n - 1n).toString();
    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER, approveAmount: maxUint256 }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unlimited token approval is blocked');
  });

  it('should deny APPROVE with APPROVE_AMOUNT_LIMIT (blockUnlimited=true) + unlimited amount (UNLIMITED_APPROVE_BLOCKED)', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({
        blockUnlimited: true,
        maxAmount: '10000000',
      }),
      priority: 14,
    });

    const maxUint256 = (2n ** 256n - 1n).toString();
    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER, approveAmount: maxUint256 }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Unlimited token approval is blocked');
  });

  it('should allow APPROVE with APPROVE_AMOUNT_LIMIT (blockUnlimited=false) + unlimited amount', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({
        blockUnlimited: false,
      }),
      priority: 14,
    });

    const maxUint256 = (2n ** 256n - 1n).toString();
    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER, approveAmount: maxUint256 }),
    );

    // Should pass APPROVE_AMOUNT_LIMIT and reach APPROVE_TIER_OVERRIDE (default APPROVAL)
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('should deny APPROVE with APPROVE_AMOUNT_LIMIT (maxAmount=1000000) + amount=2000000 (APPROVE_AMOUNT_EXCEEDED)', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({
        blockUnlimited: true,
        maxAmount: '1000000',
      }),
      priority: 14,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER, approveAmount: '2000000' }),
    );

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Approve amount exceeds limit');
  });

  it('should allow APPROVE with APPROVE_AMOUNT_LIMIT (maxAmount=1000000) + amount=500000', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({
        blockUnlimited: true,
        maxAmount: '1000000',
      }),
      priority: 14,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER, approveAmount: '500000' }),
    );

    // Should pass APPROVE_AMOUNT_LIMIT and reach APPROVE_TIER_OVERRIDE (default APPROVAL)
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('should default to APPROVAL tier with no APPROVE_TIER_OVERRIDE policy', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER, approveAmount: '1000000' }),
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('should use INSTANT tier with APPROVE_TIER_OVERRIDE (tier=INSTANT)', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'INSTANT' }),
      priority: 14,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER, approveAmount: '1000000' }),
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should use NOTIFY tier with APPROVE_TIER_OVERRIDE (tier=NOTIFY)', async () => {
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'NOTIFY' }),
      priority: 14,
    });

    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER, approveAmount: '1000000' }),
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('should NOT affect non-APPROVE types (TRANSFER passthrough)', async () => {
    // Only approve-related policies
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    await insertPolicy({
      type: 'APPROVE_AMOUNT_LIMIT',
      rules: JSON.stringify({
        blockUnlimited: true,
        maxAmount: '1000000',
      }),
      priority: 14,
    });

    await insertPolicy({
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'INSTANT' }),
      priority: 13,
    });

    // Native TRANSFER -> approve policies not applicable -> INSTANT passthrough
    const result = await engine.evaluate(walletId, tx('1000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should match spender addresses case-insensitively (EVM hex compat)', async () => {
    const mixedCaseSpender = '0x7a250D5630B4cF539739dF2C5dAcB4c659F2488D';
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: mixedCaseSpender.toLowerCase() }],
      }),
      priority: 15,
    });

    // Send with mixed-case spender address -> should still match
    const result = await engine.evaluate(
      walletId,
      approveTx({ spenderAddress: mixedCaseSpender, approveAmount: '1000000' }),
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL'); // default tier
  });
});

// ---------------------------------------------------------------------------
// evaluateBatch tests (10 tests)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - evaluateBatch', () => {
  const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('Phase A: denies entire batch when one TRANSFER violates WHITELIST', async () => {
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['AllowedAddr1'],
      }),
      priority: 20,
    });

    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'AllowedAddr1', chain: 'solana' },
      { type: 'TRANSFER', amount: '200', toAddress: 'NotAllowedAddr', chain: 'solana' },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Batch policy violation');
    expect(result.reason).toContain('[1]');
    expect(result.reason).toContain('TRANSFER');
  });

  it('Phase A: denies entire batch when TOKEN_TRANSFER has no ALLOWED_TOKENS policy', async () => {
    // Need at least one non-passthrough policy
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000',
        notify_max: '200000000000',
        delay_max: '500000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', chain: 'solana' },
      { type: 'TOKEN_TRANSFER', amount: '1000000', toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', chain: 'solana', tokenAddress: USDC_MINT },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Batch policy violation');
    expect(result.reason).toContain('TOKEN_TRANSFER');
  });

  it('Phase A: denies entire batch when CONTRACT_CALL has no CONTRACT_WHITELIST policy', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000',
        notify_max: '200000000000',
        delay_max: '500000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', chain: 'solana' },
      { type: 'CONTRACT_CALL', amount: '0', toAddress: UNISWAP_ROUTER, chain: 'ethereum', contractAddress: UNISWAP_ROUTER },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Batch policy violation');
    expect(result.reason).toContain('CONTRACT_CALL');
  });

  it('Phase A: denies entire batch when APPROVE has no APPROVED_SPENDERS policy', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000',
        notify_max: '200000000000',
        delay_max: '500000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', chain: 'solana' },
      { type: 'APPROVE', amount: '0', toAddress: UNISWAP_ROUTER, chain: 'ethereum', spenderAddress: UNISWAP_ROUTER, approveAmount: '1000000' },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Batch policy violation');
    expect(result.reason).toContain('APPROVE');
  });

  it('Phase A: all pass -> proceeds to Phase B', async () => {
    // WHITELIST with both addresses allowed
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['Addr1', 'Addr2'],
      }),
      priority: 20,
    });

    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'Addr1', chain: 'solana' },
      { type: 'TRANSFER', amount: '200', toAddress: 'Addr2', chain: 'solana' },
    ]);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('Phase B: aggregate SPENDING_LIMIT sums TRANSFER amounts (100+200+300=600 -> NOTIFY)', async () => {
    // SPENDING_LIMIT: instant_max=500, notify_max=1000
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '500',
        notify_max: '1000',
        delay_max: '5000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'Addr1', chain: 'solana' },
      { type: 'TRANSFER', amount: '200', toAddress: 'Addr2', chain: 'solana' },
      { type: 'TRANSFER', amount: '300', toAddress: 'Addr3', chain: 'solana' },
    ]);

    // Aggregate = 600 > instant_max(500) but <= notify_max(1000) -> NOTIFY
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('Phase B: APPROVE_TIER_OVERRIDE max -- batch with TRANSFER (INSTANT) + APPROVE = max(INSTANT, APPROVAL)', async () => {
    // SPENDING_LIMIT: instant_max=1000 (so 100 = INSTANT)
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000',
        notify_max: '10000',
        delay_max: '100000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // APPROVED_SPENDERS to allow the approve through Phase A
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'Addr1', chain: 'solana' },
      { type: 'APPROVE', amount: '0', toAddress: UNISWAP_ROUTER, chain: 'ethereum', spenderAddress: UNISWAP_ROUTER, approveAmount: '1000000' },
    ]);

    // TRANSFER amount=100 -> INSTANT tier from SPENDING_LIMIT
    // APPROVE -> APPROVE_TIER_OVERRIDE default=APPROVAL
    // Final tier = max(INSTANT, APPROVAL) = APPROVAL
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('No policies -> INSTANT passthrough', async () => {
    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'Addr1', chain: 'solana' },
      { type: 'TRANSFER', amount: '200', toAddress: 'Addr2', chain: 'solana' },
    ]);

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('All-or-Nothing: returns violation details with index, type, reason', async () => {
    // WHITELIST that allows Addr1 but not Addr2 or Addr3
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['Addr1'],
      }),
      priority: 20,
    });

    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'Addr1', chain: 'solana' },
      { type: 'TRANSFER', amount: '200', toAddress: 'Addr2', chain: 'solana' },
      { type: 'TRANSFER', amount: '300', toAddress: 'Addr3', chain: 'solana' },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('2 instruction(s) denied');
    expect(result.reason).toContain('[1]');
    expect(result.reason).toContain('[2]');
    expect(result.reason).toContain('whitelist');
  });

  it('Phase B: TOKEN_TRANSFER and APPROVE amounts NOT counted in aggregate SPENDING_LIMIT', async () => {
    // SPENDING_LIMIT: instant_max=500
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '500',
        notify_max: '10000',
        delay_max: '100000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // ALLOWED_TOKENS to pass Phase A for TOKEN_TRANSFER
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT }],
      }),
      priority: 15,
    });

    // APPROVED_SPENDERS to pass Phase A for APPROVE
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER }],
      }),
      priority: 15,
    });

    const result = await engine.evaluateBatch(walletId, [
      { type: 'TRANSFER', amount: '100', toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', chain: 'solana' },
      { type: 'TOKEN_TRANSFER', amount: '99999999', toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', chain: 'solana', tokenAddress: USDC_MINT },
      { type: 'APPROVE', amount: '0', toAddress: UNISWAP_ROUTER, chain: 'ethereum', spenderAddress: UNISWAP_ROUTER, approveAmount: '1000000' },
    ]);

    // Only TRANSFER amount (100) counted for SPENDING_LIMIT: 100 <= 500 -> INSTANT from amount
    // APPROVE present -> max(INSTANT, APPROVAL) = APPROVAL
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });
});

// ---------------------------------------------------------------------------
// Default Deny Toggles tests (11 tests) - TOGGLE-01 ~ TOGGLE-05
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - Default Deny Toggles', () => {
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const UNISWAP_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';

  /** Engine with SettingsService for toggle tests. */
  let toggleEngine: DatabasePolicyEngine;
  let settingsService: SettingsService;

  beforeEach(async () => {
    // Create SettingsService with real DB and default config
    const config = DaemonConfigSchema.parse({});
    settingsService = new SettingsService({
      db: conn.db,
      config,
      masterPassword: 'test-master-password',
    });

    // Engine with SettingsService -- default values mean default_deny=true
    toggleEngine = new DatabasePolicyEngine(conn.db, undefined, settingsService);
  });

  /** Helper: set all 3 toggles to false (allow mode). */
  function setAllTogglesOff(): void {
    settingsService.set('policy.default_deny_tokens', 'false');
    settingsService.set('policy.default_deny_contracts', 'false');
    settingsService.set('policy.default_deny_spenders', 'false');
  }

  // --- TOGGLE-01: default_deny_tokens ---

  it('TOGGLE-01: denies TOKEN_TRANSFER when default_deny_tokens=true (default) and no ALLOWED_TOKENS policy', async () => {
    // Need at least one policy so we bypass the "no policies" passthrough
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '999999999999',
        notify_max: '999999999999',
        delay_max: '999999999999',
        approval_max: '999999999999',
      }),
      priority: 1,
    });

    const result = await toggleEngine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no ALLOWED_TOKENS');
  });

  it('TOGGLE-01: allows TOKEN_TRANSFER when default_deny_tokens=false and no ALLOWED_TOKENS policy', async () => {
    settingsService.set('policy.default_deny_tokens', 'false');
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '999999999999',
        notify_max: '999999999999',
        delay_max: '999999999999',
        approval_max: '999999999999',
      }),
      priority: 1,
    });

    const result = await toggleEngine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(result.allowed).toBe(true);
  });

  // --- TOGGLE-02: default_deny_contracts ---

  it('TOGGLE-02: denies CONTRACT_CALL when default_deny_contracts=true (default) and no CONTRACT_WHITELIST policy', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '999999999999',
        notify_max: '999999999999',
        delay_max: '999999999999',
        approval_max: '999999999999',
      }),
      priority: 1,
    });

    const result = await toggleEngine.evaluate(
      walletId,
      contractCallTx({ contractAddress: UNISWAP_ROUTER }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no CONTRACT_WHITELIST');
  });

  it('TOGGLE-02: allows CONTRACT_CALL when default_deny_contracts=false and no CONTRACT_WHITELIST policy', async () => {
    settingsService.set('policy.default_deny_contracts', 'false');
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '999999999999',
        notify_max: '999999999999',
        delay_max: '999999999999',
        approval_max: '999999999999',
      }),
      priority: 1,
    });

    const result = await toggleEngine.evaluate(
      walletId,
      contractCallTx({ contractAddress: UNISWAP_ROUTER }),
    );
    expect(result.allowed).toBe(true);
  });

  // --- TOGGLE-03: default_deny_spenders ---

  it('TOGGLE-03: denies APPROVE when default_deny_spenders=true (default) and no APPROVED_SPENDERS policy', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '999999999999',
        notify_max: '999999999999',
        delay_max: '999999999999',
        approval_max: '999999999999',
      }),
      priority: 1,
    });

    const result = await toggleEngine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no APPROVED_SPENDERS');
  });

  it('TOGGLE-03: allows APPROVE when default_deny_spenders=false and no APPROVED_SPENDERS policy', async () => {
    settingsService.set('policy.default_deny_spenders', 'false');
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '999999999999',
        notify_max: '999999999999',
        delay_max: '999999999999',
        approval_max: '999999999999',
      }),
      priority: 1,
    });

    const result = await toggleEngine.evaluate(
      walletId,
      approveTx({ spenderAddress: UNISWAP_ROUTER }),
    );
    // With no APPROVED_SPENDERS policy, toggle OFF skips spenders check
    // Then APPROVE_AMOUNT_LIMIT check (default blockUnlimited for large amounts, but 1000000 is below threshold)
    // Then APPROVE_TIER_OVERRIDE (no policy -> default APPROVAL tier)
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  // --- TOGGLE-04: whitelist policy exists -> toggle irrelevant ---

  it('TOGGLE-04: evaluates ALLOWED_TOKENS whitelist normally when policy exists, regardless of toggle=false', async () => {
    setAllTogglesOff();
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT }],
      }),
      priority: 15,
    });

    // Token NOT in whitelist -> deny by whitelist, not by toggle
    const unknownToken = 'UnknownToken11111111111111111111111111111111';
    const result = await toggleEngine.evaluate(walletId, tokenTx('1000', unknownToken));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Token not in allowed list');
  });

  it('TOGGLE-04: evaluates CONTRACT_WHITELIST normally when policy exists, regardless of toggle=false', async () => {
    setAllTogglesOff();
    await insertPolicy({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: UNISWAP_ROUTER, name: 'Uniswap V2 Router' }],
      }),
      priority: 15,
    });

    const unknownContract = '0x1111111111111111111111111111111111111111';
    const result = await toggleEngine.evaluate(
      walletId,
      contractCallTx({ contractAddress: unknownContract }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Contract not whitelisted');
  });

  it('TOGGLE-04: evaluates APPROVED_SPENDERS normally when policy exists, regardless of toggle=false', async () => {
    setAllTogglesOff();
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: UNISWAP_ROUTER, name: 'Uniswap V2 Router' }],
      }),
      priority: 15,
    });

    const unknownSpender = '0x2222222222222222222222222222222222222222';
    const result = await toggleEngine.evaluate(
      walletId,
      approveTx({ spenderAddress: unknownSpender }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Spender not in approved list');
  });

  // --- TOGGLE-05: hot-reload (dynamic toggle change) ---

  it('TOGGLE-05: reflects toggle change on next evaluate() call (hot-reload for tokens)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '999999999999',
        notify_max: '999999999999',
        delay_max: '999999999999',
        approval_max: '999999999999',
      }),
      priority: 1,
    });

    // Initially: default_deny_tokens is 'true' (default) -> deny
    const r1 = await toggleEngine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(r1.allowed).toBe(false);
    expect(r1.reason).toContain('no ALLOWED_TOKENS');

    // Toggle OFF -> allow
    settingsService.set('policy.default_deny_tokens', 'false');
    const r2 = await toggleEngine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(r2.allowed).toBe(true);

    // Toggle back ON -> deny again
    settingsService.set('policy.default_deny_tokens', 'true');
    const r3 = await toggleEngine.evaluate(walletId, tokenTx('1000', USDC_MINT));
    expect(r3.allowed).toBe(false);
    expect(r3.reason).toContain('no ALLOWED_TOKENS');
  });
});

// ---------------------------------------------------------------------------
// USD SPENDING_LIMIT tests (Phase 127-02)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - USD SPENDING_LIMIT', () => {
  /**
   * Test policy: native thresholds = 1 SOL / 10 SOL / 50 SOL
   * USD thresholds = $10 / $100 / $500
   */
  const USD_POLICY_RULES = JSON.stringify({
    instant_max: '1000000000',     // 1 SOL
    notify_max: '10000000000',     // 10 SOL
    delay_max: '50000000000',      // 50 SOL
    delay_seconds: 300,
    instant_max_usd: 10,
    notify_max_usd: 100,
    delay_max_usd: 500,
  });

  it('1. USD only 설정: native INSTANT + usdAmount $150 -> USD APPROVAL > native INSTANT -> APPROVAL', async () => {
    // native: instant_max = 10B lamports, usd: instant_max_usd = 10
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000000000',
        notify_max: '50000000000',
        delay_max: '100000000000',
        delay_seconds: 300,
        instant_max_usd: 10,
        notify_max_usd: 50,
        delay_max_usd: 100,
      }),
      priority: 10,
    });

    // 1 SOL = 1B lamports -> native INSTANT (1B <= 10B)
    // usdAmount = 150 -> $150 > delay_max_usd($100) -> USD APPROVAL
    // maxTier(INSTANT, APPROVAL) = APPROVAL
    const result = await engine.evaluate(walletId, tx('1000000000'));
    // evaluate() does not pass usdAmount, so it should be INSTANT (backward compat)
    expect(result.tier).toBe('INSTANT');

    // Now test via evaluateAndReserve with usdAmount
    const txId = await insertTransaction({ walletId, status: 'PENDING', amount: '1000000000' });
    const result2 = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('1000000000'),
      txId,
      150, // usdAmount = $150
    );
    expect(result2.allowed).toBe(true);
    expect(result2.tier).toBe('APPROVAL');
  });

  it('2. native DELAY + USD INSTANT -> native(DELAY) 보수적 유지', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: USD_POLICY_RULES,
      priority: 10,
    });

    // native: 30 SOL = 30B lamports -> DELAY (10B < 30B <= 50B)
    // usdAmount = $5 -> INSTANT ($5 <= $10)
    // maxTier(DELAY, INSTANT) = DELAY
    const txId = await insertTransaction({ walletId, status: 'PENDING', amount: '30000000000' });
    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('30000000000'),
      txId,
      5, // usdAmount = $5
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.delaySeconds).toBe(300);
  });

  it('3. USD 필드 미설정 (하위 호환): 기존 결과와 동일', async () => {
    // No USD fields, only native
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // 5 SOL = 5B lamports -> NOTIFY (1B < 5B <= 10B)
    // usdAmount provided but no USD thresholds -> native only
    const txId = await insertTransaction({ walletId, status: 'PENDING', amount: '5000000000' });
    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('5000000000'),
      txId,
      1000, // usdAmount = $1000 -- but no USD thresholds configured
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY'); // native only
  });

  it('4. USD NOTIFY: usdAmount > instant_max_usd, <= notify_max_usd -> maxTier 반영', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: USD_POLICY_RULES,
      priority: 10,
    });

    // native: 0.5 SOL = 500M lamports -> INSTANT (500M <= 1B)
    // usdAmount = $50 -> NOTIFY ($10 < $50 <= $100)
    // maxTier(INSTANT, NOTIFY) = NOTIFY
    const txId = await insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('500000000'),
      txId,
      50,
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('5. USD DELAY + delay_seconds: usdAmount > notify_max_usd, <= delay_max_usd -> DELAY + delaySeconds', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: USD_POLICY_RULES,
      priority: 10,
    });

    // native: 0.5 SOL = 500M lamports -> INSTANT (500M <= 1B)
    // usdAmount = $200 -> DELAY ($100 < $200 <= $500)
    // maxTier(INSTANT, DELAY) = DELAY
    const txId = await insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('500000000'),
      txId,
      200,
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.delaySeconds).toBe(300);
  });

  it('6. evaluateAndReserve에서 USD 티어 적용 + reserved_amount 설정', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: USD_POLICY_RULES,
      priority: 10,
    });

    // native: 0.5 SOL = 500M -> INSTANT, usdAmount = $500 -> DELAY
    // maxTier(INSTANT, DELAY) = DELAY
    const txId = await insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('500000000'),
      txId,
      500,
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.delaySeconds).toBe(300);

    // Verify reserved_amount was set
    const row = conn.sqlite
      .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { reserved_amount: string | null };
    expect(row.reserved_amount).toBe('500000000');
  });

  it('7. evaluateBatch Phase B에서 batchUsdAmount 적용 -> maxTier 반영', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: USD_POLICY_RULES,
      priority: 10,
    });

    // Phase B: totalNativeAmount = 100 + 200 = 300 -> INSTANT (300 <= 1B)
    // batchUsdAmount = $150 -> DELAY ($100 < $150 <= $500)
    // maxTier(INSTANT, DELAY) = DELAY
    const result = await engine.evaluateBatch(
      walletId,
      [
        { type: 'TRANSFER', amount: '100', toAddress: 'Addr1', chain: 'solana' },
        { type: 'TRANSFER', amount: '200', toAddress: 'Addr2', chain: 'solana' },
      ],
      150, // batchUsdAmount = $150
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
  });

  it('8. SpendingLimitRulesSchema 검증: instant_max_usd=-1 -> Zod validation error', () => {
    // Direct schema validation
    const bad = SpendingLimitRulesSchema.safeParse({
      instant_max: '1000',
      notify_max: '5000',
      delay_max: '10000',
      delay_seconds: 300,
      instant_max_usd: -1, // negative -> error
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toContain('instant_max_usd');

    // Good schema
    const good = SpendingLimitRulesSchema.safeParse({
      instant_max: '1000',
      notify_max: '5000',
      delay_max: '10000',
      delay_seconds: 300,
      instant_max_usd: 10,
      notify_max_usd: 50,
    });
    expect(good.success).toBe(true);
  });

  it('9. CreatePolicyRequestSchema superRefine: SPENDING_LIMIT rules 검증', () => {
    // Invalid rules for SPENDING_LIMIT
    const invalid = CreatePolicyRequestSchema.safeParse({
      type: 'SPENDING_LIMIT',
      rules: {
        instant_max: 'not-a-number', // invalid: not digits
        notify_max: '5000',
        delay_max: '10000',
        delay_seconds: 300,
      },
    });
    expect(invalid.success).toBe(false);
    // Error should be on rules.instant_max
    const pathStr = JSON.stringify(invalid.error?.issues.map((i) => i.path));
    expect(pathStr).toContain('instant_max');

    // Valid rules for SPENDING_LIMIT
    const valid = CreatePolicyRequestSchema.safeParse({
      type: 'SPENDING_LIMIT',
      rules: {
        instant_max: '1000',
        notify_max: '5000',
        delay_max: '10000',
        delay_seconds: 300,
        instant_max_usd: 10,
      },
    });
    expect(valid.success).toBe(true);
  });

  it('10. usdAmount=0 -> USD 평가 스킵 (네이티브만 사용)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: USD_POLICY_RULES,
      priority: 10,
    });

    // native: 0.5 SOL = 500M -> INSTANT
    // usdAmount = 0 -> skip USD evaluation (usdAmount > 0 조건 미충족)
    const txId = await insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      tx('500000000'),
      txId,
      0, // usdAmount = $0
    );
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // native only
  });
});

// ---------------------------------------------------------------------------
// evaluateSpendingLimit with token_limits tests (Phase 236-02)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - evaluateSpendingLimit with token_limits', () => {
  const USDC_ASSET_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  it('1. TOKEN_TRANSFER with matching CAIP-19 key evaluated in human-readable units -> INSTANT', async () => {
    // Policy: token_limits USDC CAIP-19 key with instant_max=1000 (human-readable USDC)
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        delay_seconds: 300,
        token_limits: {
          [USDC_ASSET_ID]: {
            instant_max: '1000',
            notify_max: '5000',
            delay_max: '50000',
          },
        },
      }),
      priority: 10,
    });

    // Allow TOKEN_TRANSFER through ALLOWED_TOKENS
    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT, assetId: USDC_ASSET_ID }],
      }),
      priority: 15,
    });

    // 500 USDC = 500000000 (6 decimals), should be INSTANT (500 <= 1000)
    const result = await engine.evaluate(walletId, {
      type: 'TOKEN_TRANSFER',
      amount: '500000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
      tokenAddress: USDC_MINT,
      assetId: USDC_ASSET_ID,
      tokenDecimals: 6,
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('2. TOKEN_TRANSFER exceeding token_limits threshold returns NOTIFY', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        delay_seconds: 300,
        token_limits: {
          [USDC_ASSET_ID]: {
            instant_max: '1000',
            notify_max: '5000',
            delay_max: '50000',
          },
        },
      }),
      priority: 10,
    });

    await insertPolicy({
      type: 'ALLOWED_TOKENS',
      rules: JSON.stringify({
        tokens: [{ address: USDC_MINT, assetId: USDC_ASSET_ID }],
      }),
      priority: 15,
    });

    // 2000 USDC = 2000000000 (6 decimals), should be NOTIFY (1000 < 2000 <= 5000)
    const result = await engine.evaluate(walletId, {
      type: 'TOKEN_TRANSFER',
      amount: '2000000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
      tokenAddress: USDC_MINT,
      assetId: USDC_ASSET_ID,
      tokenDecimals: 6,
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('3. TRANSFER with native:solana key evaluated using NATIVE_DECIMALS -> NOTIFY', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        delay_seconds: 300,
        token_limits: {
          'native:solana': {
            instant_max: '1',
            notify_max: '5',
            delay_max: '50',
          },
        },
      }),
      priority: 10,
    });

    // 2 SOL = 2000000000 (9 decimals), should be NOTIFY (1 < 2 <= 5)
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '2000000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('4. TRANSFER with native shorthand key when policy has network -> INSTANT', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        delay_seconds: 300,
        token_limits: {
          'native': {
            instant_max: '1',
            notify_max: '10',
            delay_max: '100',
          },
        },
      }),
      priority: 10,
      // Network-scoped policy -- insertPolicy helper passes walletId=null by default
    });

    // Insert as network-scoped policy
    // We need to update the policy with network field
    conn.sqlite
      .prepare('UPDATE policies SET network = ? WHERE id = (SELECT id FROM policies ORDER BY rowid DESC LIMIT 1)')
      .run('solana-mainnet');

    // 0.5 SOL = 500000000 (9 decimals), should be INSTANT (0.5 <= 1)
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '500000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
      network: 'solana-mainnet',
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('5. No token_limits match falls back to raw fields -> NOTIFY via raw', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',    // 1 SOL in lamports
        notify_max: '5000000000',     // 5 SOL
        delay_max: '50000000000',     // 50 SOL
        delay_seconds: 300,
        token_limits: {
          'native:ethereum': {        // mismatch for solana
            instant_max: '0.001',
            notify_max: '0.01',
            delay_max: '0.1',
          },
        },
      }),
      priority: 10,
    });

    // 2 SOL = 2000000000, using raw fields: 1B < 2B <= 5B -> NOTIFY
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '2000000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('6. No raw fields + no token_limits match -> USD only evaluation (native tier skipped)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        // No raw fields (instant_max, notify_max, delay_max all absent)
        delay_seconds: 300,
        instant_max_usd: 100,
        notify_max_usd: 500,
        delay_max_usd: 5000,
        // No matching token_limits
      }),
      priority: 10,
    });

    // TRANSFER with amount, no matching token_limits, no raw fields
    // Native tier should be INSTANT (skipped), USD tier evaluated by usdAmount
    // Since evaluate() doesn't pass usdAmount, and native tier is INSTANT (skipped) -> INSTANT
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '999999999999',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // native tier skipped -> INSTANT
  });

  it('7. maxTier(USD tier, token tier) -- token tier is more conservative', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        delay_seconds: 300,
        instant_max_usd: 1000,  // USD says INSTANT for $75
        notify_max_usd: 5000,
        delay_max_usd: 50000,
        token_limits: {
          'native:solana': {
            instant_max: '0.1',   // token says NOTIFY for 0.5 SOL
            notify_max: '1',
            delay_max: '10',
          },
        },
      }),
      priority: 10,
    });

    // 0.5 SOL = 500000000 (9 decimals)
    // token tier: 0.1 < 0.5 <= 1 -> NOTIFY
    // USD tier: $75 <= $1000 -> INSTANT (via evaluateAndReserve with usdAmount)
    // maxTier(INSTANT, NOTIFY) = NOTIFY
    const txId = await insertTransaction({ walletId, status: 'PENDING', amount: '500000000' });
    const result = engineWithSqlite.evaluateAndReserve(
      walletId,
      {
        type: 'TRANSFER',
        amount: '500000000',
        toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        chain: 'solana',
      },
      txId,
      75, // usdAmount = $75
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('8. APPROVE with CAIP-19 token_limits (no APPROVE_TIER_OVERRIDE) -> NOTIFY', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        delay_seconds: 300,
        token_limits: {
          [USDC_ASSET_ID]: {
            instant_max: '100',
            notify_max: '1000',
            delay_max: '10000',
          },
        },
      }),
      priority: 10,
    });

    // APPROVED_SPENDERS to allow APPROVE through
    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' }],
      }),
      priority: 15,
    });

    // Override default APPROVE_TIER_OVERRIDE with INSTANT to not interfere
    // Actually, APPROVE_TIER_OVERRIDE returns FINAL result and skips SPENDING_LIMIT.
    // So to test APPROVE with token_limits, we need NO APPROVE_TIER_OVERRIDE,
    // but the default behavior when no APPROVE_TIER_OVERRIDE exists is to return APPROVAL.
    // This means APPROVE without APPROVE_TIER_OVERRIDE always returns APPROVAL tier,
    // and SPENDING_LIMIT is never reached for APPROVE.
    //
    // The plan says "APPROVE + APPROVE_TIER_OVERRIDE skips evaluateSpendingLimit entirely"
    // which is the EXISTING behavior. So this test (APPROVE without APPROVE_TIER_OVERRIDE)
    // should actually return APPROVAL (default), not go through SPENDING_LIMIT.
    //
    // Wait - re-reading the plan: test 8 says "APPROVE with CAIP-19 token_limits (no APPROVE_TIER_OVERRIDE)"
    // Expected: NOTIFY (100 < 500 <= 1000)
    // This means the plan expects APPROVE WITHOUT override to go through SPENDING_LIMIT.
    // But current code: evaluateApproveTierOverride returns APPROVAL when no policy exists.
    // This would need a code change to allow APPROVE through to SPENDING_LIMIT when no override.
    //
    // Actually, looking more carefully at the existing code (line 1260-1262):
    // "if (!approveTierPolicy) return { allowed: true, tier: 'APPROVAL' }"
    // This means APPROVE ALWAYS gets APPROVAL tier when no override, skipping SPENDING_LIMIT.
    //
    // The plan says to test APPROVE WITH token_limits. For APPROVE to use token_limits,
    // we need APPROVE_TIER_OVERRIDE to NOT exist AND the code to NOT default to APPROVAL.
    // But that would change existing behavior.
    //
    // Reading plan test 9: "APPROVE + APPROVE_TIER_OVERRIDE skips token_limits"
    // This implies test 8 (no override) DOES go through token_limits.
    // This is a semantic change: without APPROVE_TIER_OVERRIDE, APPROVE goes through SPENDING_LIMIT.
    //
    // BUT the must_haves say: "APPROVE + APPROVE_TIER_OVERRIDE skips evaluateSpendingLimit entirely"
    // The current code already does this. The question is what happens without APPROVE_TIER_OVERRIDE.
    // Currently: default APPROVAL. Plan wants: go through SPENDING_LIMIT with token_limits.
    //
    // This IS a change from existing behavior. We'll write the test expecting NOTIFY
    // as the plan specifies. The GREEN phase will need to handle this.
    //
    // Actually wait - currently, WITHOUT override, APPROVE defaults to APPROVAL tier.
    // The plan test 8 expects NOTIFY for 500 USDC with token_limits.
    // We'd need to remove the default APPROVAL behavior for APPROVE when no override exists.
    // That's a significant change... but the plan explicitly asks for it.
    //
    // Re-reading the plan more carefully: the test says "no APPROVE_TIER_OVERRIDE" policy,
    // but the current default behavior creates APPROVAL tier. This test expects SPENDING_LIMIT
    // to handle APPROVE. Let me follow the plan as written.

    // 500 USDC = 500000000 (6 decimals), APPROVE type, no APPROVE_TIER_OVERRIDE
    // Expected: Goes to SPENDING_LIMIT with token_limits, NOTIFY (100 < 500 <= 1000)
    const result = await engine.evaluate(walletId, {
      type: 'APPROVE',
      amount: '500000000',
      toAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      chain: 'solana',
      spenderAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      approveAmount: '500000000',
      assetId: USDC_ASSET_ID,
      tokenDecimals: 6,
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('9. APPROVE + APPROVE_TIER_OVERRIDE skips token_limits -> DELAY from override', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        delay_seconds: 300,
        token_limits: {
          [USDC_ASSET_ID]: {
            instant_max: '100',
            notify_max: '1000',
            delay_max: '10000',
          },
        },
      }),
      priority: 10,
    });

    await insertPolicy({
      type: 'APPROVED_SPENDERS',
      rules: JSON.stringify({
        spenders: [{ address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' }],
      }),
      priority: 15,
    });

    // APPROVE_TIER_OVERRIDE forces DELAY
    await insertPolicy({
      type: 'APPROVE_TIER_OVERRIDE',
      rules: JSON.stringify({ tier: 'DELAY' }),
      priority: 14,
    });

    // With APPROVE_TIER_OVERRIDE, token_limits never evaluated
    const result = await engine.evaluate(walletId, {
      type: 'APPROVE',
      amount: '500000000',
      toAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      chain: 'solana',
      spenderAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      approveAmount: '500000000',
      assetId: USDC_ASSET_ID,
      tokenDecimals: 6,
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
  });

  it('10. CONTRACT_CALL skips token_limits -> uses raw fields', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000',
        notify_max: '5000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
        token_limits: {
          'native:solana': {
            instant_max: '0.0001', // Very restrictive token limit
            notify_max: '0.001',
            delay_max: '0.01',
          },
        },
      }),
      priority: 10,
    });

    // Allow CONTRACT_CALL through
    await insertPolicy({
      type: 'CONTRACT_WHITELIST',
      rules: JSON.stringify({
        contracts: [{ address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' }],
      }),
      priority: 15,
    });

    // CONTRACT_CALL with 5 SOL = 5000000000 -> should use raw fields, not token_limits
    // Raw: instant_max(1B) < 5B <= notify_max(5B) -> NOTIFY (not APPROVAL from token_limits)
    const result = await engine.evaluate(walletId, {
      type: 'CONTRACT_CALL',
      amount: '5000000000',
      toAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      chain: 'ethereum',
      contractAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('11. evaluateNativeTier undefined guard -- raw fields undefined returns INSTANT', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        // No raw fields, only token_limits (no match for this chain) and no USD
        delay_seconds: 300,
        token_limits: {
          'native:ethereum': {   // no match for solana TRANSFER
            instant_max: '0.001',
            notify_max: '0.01',
            delay_max: '0.1',
          },
        },
      }),
      priority: 10,
    });

    // TRANSFER on solana -- no matching token_limits, no raw fields
    // evaluateNativeTier should return INSTANT (not crash on BigInt(undefined))
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '999999999999999',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT'); // native tier skipped, no crash
  });
});
