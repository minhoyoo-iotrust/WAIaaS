/**
 * Policy engine coverage audit: edge-case gap tests for DatabasePolicyEngine.
 *
 * Supplements existing 17 tests in database-policy-engine.test.ts.
 *
 * Coverage gaps addressed:
 * - Boundary values: amount exactly equal to instant_max, notify_max, delay_max
 * - Combined policy types: WHITELIST + SPENDING_LIMIT interactions
 * - Edge case: zero amount transaction
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
let agentId: string;

async function insertTestAgent(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(agents).values({
    id,
    name: 'audit-agent',
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  engine = new DatabasePolicyEngine(conn.db);
  agentId = await insertTestAgent();
});

afterEach(() => {
  conn.sqlite.close();
});

// ===========================================================================
// BOUNDARY VALUE TESTS
// ===========================================================================

describe('DatabasePolicyEngine - Boundary Values (coverage audit)', () => {
  const SPENDING_LIMIT_RULES = JSON.stringify({
    instant_max: '1000000000',   // 1 SOL
    notify_max: '10000000000',   // 10 SOL
    delay_max: '50000000000',    // 50 SOL
    delay_seconds: 300,
  });

  it('should classify amount exactly equal to instant_max as INSTANT (<= boundary)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: SPENDING_LIMIT_RULES,
      priority: 10,
    });

    // Amount == instant_max (1 SOL exactly)
    const result = await engine.evaluate(agentId, tx('1000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('should classify amount exactly equal to notify_max as NOTIFY (<= boundary)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: SPENDING_LIMIT_RULES,
      priority: 10,
    });

    // Amount == notify_max (10 SOL exactly)
    const result = await engine.evaluate(agentId, tx('10000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('should classify amount exactly equal to delay_max as DELAY (<= boundary)', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: SPENDING_LIMIT_RULES,
      priority: 10,
    });

    // Amount == delay_max (50 SOL exactly)
    const result = await engine.evaluate(agentId, tx('50000000000'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
    expect(result.delaySeconds).toBe(300);
  });

  it('should classify amount 1 lamport above instant_max as NOTIFY', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: SPENDING_LIMIT_RULES,
      priority: 10,
    });

    // instant_max + 1
    const result = await engine.evaluate(agentId, tx('1000000001'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('should classify amount 1 lamport above delay_max as APPROVAL', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: SPENDING_LIMIT_RULES,
      priority: 10,
    });

    // delay_max + 1
    const result = await engine.evaluate(agentId, tx('50000000001'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });
});

// ===========================================================================
// COMBINED POLICY TESTS
// ===========================================================================

describe('DatabasePolicyEngine - Combined WHITELIST + SPENDING_LIMIT (coverage audit)', () => {
  it('should allow whitelisted address and determine tier via SPENDING_LIMIT', async () => {
    const whitelistedAddr = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';

    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({ allowed_addresses: [whitelistedAddr] }),
      priority: 20,
    });

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

    // Whitelisted address with amount in NOTIFY range
    const result = await engine.evaluate(agentId, tx('5000000000', whitelistedAddr));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('NOTIFY');
  });

  it('should deny non-whitelisted address regardless of amount', async () => {
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['AllowedAddr1', 'AllowedAddr2'],
      }),
      priority: 20,
    });

    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '1000000000000', // Very high limit
        notify_max: '10000000000000',
        delay_max: '50000000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // Non-whitelisted address with tiny amount (would be INSTANT if whitelist passed)
    const result = await engine.evaluate(agentId, tx('100', 'NotWhitelisted'));

    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain('whitelist');
  });

  it('should allow any address when whitelist has empty allowed_addresses alongside SPENDING_LIMIT', async () => {
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({ allowed_addresses: [] }), // inactive whitelist
      priority: 20,
    });

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

    // Any address should pass since whitelist is inactive
    const result = await engine.evaluate(agentId, tx('500000000', 'AnyAddress'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});

// ===========================================================================
// ZERO AMOUNT EDGE CASE
// ===========================================================================

describe('DatabasePolicyEngine - Zero Amount (coverage audit)', () => {
  it('should classify zero amount transaction as INSTANT', async () => {
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

    // Amount = 0 (below all thresholds)
    const result = await engine.evaluate(agentId, tx('0'));

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });
});
