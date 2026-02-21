/**
 * Session-wallet cascade defense tests for TERMINATE handler.
 *
 * Verifies:
 * - Default wallet deletion -> auto-promote earliest-linked wallet
 * - Non-default wallet deletion -> no change to default
 * - Last wallet deletion -> session auto-revoke
 * - Multi-session wallet deletion -> per-session cascade
 * - is_default invariant holds in all scenarios
 * - Promotion order is by created_at ASC
 * - Sequential TERMINATE + session renew data consistency
 *
 * Uses in-memory SQLite + full Hono app (same pattern as session-lifecycle-e2e.test.ts).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { eq, and } from 'drizzle-orm';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { createApp } from '../api/server.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { DelayQueue } from '../workflow/delay-queue.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import { OwnerLifecycleService } from '../workflow/owner-state.js';
import { sessions, sessionWallets } from '../infrastructure/database/schema.js';
import type { IChainAdapter } from '@waiaas/core';
import type { AdapterPool } from '../infrastructure/adapter-pool.js';
import type { OpenAPIHono } from '@hono/zod-openapi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-cascade';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockAdapter(): IChainAdapter {
  return {
    chain: 'solana' as const,
    network: 'devnet' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async () => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string) => ({
      address: addr,
      balance: 1_000_000_000n,
      decimals: 9,
      symbol: 'SOL',
    }),
    buildTransaction: async () => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    simulateTransaction: async () => ({ success: true, logs: [] }),
    signTransaction: async () => new Uint8Array(256),
    submitTransaction: async () => ({
      txHash: 'mock-hash-' + Date.now(),
      status: 'submitted' as const,
    }),
    waitForConfirmation: async (txHash: string) => ({
      txHash,
      status: 'confirmed' as const,
      confirmations: 1,
    }),
    getAssets: async () => [],
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async () => { throw new Error('not implemented'); },
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async () => { throw new Error('not implemented'); },
    buildApprove: async () => { throw new Error('not implemented'); },
    buildBatch: async () => { throw new Error('not implemented'); },
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
  };
}

function createMockAdapterPool(): AdapterPool {
  const a = createMockAdapter();
  return {
    resolve: vi.fn().mockResolvedValue(a),
    disconnectAll: vi.fn().mockResolvedValue(undefined),
    get size() { return 0; },
  } as unknown as AdapterPool;
}

function createMockKeyStore() {
  return {
    generateKeyPair: async (_id: string) => ({
      publicKey: `pk-${_id}`,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64).fill(42),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function masterAuthJsonHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

function masterAuthHeaders(): Record<string, string> {
  return { Host: HOST, 'X-Master-Password': TEST_PASSWORD };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function seedWallet(sqlite: DatabaseType, walletId: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, `Wallet-${walletId.slice(0, 8)}`, 'solana', 'testnet', 'devnet', `pk-${walletId}`, 'ACTIVE', 0, ts, ts);
}

function seedSession(sqlite: DatabaseType, sessionId: string): void {
  const ts = Math.floor(Date.now() / 1000);
  const expiresAt = ts + 3600;
  const absoluteExpiresAt = ts + 86400;
  sqlite
    .prepare(
      `INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at, renewal_count, max_renewals)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(sessionId, `hash-${sessionId}`, expiresAt, absoluteExpiresAt, ts, 0, 12);
}

function seedSessionWallet(sqlite: DatabaseType, sessionId: string, walletId: string, isDefault: boolean, createdAtOffset = 0): void {
  const ts = Math.floor(Date.now() / 1000) + createdAtOffset;
  sqlite
    .prepare(
      `INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(sessionId, walletId, isDefault ? 1 : 0, ts);
}

/**
 * Assert the is_default invariant: for an active (non-revoked) session,
 * there must be exactly 1 default wallet among its session_wallets.
 * For a revoked session, 0 session_wallets rows (or 0 defaults) is acceptable.
 */
