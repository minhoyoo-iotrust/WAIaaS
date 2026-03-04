/**
 * TDD tests for REPUTATION_THRESHOLD policy evaluation.
 *
 * Tests the evaluateReputationThreshold integration in DatabasePolicyEngine,
 * including maxTier escalation, unrated handling, and check_counterparty flag.
 *
 * Uses in-memory SQLite + Drizzle with mock ReputationCacheService.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, policies, agentIdentities } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import type { ReputationCacheService, ReputationScore } from '../services/erc8004/reputation-cache-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let walletId: string;

const COUNTERPARTY_ADDRESS = '0xCOUNTERPARTY1234567890abcdef1234567890ab';
const COUNTERPARTY_AGENT_ID = '99999';

function createMockReputationCache(
  score: number | null,
): ReputationCacheService {
  const mockScore: ReputationScore | null =
    score !== null
      ? {
          score,
          rawScore: String(score),
          decimals: 0,
          count: 10,
          cachedAt: Math.floor(Date.now() / 1000),
        }
      : null;

  return {
    getReputation: vi.fn().mockResolvedValue(mockScore),
    invalidate: vi.fn(),
    invalidateAll: vi.fn(),
  } as unknown as ReputationCacheService;
}

async function insertTestWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'ethereum',
    environment: 'mainnet',
    publicKey: '0xABCDEF1234567890abcdef1234567890abcdef12',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertCounterpartyIdentity(walletPublicKey: string): Promise<void> {
  // Create a wallet for the counterparty
  const counterpartyWalletId = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id: counterpartyWalletId,
    name: 'counterparty-wallet',
    chain: 'ethereum',
    environment: 'mainnet',
    publicKey: walletPublicKey,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  // Create agent identity for the counterparty
  await conn.db.insert(agentIdentities).values({
    id: generateId(),
    walletId: counterpartyWalletId,
    chainAgentId: COUNTERPARTY_AGENT_ID,
    registryAddress: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    chainId: 1,
    status: 'REGISTERED',
    createdAt: now,
    updatedAt: now,
  });
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

function tx(
  amount: string,
  toAddress = COUNTERPARTY_ADDRESS,
) {
  return { type: 'TRANSFER', amount, toAddress, chain: 'ethereum' };
}

function reputationRules(overrides?: Partial<{
  min_score: number;
  below_threshold_tier: string;
  unrated_tier: string;
  tag1: string;
  tag2: string;
  check_counterparty: boolean;
}>): string {
  return JSON.stringify({
    min_score: overrides?.min_score ?? 50,
    below_threshold_tier: overrides?.below_threshold_tier ?? 'APPROVAL',
    unrated_tier: overrides?.unrated_tier ?? 'APPROVAL',
    tag1: overrides?.tag1 ?? '',
    tag2: overrides?.tag2 ?? '',
    check_counterparty: overrides?.check_counterparty ?? true,
  });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks();
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  walletId = await insertTestWallet();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('REPUTATION_THRESHOLD policy evaluation', () => {
  it('a. No REPUTATION_THRESHOLD policy -> INSTANT passthrough', async () => {
    // No policies at all
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const result = await engine.evaluate(walletId, tx('1000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('b. check_counterparty=false -> skip (INSTANT)', async () => {
    const mockCache = createMockReputationCache(30); // Low score, but should be skipped
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, undefined, mockCache);

    await insertPolicy({
      walletId: null,
      type: 'REPUTATION_THRESHOLD',
      rules: reputationRules({ check_counterparty: false }),
    });

    const result = await engine.evaluate(walletId, tx('1000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
    expect(mockCache.getReputation).not.toHaveBeenCalled();
  });

  it('c. check_counterparty=true, score >= min_score -> no escalation (INSTANT)', async () => {
    const mockCache = createMockReputationCache(80); // Above 50 threshold
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, undefined, mockCache);

    await insertCounterpartyIdentity(COUNTERPARTY_ADDRESS);
    await insertPolicy({
      walletId: null,
      type: 'REPUTATION_THRESHOLD',
      rules: reputationRules({ min_score: 50 }),
    });

    const result = await engine.evaluate(walletId, tx('1000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('d. check_counterparty=true, score < min_score -> escalates to below_threshold_tier', async () => {
    const mockCache = createMockReputationCache(30); // Below 50 threshold
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, undefined, mockCache);

    await insertCounterpartyIdentity(COUNTERPARTY_ADDRESS);
    await insertPolicy({
      walletId: null,
      type: 'REPUTATION_THRESHOLD',
      rules: reputationRules({ min_score: 50, below_threshold_tier: 'DELAY' }),
    });

    const result = await engine.evaluate(walletId, tx('1000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
  });

  it('e. check_counterparty=true, unrated (null) -> applies unrated_tier', async () => {
    const mockCache = createMockReputationCache(null); // No reputation data
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, undefined, mockCache);

    await insertCounterpartyIdentity(COUNTERPARTY_ADDRESS);
    await insertPolicy({
      walletId: null,
      type: 'REPUTATION_THRESHOLD',
      rules: reputationRules({ unrated_tier: 'APPROVAL' }),
    });

    const result = await engine.evaluate(walletId, tx('1000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('f. escalation only: SPENDING_LIMIT NOTIFY + reputation DELAY -> DELAY', async () => {
    const mockCache = createMockReputationCache(30); // Below threshold -> DELAY
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, undefined, mockCache);

    await insertCounterpartyIdentity(COUNTERPARTY_ADDRESS);
    await insertPolicy({
      walletId: null,
      type: 'REPUTATION_THRESHOLD',
      rules: reputationRules({ min_score: 50, below_threshold_tier: 'DELAY' }),
    });
    await insertPolicy({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '500',
        notify_max: '5000',
        delay_max: '50000',
        delay_seconds: 60,
      }),
    });

    // Amount 1000 > instant_max 500 but < notify_max 5000 -> NOTIFY from spending
    // Reputation says DELAY -> max(NOTIFY, DELAY) = DELAY
    const result = await engine.evaluate(walletId, tx('1000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
  });

  it('g. no downgrade: SPENDING_LIMIT APPROVAL + reputation NOTIFY -> APPROVAL', async () => {
    const mockCache = createMockReputationCache(30); // Below threshold -> NOTIFY
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, undefined, mockCache);

    await insertCounterpartyIdentity(COUNTERPARTY_ADDRESS);
    await insertPolicy({
      walletId: null,
      type: 'REPUTATION_THRESHOLD',
      rules: reputationRules({ min_score: 50, below_threshold_tier: 'NOTIFY' }),
    });
    await insertPolicy({
      walletId: null,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100',
        notify_max: '200',
        delay_max: '300',
        delay_seconds: 60,
      }),
    });

    // Amount 500 > delay_max 300 -> APPROVAL from spending
    // Reputation says NOTIFY -> max(APPROVAL, NOTIFY) = APPROVAL (no downgrade)
    const result = await engine.evaluate(walletId, tx('500'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });

  it('h. tag1/tag2 from policy rules are passed to getReputation', async () => {
    const mockCache = createMockReputationCache(80);
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, undefined, mockCache);

    await insertCounterpartyIdentity(COUNTERPARTY_ADDRESS);
    await insertPolicy({
      walletId: null,
      type: 'REPUTATION_THRESHOLD',
      rules: reputationRules({ tag1: 'reliability', tag2: 'speed', check_counterparty: true }),
    });

    await engine.evaluate(walletId, tx('1000'));
    expect(mockCache.getReputation).toHaveBeenCalledWith(COUNTERPARTY_AGENT_ID, 'reliability', 'speed');
  });

  it('i. evaluateAndReserve respects reputationFloorTier parameter', () => {
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite);

    // No policies -> normally INSTANT, but reputationFloorTier forces DELAY
    const result = engine.evaluateAndReserve(walletId, tx('1000'), 'test-tx-id', undefined, 'DELAY');
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
  });

  it('j. no reputationCacheService -> treats as unrated for check_counterparty=true', async () => {
    // No mock cache -> constructor gets undefined
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite);

    await insertCounterpartyIdentity(COUNTERPARTY_ADDRESS);
    await insertPolicy({
      walletId: null,
      type: 'REPUTATION_THRESHOLD',
      rules: reputationRules({ check_counterparty: true, unrated_tier: 'DELAY' }),
    });

    const result = await engine.evaluate(walletId, tx('1000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('DELAY');
  });

  it('counterparty not in agent_identities -> treated as unrated', async () => {
    const mockCache = createMockReputationCache(80); // Good score, but won't be looked up
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, undefined, mockCache);

    // Don't insert counterparty identity -> toAddress has no matching agent
    await insertPolicy({
      walletId: null,
      type: 'REPUTATION_THRESHOLD',
      rules: reputationRules({ check_counterparty: true, unrated_tier: 'APPROVAL' }),
    });

    const result = await engine.evaluate(walletId, tx('1000'));
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
    // getReputation should NOT be called because no agentId could be resolved
    expect(mockCache.getReputation).not.toHaveBeenCalled();
  });
});
