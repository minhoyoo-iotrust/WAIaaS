/**
 * Tests for off-chain action query routes:
 *   GET /v1/wallets/:id/actions (list)
 *   GET /v1/wallets/:id/actions/:actionId (detail)
 *
 * Uses in-memory SQLite + pushSchema + createApp pattern.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type * as schema from '../infrastructure/database/schema.js';
import { createApp } from '../api/server.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

const WALLET_ID = '01927f6e-3c4a-7f1b-8d2e-000000000001';
const SESSION_ID = '01927f6e-3c4a-7f1b-8d2e-000000000010';

let app: ReturnType<typeof createApp>;
let db: BetterSQLite3Database<typeof schema>;
let sqlite: SQLiteDatabase;
let token: string;

beforeAll(async () => {
  // Create in-memory DB with full schema
  const conn = createDatabase(':memory:');
  db = conn.db;
  sqlite = conn.sqlite;
  pushSchema(sqlite);

  const now = Math.floor(Date.now() / 1000);

  // Seed test data
  sqlite.exec(`
    INSERT INTO wallets (id, name, chain, environment, public_key, status, created_at, updated_at)
    VALUES ('${WALLET_ID}', 'test-wallet', 'ethereum', 'mainnet', '0xTestWallet', 'ACTIVE', ${now}, ${now});
  `);
  sqlite.exec(`
    INSERT INTO sessions (id, token_hash, source, expires_at, absolute_expires_at, created_at)
    VALUES ('${SESSION_ID}', 'test-hash', 'api', ${now + 3600}, ${now + 7200}, ${now});
  `);
  sqlite.exec(`
    INSERT INTO session_wallets (session_id, wallet_id, created_at)
    VALUES ('${SESSION_ID}', '${WALLET_ID}', ${now});
  `);

  // Insert off-chain actions
  sqlite.exec(`
    INSERT INTO transactions (id, wallet_id, chain, type, status, created_at, action_kind, venue, operation, metadata, bridge_status, bridge_metadata, error, tx_hash)
    VALUES
      ('action-001', '${WALLET_ID}', 'ethereum', 'CONTRACT_CALL', 'CONFIRMED', ${now - 100}, 'signedData', 'polymarket', 'place_order', '{"provider":"polymarket","action":"pm_buy"}', NULL, NULL, NULL, 'sig:0xabc123'),
      ('action-002', '${WALLET_ID}', 'ethereum', 'CONTRACT_CALL', 'CONFIRMED', ${now - 200}, 'signedHttp', 'hyperliquid', 'submit_order', '{"provider":"hyperliquid","action":"hl_open"}', 'PENDING', '{"trackerName":"hl-tracker"}', NULL, 'sig:0xdef456'),
      ('action-003', '${WALLET_ID}', 'ethereum', 'CONTRACT_CALL', 'FAILED', ${now - 300}, 'signedData', 'polymarket', 'cancel_order', '{"provider":"polymarket","action":"pm_cancel"}', NULL, NULL, 'Policy denied', NULL),
      ('tx-regular-001', '${WALLET_ID}', 'ethereum', 'TRANSFER', 'CONFIRMED', ${now - 400}, 'contractCall', NULL, NULL, NULL, NULL, NULL, NULL, '0xregulartx');
  `);

  // Create real JwtSecretManager for proper verifyToken support
  const jwtSecretManager = new JwtSecretManager(db);
  await jwtSecretManager.initialize();

  // Sign a session token
  const nowSec = Math.floor(Date.now() / 1000);
  token = await jwtSecretManager.signToken({
    sub: SESSION_ID,
    iat: nowSec,
    exp: nowSec + 3600,
  });

  // Create app
  app = createApp({
    db,
    sqlite,
    jwtSecretManager,
    config: {
      daemon: { port: 3100 },
      security: {},
    } as any,
    masterPasswordHash: '$argon2id$v=19$m=65536,t=3,p=4$dGVzdHRlc3Q$testhash',
  });
});

function get(path: string) {
  return app.request(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      Host: 'localhost:3100',
    },
  });
}

// ---------------------------------------------------------------------------
// GET /v1/wallets/:id/actions
// ---------------------------------------------------------------------------

describe('GET /v1/wallets/:id/actions', () => {
  it('returns only off-chain actions (filters out contractCall)', async () => {
    const res = await get(`/v1/wallets/${WALLET_ID}/actions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(3);
    expect(body.total).toBe(3);
  });

  it('filters by venue', async () => {
    const res = await get(`/v1/wallets/${WALLET_ID}/actions?venue=polymarket`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(2);
    for (const a of body.actions) {
      expect(a.venue).toBe('polymarket');
    }
  });

  it('filters by status', async () => {
    const res = await get(`/v1/wallets/${WALLET_ID}/actions?status=FAILED`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0].status).toBe('FAILED');
  });

  it('applies pagination (limit/offset)', async () => {
    const res = await get(`/v1/wallets/${WALLET_ID}/actions?limit=1&offset=1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(1);
    expect(body.total).toBe(3);
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(1);
  });

  it('returns empty for unknown wallet', async () => {
    const res = await get('/v1/wallets/01927f6e-3c4a-7f1b-8d2e-999999999999/actions');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actions).toHaveLength(0);
    expect(body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/wallets/:id/actions/:actionId
// ---------------------------------------------------------------------------

describe('GET /v1/wallets/:id/actions/:actionId', () => {
  it('returns detail with metadata and bridgeMetadata', async () => {
    const res = await get(`/v1/wallets/${WALLET_ID}/actions/action-002`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('action-002');
    expect(body.actionKind).toBe('signedHttp');
    expect(body.venue).toBe('hyperliquid');
    expect(body.bridgeStatus).toBe('PENDING');
    expect(body.metadata).toBeDefined();
    expect(body.metadata.provider).toBe('hyperliquid');
    expect(body.bridgeMetadata).toBeDefined();
    expect(body.bridgeMetadata.trackerName).toBe('hl-tracker');
  });

  it('returns 404 for non-existent actionId', async () => {
    const res = await get(`/v1/wallets/${WALLET_ID}/actions/nonexistent`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for regular contractCall transaction', async () => {
    const res = await get(`/v1/wallets/${WALLET_ID}/actions/tx-regular-001`);
    expect(res.status).toBe(404);
  });

  it('returns error detail for failed action', async () => {
    const res = await get(`/v1/wallets/${WALLET_ID}/actions/action-003`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('FAILED');
    expect(body.error).toBe('Policy denied');
  });
});
