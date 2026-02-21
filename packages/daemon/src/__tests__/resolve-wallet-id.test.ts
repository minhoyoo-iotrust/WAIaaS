/**
 * resolveWalletId helper tests: 3-priority wallet ID resolution + session access check.
 *
 * Tests cover:
 * 1. Uses body walletId when provided (priority 1)
 * 2. Uses query walletId when body not provided (priority 2)
 * 3. Uses defaultWalletId when body and query not provided (priority 3)
 * 4. Body walletId takes priority over query walletId
 * 5. Throws WALLET_ACCESS_DENIED when wallet not linked to session
 * 6. Returns walletId when defaultWalletId is linked to session
 *
 * Uses Hono app.request() testing pattern + in-memory SQLite.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { resolveWalletId } from '../api/helpers/resolve-wallet-id.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];

const TEST_SESSION_ID = generateId();
const WALLET_A = generateId(); // linked to session
const WALLET_B = generateId(); // linked to session
const WALLET_UNLINKED = generateId(); // NOT linked to session

const nowSeconds = () => Math.floor(Date.now() / 1000);

function seedTestData() {
  const ts = nowSeconds();

  // Create wallets
  for (const [id, name] of [
    [WALLET_A, 'Wallet A'],
    [WALLET_B, 'Wallet B'],
    [WALLET_UNLINKED, 'Wallet Unlinked'],
  ] as const) {
    sqlite.prepare(
      `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, name, 'solana', 'mainnet', 'mainnet', `pk-resolve-${id}`, 'ACTIVE', 0, ts, ts);
  }

  // Create session
  sqlite.prepare(
    `INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(TEST_SESSION_ID, 'test-hash', ts + 86400, ts + 86400 * 30, ts);

  // Link WALLET_A and WALLET_B to session (WALLET_UNLINKED is NOT linked)
  sqlite.prepare(
    `INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(TEST_SESSION_ID, WALLET_A, 1, ts); // WALLET_A is default
  sqlite.prepare(
    `INSERT INTO session_wallets (session_id, wallet_id, is_default, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(TEST_SESSION_ID, WALLET_B, 0, ts);
}

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Create a test Hono app that sets sessionId/defaultWalletId via middleware,
 * then calls resolveWalletId in the route handler.
 */
function createTestApp(database: ReturnType<typeof createDatabase>['db']) {
  const testApp = new Hono();

  // Simulate sessionAuth middleware setting context
  testApp.use('/*', async (c, next) => {
    c.set('sessionId', TEST_SESSION_ID);
    c.set('defaultWalletId', WALLET_A);
    await next();
  });

  // POST route: body walletId
  testApp.post('/resolve', async (c) => {
    const body = await c.req.json<{ walletId?: string }>();
    const walletId = resolveWalletId(c, database, body.walletId);
    return c.json({ walletId });
  });

  // GET route: query walletId
  testApp.get('/resolve', (c) => {
    const walletId = resolveWalletId(c, database);
    return c.json({ walletId });
  });

  // Error handler
  testApp.onError((err, c) => {
    if ('code' in err && typeof (err as Record<string, unknown>).code === 'string') {
      const wErr = err as { code: string; httpStatus?: number; message: string };
      return c.json(
        { code: wErr.code, message: wErr.message },
        (wErr.httpStatus ?? 500) as 403,
      );
    }
    return c.json({ code: 'UNKNOWN', message: err.message }, 500);
  });

  return testApp;
}

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);
  seedTestData();
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveWalletId', () => {
  it('uses body walletId when provided (priority 1)', async () => {
    const app = createTestApp(db);
    const res = await app.request('/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId: WALLET_B }),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.walletId).toBe(WALLET_B);
  });

  it('uses query walletId when body not provided (priority 2)', async () => {
    const app = createTestApp(db);
    const res = await app.request(`/resolve?walletId=${WALLET_B}`);
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.walletId).toBe(WALLET_B);
  });

  it('uses defaultWalletId when body and query not provided (priority 3)', async () => {
    const app = createTestApp(db);
    const res = await app.request('/resolve');
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.walletId).toBe(WALLET_A);
  });

  it('body walletId takes priority over query walletId', async () => {
    const app = createTestApp(db);
    const res = await app.request(`/resolve?walletId=${WALLET_A}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId: WALLET_B }),
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.walletId).toBe(WALLET_B);
  });

  it('throws WALLET_ACCESS_DENIED when wallet not linked to session', async () => {
    const app = createTestApp(db);
    const res = await app.request('/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId: WALLET_UNLINKED }),
    });
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('WALLET_ACCESS_DENIED');
  });

  it('returns walletId when defaultWalletId is linked to session', async () => {
    const app = createTestApp(db);
    // No body, no query -> uses defaultWalletId (WALLET_A which is linked)
    const res = await app.request('/resolve');
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.walletId).toBe(WALLET_A);
  });

  it('throws WALLET_ACCESS_DENIED for query walletId not linked to session', async () => {
    const app = createTestApp(db);
    const res = await app.request(`/resolve?walletId=${WALLET_UNLINKED}`);
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('WALLET_ACCESS_DENIED');
  });
});
