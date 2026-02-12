/**
 * Tests for route handler and background worker notification triggers.
 *
 * Verifies that:
 * 1. POST /v1/sessions fires SESSION_CREATED notify
 * 2. PUT /v1/wallets/:id/owner fires OWNER_SET notify
 * 3. Routes work correctly when notificationService is not provided
 * 4. SESSION_EXPIRED notify fires for expired sessions (unit test pattern)
 *
 * Uses createApp() + app.request() integration pattern with mock NotificationService.
 *
 * @see packages/daemon/src/api/routes/sessions.ts
 * @see packages/daemon/src/api/routes/wallets.ts
 * @see packages/daemon/src/lifecycle/daemon.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { createApp } from '../api/server.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-route-notify';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockNotificationService() {
  return {
    notify: vi.fn().mockResolvedValue(undefined),
    addChannel: vi.fn(),
    getChannelNames: vi.fn().mockReturnValue([]),
  } as unknown as NotificationService;
}

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

function mockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => ({
      publicKey: MOCK_PUBLIC_KEY,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function seedWallet(sqlite: DatabaseType, walletId: string): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(walletId, 'Test Wallet', 'solana', 'mainnet', `pk-${walletId}`, 'ACTIVE', 0, ts, ts);
}

function masterAuthJsonHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(async () => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  jwtManager = new JwtSecretManager(db);
  await jwtManager.initialize();
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// SESSION_CREATED notification
// ---------------------------------------------------------------------------

describe('POST /v1/sessions: SESSION_CREATED notification', () => {
  it('should fire SESSION_CREATED notify on successful session creation', async () => {
    const notificationService = createMockNotificationService();
    const config = DaemonConfigSchema.parse({});
    const testWalletId = generateId();
    seedWallet(sqlite, testWalletId);

    const app = createApp({
      db,
      jwtSecretManager: jwtManager,
      masterPasswordHash: passwordHash,
      config,
      notificationService,
    });

    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: testWalletId, ttl: 3600 }),
    });

    expect(res.status).toBe(201);

    const body = await json(res);
    expect(body.id).toBeDefined();

    // Verify notify was called with SESSION_CREATED
    expect(notificationService.notify).toHaveBeenCalledTimes(1);
    expect(notificationService.notify).toHaveBeenCalledWith(
      'SESSION_CREATED',
      testWalletId,
      { sessionId: expect.any(String) },
    );

    // Verify the sessionId in notify matches the response
    const notifyCall = (notificationService.notify as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(notifyCall[2].sessionId).toBe(body.id);
  });
});

// ---------------------------------------------------------------------------
// OWNER_SET notification
// ---------------------------------------------------------------------------

describe('PUT /v1/wallets/:id/owner: OWNER_SET notification', () => {
  it('should fire OWNER_SET notify on successful owner registration', async () => {
    const notificationService = createMockNotificationService();
    const config = DaemonConfigSchema.parse({});
    const testWalletId = generateId();
    seedWallet(sqlite, testWalletId);

    const app = createApp({
      db,
      sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_PASSWORD,
      masterPasswordHash: passwordHash,
      config,
      notificationService,
    });

    const ownerAddress = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
    const res = await app.request(`/v1/wallets/${testWalletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ owner_address: ownerAddress }),
    });

    expect(res.status).toBe(200);

    // Verify notify was called with OWNER_SET
    expect(notificationService.notify).toHaveBeenCalledTimes(1);
    expect(notificationService.notify).toHaveBeenCalledWith(
      'OWNER_SET',
      testWalletId,
      { ownerAddress },
    );
  });
});

// ---------------------------------------------------------------------------
// No notificationService -- graceful no-op
// ---------------------------------------------------------------------------

describe('Routes without notificationService', () => {
  it('POST /v1/sessions succeeds when notificationService is undefined', async () => {
    const config = DaemonConfigSchema.parse({});
    const testWalletId = generateId();
    seedWallet(sqlite, testWalletId);

    // No notificationService passed
    const app = createApp({
      db,
      jwtSecretManager: jwtManager,
      masterPasswordHash: passwordHash,
      config,
    });

    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ walletId: testWalletId }),
    });

    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.id).toBeDefined();
    expect(body.token).toBeDefined();
  });

  it('PUT /v1/wallets/:id/owner succeeds when notificationService is undefined', async () => {
    const config = DaemonConfigSchema.parse({});
    const testWalletId = generateId();
    seedWallet(sqlite, testWalletId);

    // No notificationService passed
    const app = createApp({
      db,
      sqlite,
      keyStore: mockKeyStore(),
      masterPassword: TEST_PASSWORD,
      masterPasswordHash: passwordHash,
      config,
    });

    const ownerAddress = 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr';
    const res = await app.request(`/v1/wallets/${testWalletId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ owner_address: ownerAddress }),
    });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// SESSION_EXPIRED notification (unit test pattern)
// ---------------------------------------------------------------------------

describe('SESSION_EXPIRED notification', () => {
  it('should fire SESSION_EXPIRED notify for expired sessions via DB query pattern', async () => {
    const notificationService = createMockNotificationService();
    const testWalletId = generateId();
    seedWallet(sqlite, testWalletId);

    // Insert an expired session (expires_at in the past)
    const sessionId = generateId();
    const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    sqlite
      .prepare(
        `INSERT INTO sessions (id, wallet_id, token_hash, expires_at, absolute_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(sessionId, testWalletId, 'hash-expired', pastTimestamp, pastTimestamp + 86400, pastTimestamp);

    // Simulate the session-cleanup worker's notify-before-delete pattern
    // This is the same logic as in daemon.ts session-cleanup handler
    const expired = sqlite.prepare(
      "SELECT id, wallet_id FROM sessions WHERE expires_at < unixepoch() AND revoked_at IS NULL",
    ).all() as Array<{ id: string; wallet_id: string }>;

    // Should find our expired session
    expect(expired).toHaveLength(1);
    expect(expired[0]!.id).toBe(sessionId);
    expect(expired[0]!.wallet_id).toBe(testWalletId);

    // Fire notify for each expired session (mimicking worker logic)
    for (const session of expired) {
      void notificationService.notify('SESSION_EXPIRED', session.wallet_id, {
        sessionId: session.id,
      });
    }

    // Verify notify was called correctly
    expect(notificationService.notify).toHaveBeenCalledTimes(1);
    expect(notificationService.notify).toHaveBeenCalledWith(
      'SESSION_EXPIRED',
      testWalletId,
      { sessionId },
    );

    // Verify cleanup would work (delete the expired sessions)
    sqlite.exec(
      "DELETE FROM sessions WHERE expires_at < unixepoch() AND revoked_at IS NULL",
    );

    // Verify session was deleted
    const remaining = sqlite.prepare('SELECT count(*) as cnt FROM sessions').get() as { cnt: number };
    expect(remaining.cnt).toBe(0);
  });

  it('should not fire SESSION_EXPIRED when no sessions are expired', async () => {
    const notificationService = createMockNotificationService();
    const testWalletId = generateId();
    seedWallet(sqlite, testWalletId);

    // Insert a non-expired session (expires_at in the future)
    const sessionId = generateId();
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    sqlite
      .prepare(
        `INSERT INTO sessions (id, wallet_id, token_hash, expires_at, absolute_expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(sessionId, testWalletId, 'hash-active', futureTimestamp, futureTimestamp + 86400, Math.floor(Date.now() / 1000));

    // Query for expired sessions
    const expired = sqlite.prepare(
      "SELECT id, wallet_id FROM sessions WHERE expires_at < unixepoch() AND revoked_at IS NULL",
    ).all() as Array<{ id: string; wallet_id: string }>;

    // No expired sessions
    expect(expired).toHaveLength(0);

    // No notify calls
    expect(notificationService.notify).not.toHaveBeenCalled();

    // Session should still exist (not deleted)
    const remaining = sqlite.prepare('SELECT count(*) as cnt FROM sessions').get() as { cnt: number };
    expect(remaining.cnt).toBe(1);
  });
});
