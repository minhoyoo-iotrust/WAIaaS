/**
 * Unit tests for Perp Provider types and Perp infrastructure extensions.
 *
 * Tests: Zod schema validation, IPerpProvider type contracts, policy type
 * registration, non-spending classification, TransactionParam extensions.
 * @see PERP-01, PERP-02
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PerpPositionSummarySchema,
  MarginInfoSchema,
  PerpMarketInfoSchema,
  POLICY_TYPES,
} from '@waiaas/core';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, policies } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let engine: DatabasePolicyEngine;
let walletId: string;

async function insertTestWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'testnet',
    publicKey: `pk-${id}`,
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

function perpTx(actionName: string, contractAddress = '0xDriftProgram') {
  return {
    type: 'CONTRACT_CALL',
    amount: '0',
    toAddress: contractAddress,
    chain: 'solana',
    contractAddress,
    actionProvider: 'drift',
    actionName,
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);

  // Create SettingsService with default_deny_contracts=false so CONTRACT_WHITELIST
  // doesn't block perp CONTRACT_CALL transactions (perp actions use provider-trust
  // in production; in tests we just disable default-deny for contracts)
  const config = DaemonConfigSchema.parse({});
  const ss = new SettingsService({
    db: conn.db,
    config,
    masterPassword: 'test-master-password',
  });
  ss.set('policy.default_deny_contracts', 'false');

  engine = new DatabasePolicyEngine(conn.db, conn.sqlite, ss);
  walletId = await insertTestWallet();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// PerpPositionSummarySchema
// ---------------------------------------------------------------------------

describe('PerpPositionSummarySchema', () => {
  it('parses valid position data', () => {
    const data = {
      market: 'SOL-PERP',
      direction: 'LONG',
      size: '100',
      entryPrice: 150.5,
      leverage: 10,
      unrealizedPnl: 25.3,
      margin: 1505.0,
      liquidationPrice: 135.0,
    };
    const result = PerpPositionSummarySchema.parse(data);
    expect(result.market).toBe('SOL-PERP');
    expect(result.direction).toBe('LONG');
    expect(result.leverage).toBe(10);
  });

  it('rejects invalid direction value', () => {
    const data = {
      market: 'SOL-PERP',
      direction: 'FLAT',
      size: '100',
      entryPrice: 150.5,
      leverage: 10,
      unrealizedPnl: null,
      margin: null,
      liquidationPrice: null,
    };
    expect(() => PerpPositionSummarySchema.parse(data)).toThrow();
  });

  it('accepts nullable fields as null', () => {
    const data = {
      market: 'ETH-PERP',
      direction: 'SHORT',
      size: '50',
      entryPrice: null,
      leverage: 5,
      unrealizedPnl: null,
      margin: null,
      liquidationPrice: null,
    };
    const result = PerpPositionSummarySchema.parse(data);
    expect(result.entryPrice).toBeNull();
    expect(result.unrealizedPnl).toBeNull();
    expect(result.margin).toBeNull();
    expect(result.liquidationPrice).toBeNull();
  });

  it('accepts negative leverage (Zod does not restrict)', () => {
    const data = {
      market: 'SOL-PERP',
      direction: 'LONG',
      size: '10',
      entryPrice: 100,
      leverage: -5,
      unrealizedPnl: null,
      margin: null,
      liquidationPrice: null,
    };
    const result = PerpPositionSummarySchema.parse(data);
    expect(result.leverage).toBe(-5);
  });
});

// ---------------------------------------------------------------------------
// MarginInfoSchema
// ---------------------------------------------------------------------------

describe('MarginInfoSchema', () => {
  it('parses valid margin data', () => {
    const data = {
      totalMargin: 10000,
      freeMargin: 5000,
      maintenanceMarginRatio: 0.05,
      marginRatio: 2.5,
      status: 'safe',
    };
    const result = MarginInfoSchema.parse(data);
    expect(result.status).toBe('safe');
    expect(result.marginRatio).toBe(2.5);
  });

  it('validates status enum (safe/warning/danger/critical)', () => {
    for (const status of ['safe', 'warning', 'danger', 'critical'] as const) {
      const data = {
        totalMargin: 1000,
        freeMargin: 500,
        maintenanceMarginRatio: 0.05,
        marginRatio: 1.0,
        status,
      };
      expect(MarginInfoSchema.parse(data).status).toBe(status);
    }
  });

  it('rejects invalid status value', () => {
    const data = {
      totalMargin: 1000,
      freeMargin: 500,
      maintenanceMarginRatio: 0.05,
      marginRatio: 1.0,
      status: 'unknown',
    };
    expect(() => MarginInfoSchema.parse(data)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// PerpMarketInfoSchema
// ---------------------------------------------------------------------------

describe('PerpMarketInfoSchema', () => {
  it('parses valid market data', () => {
    const data = {
      market: 'SOL-PERP',
      baseAsset: 'SOL',
      maxLeverage: 20,
      fundingRate: 0.001,
      openInterest: 5000000,
      oraclePrice: 150.25,
    };
    const result = PerpMarketInfoSchema.parse(data);
    expect(result.market).toBe('SOL-PERP');
    expect(result.maxLeverage).toBe(20);
  });

  it('accepts nullable fields as null', () => {
    const data = {
      market: 'BTC-PERP',
      baseAsset: 'BTC',
      maxLeverage: 50,
      fundingRate: null,
      openInterest: null,
      oraclePrice: null,
    };
    const result = PerpMarketInfoSchema.parse(data);
    expect(result.fundingRate).toBeNull();
    expect(result.openInterest).toBeNull();
    expect(result.oraclePrice).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POLICY_TYPES includes perp types
// ---------------------------------------------------------------------------

describe('POLICY_TYPES perp type registration', () => {
  it('includes PERP_MAX_LEVERAGE', () => {
    expect(POLICY_TYPES).toContain('PERP_MAX_LEVERAGE');
  });

  it('includes PERP_MAX_POSITION_USD', () => {
    expect(POLICY_TYPES).toContain('PERP_MAX_POSITION_USD');
  });

  it('includes PERP_ALLOWED_MARKETS', () => {
    expect(POLICY_TYPES).toContain('PERP_ALLOWED_MARKETS');
  });
});

// ---------------------------------------------------------------------------
// DB CHECK constraint accepts perp policy types
// ---------------------------------------------------------------------------

describe('DB CHECK constraint - perp policy INSERT', () => {
  it('accepts PERP_MAX_LEVERAGE policy', async () => {
    const id = await insertPolicy({
      walletId,
      type: 'PERP_MAX_LEVERAGE',
      rules: JSON.stringify({ maxLeverage: 10, warningLeverage: 5 }),
    });
    expect(id).toBeTruthy();
  });

  it('accepts PERP_MAX_POSITION_USD policy', async () => {
    const id = await insertPolicy({
      walletId,
      type: 'PERP_MAX_POSITION_USD',
      rules: JSON.stringify({ maxPositionUsd: 10000, warningPositionUsd: 8000 }),
    });
    expect(id).toBeTruthy();
  });

  it('accepts PERP_ALLOWED_MARKETS policy', async () => {
    const id = await insertPolicy({
      walletId,
      type: 'PERP_ALLOWED_MARKETS',
      rules: JSON.stringify({
        markets: [{ market: 'SOL-PERP', name: 'Solana Perp' }],
      }),
    });
    expect(id).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Non-spending classification - perp actions
// ---------------------------------------------------------------------------

describe('Non-spending classification - perp actions', () => {
  beforeEach(async () => {
    // Need PERP_ALLOWED_MARKETS so Step 4i default-deny passes before Step 5
    await insertPolicy({
      walletId,
      type: 'PERP_ALLOWED_MARKETS',
      rules: JSON.stringify({
        markets: [{ market: '0xDriftProgram' }],
      }),
    });

    // Insert a tight SPENDING_LIMIT policy
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100',
        notify_max: '1000',
        delay_max: '10000',
        delay_seconds: 300,
      }),
    });
  });

  it('close_position skips SPENDING_LIMIT (non-spending)', async () => {
    const result = await engine.evaluate(walletId, {
      ...perpTx('close_position'),
      amount: '999999999', // Exceeds all spending limits
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('add_margin skips SPENDING_LIMIT (non-spending)', async () => {
    const result = await engine.evaluate(walletId, {
      ...perpTx('add_margin'),
      amount: '999999999',
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('INSTANT');
  });

  it('open_position is subject to SPENDING_LIMIT (spending)', async () => {
    const result = await engine.evaluate(walletId, {
      ...perpTx('open_position'),
      amount: '999999999', // Exceeds delay_max -> should be APPROVAL
    });
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe('APPROVAL');
  });
});
