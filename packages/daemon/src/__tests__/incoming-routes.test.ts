/**
 * Tests for incoming transaction routes: cursor helpers and route handler logic.
 *
 * Covers encodeCursor/decodeCursor (exported helpers) and the incomingRoutes factory
 * with mocked dependencies to exercise all filter and aggregation paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../infrastructure/database/schema.js';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { encodeCursor, decodeCursor, incomingRoutes } from '../api/routes/incoming.js';
import { Hono } from 'hono';
import { incomingTransactions, sessions, wallets, sessionWallets } from '../infrastructure/database/schema.js';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Cursor helpers (pure functions -- no DB needed)
// ---------------------------------------------------------------------------

describe('encodeCursor / decodeCursor', () => {
  it('round-trips correctly', () => {
    const detectedAt = 1700000000;
    const id = 'tx-123';
    const encoded = encodeCursor(detectedAt, id);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual({ detectedAt, id });
  });

  it('returns null for invalid base64', () => {
    expect(decodeCursor('not-valid-base64!!!')).toBeNull();
  });

  it('returns null for valid base64 but invalid JSON', () => {
    const encoded = Buffer.from('not-json').toString('base64url');
    expect(decodeCursor(encoded)).toBeNull();
  });

  it('returns null for valid JSON with wrong shape', () => {
    const encoded = Buffer.from(JSON.stringify({ x: 1, y: 'hello' })).toString('base64url');
    expect(decodeCursor(encoded)).toBeNull();
  });

  it('returns null when d is not a number', () => {
    const encoded = Buffer.from(JSON.stringify({ d: 'str', i: 'id' })).toString('base64url');
    expect(decodeCursor(encoded)).toBeNull();
  });

  it('returns null when i is not a string', () => {
    const encoded = Buffer.from(JSON.stringify({ d: 100, i: 42 })).toString('base64url');
    expect(decodeCursor(encoded)).toBeNull();
  });

  it('handles large timestamps and UUIDs', () => {
    const detectedAt = 1999999999;
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const result = decodeCursor(encodeCursor(detectedAt, id));
    expect(result).toEqual({ detectedAt, id });
  });
});

// ---------------------------------------------------------------------------
// Incoming routes (integration with in-memory SQLite)
// ---------------------------------------------------------------------------

describe('incomingRoutes with DB', () => {
  let sqlite: DatabaseType;
  let db: BetterSQLite3Database<typeof schema>;
  let walletId: string;
  let sessionId: string;

  beforeEach(() => {
    const conn = createDatabase(':memory:');
    pushSchema(conn.sqlite);
    sqlite = conn.sqlite;
    db = conn.db;

    // Create a wallet
    walletId = randomUUID();
    const now = new Date();
    db.insert(wallets).values({
      id: walletId,
      name: 'test-wallet',
      publicKey: '0xTEST',
      chain: 'ethereum',
      environment: 'testnet',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Create a session linked to the wallet
    sessionId = randomUUID();
    db.insert(sessions).values({
      id: sessionId,
      tokenHash: 'test-token-hash',
      expiresAt: new Date(Date.now() + 3600000),
      absoluteExpiresAt: new Date(Date.now() + 86400000),
      createdAt: now,
    }).run();

    db.insert(sessionWallets).values({
      sessionId,
      walletId,
      createdAt: now,
    }).run();

    // Insert some incoming transactions
    const nowEpoch = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 5; i++) {
      db.insert(incomingTransactions).values({
        id: randomUUID(),
        txHash: `0xhash${i}`,
        walletId,
        fromAddress: `0xfrom${i}`,
        amount: `${(i + 1) * 1000}`,
        tokenAddress: i < 3 ? null : '0xTOKEN',
        chain: 'ethereum',
        network: 'ethereum-sepolia',
        status: 'CONFIRMED',
        blockNumber: 100 + i,
        detectedAt: new Date((nowEpoch - i * 60) * 1000),
        confirmedAt: new Date((nowEpoch - i * 60 + 30) * 1000),
        isSuspicious: i === 4,
      }).run();
    }
  });

  afterEach(() => {
    try { sqlite.close(); } catch { /* ignore */ }
  });

  function createApp() {
    const router = incomingRoutes({ db, sqlite });
    const app = new Hono();
    // Simulate sessionAuth by injecting sessionId
    app.use('*', async (c, next) => {
      c.set('sessionId' as never, sessionId as never);
      await next();
    });
    app.route('/v1', router);
    return app;
  }

  async function fetchJson(app: Hono, path: string) {
    const res = await app.fetch(new Request(`http://localhost${path}`));
    const text = await res.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    return { status: res.status, json };
  }

  it('GET /v1/wallet/incoming returns paginated list (default CONFIRMED)', async () => {
    const app = createApp();
    const { status, json } = await fetchJson(app, '/v1/wallet/incoming');
    expect(status).toBe(200);
    expect(json.data).toHaveLength(5);
    expect(json.hasMore).toBe(false);
    // Each item should have detectedAt as epoch seconds
    for (const item of json.data) {
      expect(typeof item.detectedAt).toBe('number');
      expect(item.status).toBe('CONFIRMED');
    }
  });

  it('GET /v1/wallet/incoming?limit=2 returns hasMore=true with nextCursor', async () => {
    const app = createApp();
    const { status, json } = await fetchJson(app, '/v1/wallet/incoming?limit=2');
    expect(status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.hasMore).toBe(true);
    expect(json.nextCursor).toBeTruthy();
  });

  it('GET /v1/wallet/incoming with cursor paginates correctly', async () => {
    const app = createApp();

    // First page
    const page1 = await fetchJson(app, '/v1/wallet/incoming?limit=3');
    expect(page1.json.data).toHaveLength(3);
    expect(page1.json.hasMore).toBe(true);

    // Second page using cursor
    const page2 = await fetchJson(app, `/v1/wallet/incoming?limit=3&cursor=${page1.json.nextCursor}`);
    expect(page2.json.data).toHaveLength(2);
    expect(page2.json.hasMore).toBe(false);

    // Verify no overlap
    const page1Ids = page1.json.data.map((d: any) => d.id);
    const page2Ids = page2.json.data.map((d: any) => d.id);
    const allIds = [...page1Ids, ...page2Ids];
    expect(new Set(allIds).size).toBe(5);
  });

  it('GET /v1/wallet/incoming?chain=ethereum filters by chain', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming?chain=ethereum');
    expect(json.data).toHaveLength(5);
  });

  it('GET /v1/wallet/incoming?chain=solana returns empty', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming?chain=solana');
    expect(json.data).toHaveLength(0);
  });

  it('GET /v1/wallet/incoming?network=ethereum-sepolia filters by network', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming?network=ethereum-sepolia');
    expect(json.data).toHaveLength(5);
  });

  it('GET /v1/wallet/incoming?status=PENDING returns empty (all CONFIRMED)', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming?status=PENDING');
    expect(json.data).toHaveLength(0);
  });

  it('GET /v1/wallet/incoming?token=0xTOKEN filters by token', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming?token=0xTOKEN');
    expect(json.data).toHaveLength(2);
  });

  it('GET /v1/wallet/incoming?from_address=0xfrom0 filters by sender', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming?from_address=0xfrom0');
    expect(json.data).toHaveLength(1);
  });

  it('suspicious field is mapped from isSuspicious', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming');
    const suspicious = json.data.filter((d: any) => d.suspicious);
    expect(suspicious).toHaveLength(1);
  });

  it('confirmedAt is mapped as epoch seconds', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming');
    for (const item of json.data) {
      expect(typeof item.confirmedAt).toBe('number');
    }
  });

  // Summary endpoint
  it('GET /v1/wallet/incoming/summary returns daily aggregation', async () => {
    const app = createApp();
    const { status, json } = await fetchJson(app, '/v1/wallet/incoming/summary');
    expect(status).toBe(200);
    expect(json.period).toBe('daily');
    expect(Array.isArray(json.entries)).toBe(true);
    // All 5 txs detected around the same time, should be in 1 or 2 daily buckets
    expect(json.entries.length).toBeGreaterThanOrEqual(1);
    const entry = json.entries[0];
    expect(entry.totalCount).toBeGreaterThanOrEqual(1);
    expect(typeof entry.totalAmountNative).toBe('string');
  });

  it('GET /v1/wallet/incoming/summary?period=weekly returns weekly aggregation', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming/summary?period=weekly');
    expect(json.period).toBe('weekly');
    expect(json.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /v1/wallet/incoming/summary?period=monthly returns monthly aggregation', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming/summary?period=monthly');
    expect(json.period).toBe('monthly');
    expect(json.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('summary with chain filter', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming/summary?chain=ethereum');
    expect(json.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('summary with network filter', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming/summary?network=ethereum-sepolia');
    expect(json.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('summary with since/until filters', async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = createApp();
    const { json } = await fetchJson(app, `/v1/wallet/incoming/summary?since=${now - 3600}&until=${now + 3600}`);
    expect(json.entries.length).toBeGreaterThanOrEqual(1);
  });

  it('summary counts suspicious transactions', async () => {
    const app = createApp();
    const { json } = await fetchJson(app, '/v1/wallet/incoming/summary');
    const totalSuspicious = json.entries.reduce((acc: number, e: any) => acc + e.suspiciousCount, 0);
    expect(totalSuspicious).toBe(1);
  });

  it('summary with price oracle provides USD estimates', async () => {
    const mockOracle = {
      getNativePrice: vi.fn().mockResolvedValue({ usdPrice: 3000 }),
    };
    const router = incomingRoutes({ db, sqlite, priceOracle: mockOracle as never });
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('sessionId' as never, sessionId as never);
      await next();
    });
    app.route('/v1', router);

    const { json } = await fetchJson(app, '/v1/wallet/incoming/summary?chain=ethereum');
    // With a price oracle providing a price, totalAmountUsd should be non-null
    const entry = json.entries[0];
    expect(entry.totalAmountUsd).not.toBeNull();
    expect(typeof entry.totalAmountUsd).toBe('number');
  });

  it('summary without sqlite returns empty entries', async () => {
    const router = incomingRoutes({ db });
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('sessionId' as never, sessionId as never);
      await next();
    });
    app.route('/v1', router);

    const { json } = await fetchJson(app, '/v1/wallet/incoming/summary');
    expect(json.entries).toHaveLength(0);
  });

  it('GET /v1/wallet/incoming?since=... and until=... filters by time', async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = createApp();
    const { json } = await fetchJson(app, `/v1/wallet/incoming?since=${now - 3600}&until=${now + 3600}`);
    expect(json.data).toHaveLength(5);
  });
});
