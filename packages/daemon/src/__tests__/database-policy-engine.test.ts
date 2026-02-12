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
import { agents, policies } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let engine: DatabasePolicyEngine;
let engineWithSqlite: DatabasePolicyEngine;
let agentId: string;

async function insertTestAgent(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(agents).values({
    id,
    name: 'test-agent',
    chain: 'solana',
    network: 'devnet',
    publicKey: '11111111111111111111111111111112',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertPolicy(overrides: {
  agentId?: string | null;
  type: string;
  rules: string;
  priority?: number;
  enabled?: boolean;
}): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id,
    agentId: overrides.agentId ?? null,
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
  agentId: string;
  status?: string;
  amount?: string;
  reservedAmount?: string | null;
}): Promise<string> {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  conn.sqlite
    .prepare(
      `INSERT INTO transactions (id, agent_id, chain, type, amount, to_address, status, reserved_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      overrides.agentId,
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
  agentId = await insertTestAgent();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// SPENDING_LIMIT tests (7 tests)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - SPENDING_LIMIT', () => {
  it('should return INSTANT passthrough when no policies exist', async () => {
    const result = await engine.evaluate(agentId, tx('500000000'));

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
    const result = await engine.evaluate(agentId, tx('500000000'));

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
    const result = await engine.evaluate(agentId, tx('5000000000'));

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
    const result = await engine.evaluate(agentId, tx('30000000000'));

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
    const result = await engine.evaluate(agentId, tx('100000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('should use agent-specific policy over global policy of same type', async () => {
    // Global: generous limits
    await insertPolicy({
      agentId: null,
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
      agentId,
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
    const result = await engine.evaluate(agentId, tx('5000000000'));

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
    const result = await engine.evaluate(agentId, tx('999999999999'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ---------------------------------------------------------------------------
// WHITELIST tests (5 tests)
// ---------------------------------------------------------------------------

describe('DatabasePolicyEngine - WHITELIST', () => {
  it('should allow transaction when no whitelist policy exists', async () => {
    const result = await engine.evaluate(agentId, tx('1000'));

    expect(result.allowed).toBe(true);
  });

  it('should allow transaction when whitelist has empty allowed_addresses', async () => {
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({ allowed_addresses: [] }),
      priority: 20,
    });

    const result = await engine.evaluate(agentId, tx('1000'));

    expect(result.allowed).toBe(true);
  });

  it('should allow transaction when toAddress is in whitelist', async () => {
    const target = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({ allowed_addresses: [target, 'AnotherAddr123'] }),
      priority: 20,
    });

    const result = await engine.evaluate(agentId, tx('1000', target));

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
      agentId,
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
      agentId,
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
      agentId,
      tx('500000000', 'NotWhitelisted'),
    );

    expect(result.allowed).toBe(false);
  });

  it('should override global SPENDING_LIMIT with agent-specific SPENDING_LIMIT', async () => {
    // Global policy
    await insertPolicy({
      agentId: null,
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
      agentId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000000000', // 100 SOL
        notify_max: '200000000000',
        delay_max: '500000000000',
        delay_seconds: 600,
      }),
      priority: 10,
    });

    // 50 SOL: would be DELAY under global but INSTANT under agent-specific
    const result = await engine.evaluate(agentId, tx('50000000000'));

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
      agentId,
      status: 'PENDING',
      amount: '5000000000',
    });

    // Evaluate and reserve 5 SOL (under 10 SOL instant_max)
    const result = engineWithSqlite.evaluateAndReserve(
      agentId,
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
      agentId,
      status: 'PENDING',
      amount: '5000000000',
    });
    const result1 = engineWithSqlite.evaluateAndReserve(
      agentId,
      tx('5000000000'),
      txId1,
    );
    expect(result1.tier).toBe('INSTANT');

    // Second request: 6 SOL
    // Without TOCTOU: 6 SOL alone would be INSTANT (6 <= 10)
    // With TOCTOU: effective = 5 (reserved) + 6 = 11 -> NOTIFY (11 > 10, 11 <= 50)
    const txId2 = await insertTransaction({
      agentId,
      status: 'PENDING',
      amount: '6000000000',
    });
    const result2 = engineWithSqlite.evaluateAndReserve(
      agentId,
      tx('6000000000'),
      txId2,
    );

    expect(result2.tier).toBe('NOTIFY');
  });

  it('should release reservation when releaseReservation is called', async () => {
    // Create a transaction with reserved amount
    const txId = await insertTransaction({
      agentId,
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
    const result = await engine.evaluate(agentId, tokenTx('1000000', USDC_MINT));

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

    const result = await engine.evaluate(agentId, tokenTx('1000000', USDC_MINT));

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
    const result = await engine.evaluate(agentId, tokenTx('1000000', unknownMint));

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
    const result = await engine.evaluate(agentId, tokenTx('1000000', evmToken));

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
    const result = await engine.evaluate(agentId, tx('1000000000'));

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
    const result = await engine.evaluate(agentId, {
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
    const result = await engine.evaluate(agentId, tokenTx('5000000', USDC_MINT));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
    const result = await engine.evaluate(agentId, tx('1000000000'));

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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
      agentId,
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
    const result = await engine.evaluate(agentId, tx('1000000000'));

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
      agentId,
      approveTx({ spenderAddress: mixedCaseSpender, approveAmount: '1000000' }),
    );

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL'); // default tier
  });
});
