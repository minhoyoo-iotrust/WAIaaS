/**
 * Tests for VENUE_WHITELIST policy evaluation.
 *
 * Covers:
 * 1. venue absent -> policy not evaluated
 * 2. venue_whitelist_enabled=false -> policy not evaluated
 * 3. venue_whitelist_enabled=true + no policy + venue present -> DENY (default-deny)
 * 4. venue_whitelist_enabled=true + policy + venue allowed -> pass
 * 5. venue_whitelist_enabled=true + policy + venue not allowed -> DENY
 * 6. Case insensitive venue matching
 * 7. Coexistence with SPENDING_LIMIT
 *
 * Plan 389-02 Task 1
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
let walletId: string;

async function insertTestWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'testnet',
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
}): Promise<void> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id,
    walletId: overrides.walletId ?? null,
    type: overrides.type,
    rules: overrides.rules,
    priority: overrides.priority ?? 0,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
}

function createSettings(overrides: Record<string, string> = {}): SettingsService {
  const config = DaemonConfigSchema.parse({});
  const settings = new SettingsService({ db: conn.db, config, masterPassword: 'test-pw' });
  for (const [key, value] of Object.entries(overrides)) {
    try {
      settings.set(key, value);
    } catch {
      // Key may not be registered -- skip
    }
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VENUE_WHITELIST policy', () => {
  beforeEach(async () => {
    conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
    walletId = await insertTestWallet();
  });

  afterEach(() => {
    conn.sqlite.close();
  });

  it('venue absent (contractCall) -> VENUE_WHITELIST not evaluated, passes', async () => {
    // Enable venue whitelist + add VENUE_WHITELIST policy
    const settings = createSettings();
    try { settings.set('venue_whitelist_enabled', 'true'); } catch { /* key not registered */ }
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'VENUE_WHITELIST',
      rules: JSON.stringify({ venues: [{ id: 'polymarket' }] }),
    });

    // contractCall transaction without venue -> should pass
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'ethereum',
    });
    expect(result.allowed).toBe(true);
  });

  it('venue_whitelist_enabled=false -> VENUE_WHITELIST not evaluated, passes', async () => {
    // venue_whitelist_enabled defaults to false
    const settings = createSettings();
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'VENUE_WHITELIST',
      rules: JSON.stringify({ venues: [{ id: 'polymarket' }] }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'ethereum',
      venue: 'unknown-venue',
    });
    expect(result.allowed).toBe(true);
  });

  it('venue_whitelist_enabled=true + no policy + venue present -> DENY (default-deny)', async () => {
    const settings = createSettings();
    try { settings.set('venue_whitelist_enabled', 'true'); } catch { /* key not registered */ }
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    // No VENUE_WHITELIST policy, but venue present
    // Need at least one policy for the engine to evaluate (not early-exit)
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max_usd: 1000, notify_max_usd: 5000, delay_max_usd: 10000, delay_seconds: 60 }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'ethereum',
      venue: 'unknown-venue',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('VENUE_NOT_ALLOWED');
  });

  it('venue_whitelist_enabled=true + policy + venue allowed -> passes', async () => {
    const settings = createSettings();
    try { settings.set('venue_whitelist_enabled', 'true'); } catch { /* key not registered */ }
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'VENUE_WHITELIST',
      rules: JSON.stringify({ venues: [{ id: 'polymarket', name: 'Polymarket' }, { id: 'hyperliquid' }] }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'ethereum',
      venue: 'polymarket',
    });
    expect(result.allowed).toBe(true);
  });

  it('venue_whitelist_enabled=true + policy + venue not allowed -> DENY', async () => {
    const settings = createSettings();
    try { settings.set('venue_whitelist_enabled', 'true'); } catch { /* key not registered */ }
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'VENUE_WHITELIST',
      rules: JSON.stringify({ venues: [{ id: 'polymarket' }] }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'ethereum',
      venue: 'dydx',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('VENUE_NOT_ALLOWED');
  });

  it('venue matching is case-insensitive', async () => {
    const settings = createSettings();
    try { settings.set('venue_whitelist_enabled', 'true'); } catch { /* key not registered */ }
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'VENUE_WHITELIST',
      rules: JSON.stringify({ venues: [{ id: 'polymarket' }] }),
    });

    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '0',
      toAddress: '0x1234',
      chain: 'ethereum',
      venue: 'PolyMarket',
    });
    expect(result.allowed).toBe(true);
  });

  it('VENUE_WHITELIST + SPENDING_LIMIT coexist (order check)', async () => {
    const settings = createSettings();
    try { settings.set('venue_whitelist_enabled', 'true'); } catch { /* key not registered */ }
    const engine = new DatabasePolicyEngine(conn.db, conn.sqlite, settings);

    await insertPolicy({
      walletId,
      type: 'VENUE_WHITELIST',
      rules: JSON.stringify({ venues: [{ id: 'polymarket' }] }),
    });
    await insertPolicy({
      walletId,
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({ instant_max_usd: 100, notify_max_usd: 500, delay_max_usd: 1000, delay_seconds: 60 }),
    });

    // Allowed venue + within spending limit -> passes
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '50000000', // 0.05 SOL (below any limit)
      toAddress: '0x1234',
      chain: 'solana',
      venue: 'polymarket',
    });
    expect(result.allowed).toBe(true);
  });
});