function assertDefaultInvariant(
  db: ReturnType<typeof createDatabase>['db'],
  sessionId: string,
): void {
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  expect(session).toBeDefined();

  const defaults = db
    .select()
    .from(sessionWallets)
    .where(and(
      eq(sessionWallets.sessionId, sessionId),
      eq(sessionWallets.isDefault, true),
    ))
    .all();

  const allLinks = db
    .select()
    .from(sessionWallets)
    .where(eq(sessionWallets.sessionId, sessionId))
    .all();

  if (session!.revokedAt === null && allLinks.length > 0) {
    // Active session with wallets: exactly 1 default
    expect(defaults.length).toBe(1);
  }
  // Revoked session or empty session: 0 defaults is fine
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;
let app: OpenAPIHono;

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-02-10T12:00:00Z'));

  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  jwtManager = new JwtSecretManager(db);
  await jwtManager.initialize();

  const config = DaemonConfigSchema.parse({});
  const policyEngine = new DatabasePolicyEngine(db, sqlite);
  const delayQueue = new DelayQueue({ db, sqlite });
  const approvalWorkflow = new ApprovalWorkflow({
    db,
    sqlite,
    config: {
      policy_defaults_approval_timeout:
        config.security.policy_defaults_approval_timeout,
    },
  });
  const ownerLifecycle = new OwnerLifecycleService({ db, sqlite });

  app = createApp({
    db,
    sqlite,
    jwtSecretManager: jwtManager,
    masterPasswordHash: passwordHash,
    masterPassword: TEST_PASSWORD,
    config,
    adapterPool: createMockAdapterPool(),
    keyStore: createMockKeyStore(),
    policyEngine,
    delayQueue,
    approvalWorkflow,
    ownerLifecycle,
  });
});

