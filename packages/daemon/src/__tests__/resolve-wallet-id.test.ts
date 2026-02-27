/**
 * resolveWalletId helper tests: 2-priority wallet ID resolution + single-wallet auto-resolve + session access check.
 *
 * Tests cover:
 * 1. Uses body walletId when provided (priority 1)
 * 2. Uses query walletId when body not provided (priority 2)
 * 3. Body walletId takes priority over query walletId
 * 4. Auto-resolves to single wallet when session has exactly 1 wallet
 * 5. Throws WALLET_ID_REQUIRED when session has 2+ wallets and no walletId provided
 * 6. Throws WALLET_ID_REQUIRED when session has 0 wallets and no walletId provided
 * 7. Throws WALLET_ACCESS_DENIED when wallet not linked to session
 * 8. Throws WALLET_ACCESS_DENIED for query walletId not linked to session
 *
 * Uses Hono app.request() testing pattern + in-memory SQLite.
 *
 * @see Phase 279 -- remove default wallet concept
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

const TEST_SESSION_ID = generateId(); // multi-wallet session (WALLET_A + WALLET_B)
const SINGLE_WALLET_SESSION = generateId(); // single-wallet session (WALLET_A only)
const EMPTY_SESSION = generateId(); // session with 0 wallets
const WALLET_A = generateId(); // linked to both sessions
const WALLET_B = generateId(); // linked only to TEST_SESSION_ID
const WALLET_UNLINKED = generateId(); // NOT linked to any session

const nowSeconds = () => Math.floor(Date.now() / 1000);

function seedTestData() {
  const ts = nowSeconds();

  // Create wallets (no default_network column after migration v27)
  for (const [id, name] of [
    [WALLET_A, 'Wallet A'],
    [WALLET_B, 'Wallet B'],
    [WALLET_UNLINKED, 'Wallet Unlinked'],
  ] as const) {
    sqlite.prepare(
      `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, name, 'solana', 'mainnet', `pk-resolve-${id}`, 'ACTIVE', 0, ts, ts);
  }

  // Create sessions
  for (const sessionId of [TEST_SESSION_ID, SINGLE_WALLET_SESSION, EMPTY_SESSION]) {
    sqlite.prepare(
      `INSERT INTO sessions (id, token_hash, expires_at, absolute_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(sessionId, `hash-${sessionId}`, ts + 86400, ts + 86400 * 30, ts);
  }

  // Link WALLET_A and WALLET_B to multi-wallet session (no is_default column)
  sqlite.prepare(
    `INSERT INTO session_wallets (session_id, wallet_id, created_at)
     VALUES (?, ?, ?)`,
  ).run(TEST_SESSION_ID, WALLET_A, ts);
  sqlite.prepare(
    `INSERT INTO session_wallets (session_id, wallet_id, created_at)
     VALUES (?, ?, ?)`,
  ).run(TEST_SESSION_ID, WALLET_B, ts);

  // Link only WALLET_A to single-wallet session
  sqlite.prepare(
    `INSERT INTO session_wallets (session_id, wallet_id, created_at)
     VALUES (?, ?, ?)`,
  ).run(SINGLE_WALLET_SESSION, WALLET_A, ts);

  // EMPTY_SESSION has no wallets linked
}

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Create a test Hono app that sets sessionId via middleware,
 * then calls resolveWalletId in the route handler.
 */
function createTestApp(
  database: ReturnType<typeof createDatabase>['db'],
  sessionId: string = TEST_SESSION_ID,
) {
  const testApp = new Hono();

  // Simulate sessionAuth middleware setting context (no more defaultWalletId)
  testApp.use('/*', async (c, next) => {
    c.set('sessionId', sessionId);
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

  // Error handler: supports 400 (WALLET_ID_REQUIRED) and 403 (WALLET_ACCESS_DENIED)
  testApp.onError((err, c) => {
    if ('code' in err && typeof (err as Record<string, unknown>).code === 'string') {
      const wErr = err as { code: string; httpStatus?: number; message: string };
      return c.json(
        { code: wErr.code, message: wErr.message },
        (wErr.httpStatus ?? 500) as 400,
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

  it('auto-resolves to single wallet when session has exactly 1 wallet', async () => {
    const app = createTestApp(db, SINGLE_WALLET_SESSION);
    const res = await app.request('/resolve');
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.walletId).toBe(WALLET_A);
  });

  it('throws WALLET_ID_REQUIRED when session has 2+ wallets and no walletId provided', async () => {
    const app = createTestApp(db, TEST_SESSION_ID);
    const res = await app.request('/resolve');
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.code).toBe('WALLET_ID_REQUIRED');
  });

  it('throws WALLET_ID_REQUIRED when session has 0 wallets and no walletId provided', async () => {
    const app = createTestApp(db, EMPTY_SESSION);
    const res = await app.request('/resolve');
    expect(res.status).toBe(400);

    const body = await json(res);
    expect(body.code).toBe('WALLET_ID_REQUIRED');
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

  it('throws WALLET_ACCESS_DENIED for query walletId not linked to session', async () => {
    const app = createTestApp(db);
    const res = await app.request(`/resolve?walletId=${WALLET_UNLINKED}`);
    expect(res.status).toBe(403);

    const body = await json(res);
    expect(body.code).toBe('WALLET_ACCESS_DENIED');
  });
});
