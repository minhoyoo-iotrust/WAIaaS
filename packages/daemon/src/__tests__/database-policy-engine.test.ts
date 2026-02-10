/**
 * TDD tests for DatabasePolicyEngine.
 *
 * Tests DB-backed policy evaluation with SPENDING_LIMIT 4-tier classification
 * and WHITELIST address filtering.
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