afterEach(() => {
  vi.useRealTimers();
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ===========================================================================
// Cascade Defense Tests
// ===========================================================================

describe('Session-Wallet Cascade Defense', () => {
  // -----------------------------------------------------------------------
  // Test 1: Default wallet deletion -> auto-promote
  // -----------------------------------------------------------------------
  it('auto-promotes next wallet when default wallet is terminated', async () => {
    const w1 = generateId();
    const w2 = generateId();
    const w3 = generateId();
    const s1 = generateId();

    seedWallet(sqlite, w1);
    seedWallet(sqlite, w2);
    seedWallet(sqlite, w3);
    seedSession(sqlite, s1);
    seedSessionWallet(sqlite, s1, w1, true, 0);   // default, earliest
    seedSessionWallet(sqlite, s1, w2, false, 1);   // second
    seedSessionWallet(sqlite, s1, w3, false, 2);   // third

    // TERMINATE w1 (default wallet)
    const res = await app.request(`/v1/wallets/${w1}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });
    expect(res.status).toBe(200);

    // w1 should be removed from session_wallets
    const w1Links = db.select().from(sessionWallets)
      .where(and(eq(sessionWallets.sessionId, s1), eq(sessionWallets.walletId, w1)))
      .all();
    expect(w1Links.length).toBe(0);

    // w2 should be promoted to default (created_at ASC order)
    const w2Link = db.select().from(sessionWallets)
      .where(and(eq(sessionWallets.sessionId, s1), eq(sessionWallets.walletId, w2)))
      .get();
    expect(w2Link).toBeDefined();
    expect(w2Link!.isDefault).toBe(true);

    // w3 remains non-default
    const w3Link = db.select().from(sessionWallets)
      .where(and(eq(sessionWallets.sessionId, s1), eq(sessionWallets.walletId, w3)))
      .get();
    expect(w3Link).toBeDefined();
    expect(w3Link!.isDefault).toBe(false);

    // Invariant check
    assertDefaultInvariant(db, s1);
  });

  // -----------------------------------------------------------------------
  // Test 2: Non-default wallet deletion -> no change
  // -----------------------------------------------------------------------
  it('preserves default when non-default wallet is terminated', async () => {
    const w1 = generateId();
    const w2 = generateId();
    const s1 = generateId();

    seedWallet(sqlite, w1);
    seedWallet(sqlite, w2);
    seedSession(sqlite, s1);
    seedSessionWallet(sqlite, s1, w1, true, 0);
    seedSessionWallet(sqlite, s1, w2, false, 1);

    // TERMINATE w2 (non-default)
    const res = await app.request(`/v1/wallets/${w2}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });
    expect(res.status).toBe(200);

    // w1 is still default
    const w1Link = db.select().from(sessionWallets)
      .where(and(eq(sessionWallets.sessionId, s1), eq(sessionWallets.walletId, w1)))
      .get();
    expect(w1Link).toBeDefined();
    expect(w1Link!.isDefault).toBe(true);

    // w2 is removed
    const w2Links = db.select().from(sessionWallets)
      .where(and(eq(sessionWallets.sessionId, s1), eq(sessionWallets.walletId, w2)))
      .all();
    expect(w2Links.length).toBe(0);

    assertDefaultInvariant(db, s1);
  });

  // -----------------------------------------------------------------------
  // Test 3: Last wallet deletion -> session auto-revoke
  // -----------------------------------------------------------------------
  it('auto-revokes session when last wallet is terminated', async () => {
    const w1 = generateId();
    const s1 = generateId();

    seedWallet(sqlite, w1);
    seedSession(sqlite, s1);
    seedSessionWallet(sqlite, s1, w1, true, 0);

    // TERMINATE w1 (only wallet)
    const res = await app.request(`/v1/wallets/${w1}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });
    expect(res.status).toBe(200);

    // Session should be revoked
    const session = db.select().from(sessions)
      .where(eq(sessions.id, s1))
      .get();
    expect(session).toBeDefined();
    expect(session!.revokedAt).not.toBeNull();

    // No session_wallets left for this session
    const links = db.select().from(sessionWallets)
      .where(eq(sessionWallets.sessionId, s1))
      .all();
    expect(links.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Test 4: Multi-session wallet deletion
  // -----------------------------------------------------------------------
  it('handles wallet linked to multiple sessions (promote in one, revoke in other)', async () => {
    const w1 = generateId();
    const w2 = generateId();
    const sA = generateId(); // session A: w1(default) + w2
    const sB = generateId(); // session B: w1(default) only

    seedWallet(sqlite, w1);
    seedWallet(sqlite, w2);
    seedSession(sqlite, sA);
    seedSession(sqlite, sB);
    seedSessionWallet(sqlite, sA, w1, true, 0);
    seedSessionWallet(sqlite, sA, w2, false, 1);
    seedSessionWallet(sqlite, sB, w1, true, 0);

    // TERMINATE w1
    const res = await app.request(`/v1/wallets/${w1}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });
    expect(res.status).toBe(200);

    // Session A: w2 should be promoted to default
    const sALinks = db.select().from(sessionWallets)
      .where(eq(sessionWallets.sessionId, sA))
      .all();
    expect(sALinks.length).toBe(1);
    expect(sALinks[0]!.walletId).toBe(w2);
    expect(sALinks[0]!.isDefault).toBe(true);
    assertDefaultInvariant(db, sA);

    // Session B: auto-revoked (last wallet)
    const sessionB = db.select().from(sessions)
      .where(eq(sessions.id, sB))
      .get();
    expect(sessionB).toBeDefined();
    expect(sessionB!.revokedAt).not.toBeNull();

    const sBLinks = db.select().from(sessionWallets)
      .where(eq(sessionWallets.sessionId, sB))
      .all();
    expect(sBLinks.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Test 5: is_default invariant after complex scenario
  // -----------------------------------------------------------------------
  it('maintains is_default invariant across sequential deletions', async () => {
    const w1 = generateId();
    const w2 = generateId();
    const w3 = generateId();
    const s1 = generateId();

    seedWallet(sqlite, w1);
    seedWallet(sqlite, w2);
    seedWallet(sqlite, w3);
    seedSession(sqlite, s1);
    seedSessionWallet(sqlite, s1, w1, true, 0);
    seedSessionWallet(sqlite, s1, w2, false, 1);
    seedSessionWallet(sqlite, s1, w3, false, 2);

    // Delete w1 (default) -> w2 promoted
    await app.request(`/v1/wallets/${w1}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });
    assertDefaultInvariant(db, s1);

    // Delete w2 (now default) -> w3 promoted
    await app.request(`/v1/wallets/${w2}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });
    assertDefaultInvariant(db, s1);

    const w3Link = db.select().from(sessionWallets)
      .where(and(eq(sessionWallets.sessionId, s1), eq(sessionWallets.walletId, w3)))
      .get();
    expect(w3Link).toBeDefined();
    expect(w3Link!.isDefault).toBe(true);

    // Delete w3 (last) -> session revoked
    await app.request(`/v1/wallets/${w3}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });

    const session = db.select().from(sessions)
      .where(eq(sessions.id, s1))
      .get();
    expect(session!.revokedAt).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // Test 6: Promotion order by created_at ASC
  // -----------------------------------------------------------------------
  it('promotes earliest-linked wallet (created_at ASC) when default is deleted', async () => {
    const w1 = generateId();
    const w2 = generateId();
    const w3 = generateId();
    const s1 = generateId();

    seedWallet(sqlite, w1);
    seedWallet(sqlite, w2);
    seedWallet(sqlite, w3);
    seedSession(sqlite, s1);
    // w1 is default, but w3 was linked BEFORE w2 (offset trick)
    seedSessionWallet(sqlite, s1, w1, true, 0);
    seedSessionWallet(sqlite, s1, w3, false, 1);  // w3 linked at +1s
    seedSessionWallet(sqlite, s1, w2, false, 5);  // w2 linked at +5s

    // TERMINATE w1 -> w3 should be promoted (earlier created_at than w2)
    const res = await app.request(`/v1/wallets/${w1}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });
    expect(res.status).toBe(200);

    const w3Link = db.select().from(sessionWallets)
      .where(and(eq(sessionWallets.sessionId, s1), eq(sessionWallets.walletId, w3)))
      .get();
    expect(w3Link).toBeDefined();
    expect(w3Link!.isDefault).toBe(true);

    const w2Link = db.select().from(sessionWallets)
      .where(and(eq(sessionWallets.sessionId, s1), eq(sessionWallets.walletId, w2)))
      .get();
    expect(w2Link).toBeDefined();
    expect(w2Link!.isDefault).toBe(false);

    assertDefaultInvariant(db, s1);
  });

  // -----------------------------------------------------------------------
  // Test 7: TERMINATE + sequential operations data consistency
  // -----------------------------------------------------------------------
  it('maintains data consistency when TERMINATE and subsequent operations run sequentially', async () => {
    const w1 = generateId();
    const w2 = generateId();

    // Create wallets via API (to get proper sessions)
    seedWallet(sqlite, w1);
    seedWallet(sqlite, w2);

    // Create session with w1 via API
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: w1 }),
    });
    expect(createRes.status).toBe(201);
    const created = await json(createRes);
    const sessionId = created.id as string;

    // Add w2 to the session
    const addRes = await app.request(`/v1/sessions/${sessionId}/wallets`, {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: w2 }),
    });
    expect(addRes.status).toBe(201);

    // TERMINATE w1 (default) -> w2 should be promoted
    const deleteRes = await app.request(`/v1/wallets/${w1}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });
    expect(deleteRes.status).toBe(200);

    // Verify w2 is now default
    const w2Link = db.select().from(sessionWallets)
      .where(and(eq(sessionWallets.sessionId, sessionId), eq(sessionWallets.walletId, w2)))
      .get();
    expect(w2Link).toBeDefined();
    expect(w2Link!.isDefault).toBe(true);

    // Session should remain active (not revoked) since w2 is still linked
    const session = db.select().from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    expect(session).toBeDefined();
    expect(session!.revokedAt).toBeNull();

    // Only w2 remains in session_wallets
    const allLinks = db.select().from(sessionWallets)
      .where(eq(sessionWallets.sessionId, sessionId))
      .all();
    expect(allLinks.length).toBe(1);
    expect(allLinks[0]!.walletId).toBe(w2);

    // Now TERMINATE w2 (last wallet) -> session should be revoked
    const deleteRes2 = await app.request(`/v1/wallets/${w2}`, {
      method: 'DELETE',
      headers: masterAuthHeaders(),
    });
    expect(deleteRes2.status).toBe(200);

    const sessionAfter = db.select().from(sessions)
      .where(eq(sessions.id, sessionId))
      .get();
    expect(sessionAfter!.revokedAt).not.toBeNull();

    const finalLinks = db.select().from(sessionWallets)
      .where(eq(sessionWallets.sessionId, sessionId))
      .all();
    expect(finalLinks.length).toBe(0);
  });
});
