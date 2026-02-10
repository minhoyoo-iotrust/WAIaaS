/**
 * JwtSecretManager unit tests: dual-key rotation, sign/verify, key_value_store persistence.
 *
 * Tests cover:
 * 1. initialize() creates jwt_secret_current in key_value_store on first call
 * 2. initialize() loads existing secret on subsequent calls (idempotent)
 * 3. getCurrentSecret() returns a 64-char hex string
 * 4. getValidSecrets() returns single secret when no rotation
 * 5. rotateSecret() creates new current, moves old to previous
 * 6. getValidSecrets() returns two secrets within 5-min window after rotation
 * 7. rotateSecret() throws ROTATION_TOO_RECENT if called within 5 minutes
 * 8. signToken() produces a string starting with wai_sess_
 * 9. verifyToken() decodes a valid token correctly (sub, agt, exp)
 * 10. verifyToken() throws INVALID_TOKEN for garbage tokens
 * 11. verifyToken() throws TOKEN_EXPIRED for expired tokens
 * 12. verifyToken() succeeds with previous key during rotation window
 *
 * Uses in-memory SQLite with Drizzle (same pattern as database.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema, keyValueStore } from '../infrastructure/database/index.js';
import { eq } from 'drizzle-orm';
import { JwtSecretManager, type JwtPayload } from '../infrastructure/jwt/index.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let manager: JwtSecretManager;

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);
  manager = new JwtSecretManager(db);
});

afterEach(() => {
  vi.useRealTimers();
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const nowSeconds = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// 1. initialize() tests
// ---------------------------------------------------------------------------

describe('JwtSecretManager', () => {
  describe('initialize()', () => {
    it('creates jwt_secret_current in key_value_store on first call', async () => {
      await manager.initialize();

      const row = db
        .select()
        .from(keyValueStore)
        .where(eq(keyValueStore.key, 'jwt_secret_current'))
        .get();

      expect(row).toBeDefined();
      expect(row!.key).toBe('jwt_secret_current');

      const parsed = JSON.parse(row!.value) as { secret: string; createdAt: number };
      expect(parsed.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof parsed.createdAt).toBe('number');
    });

    it('loads existing secret on subsequent calls (idempotent)', async () => {
      await manager.initialize();
      const secret1 = await manager.getCurrentSecret();

      // Create a fresh manager and initialize again
      const manager2 = new JwtSecretManager(db);
      await manager2.initialize();
      const secret2 = await manager2.getCurrentSecret();

      expect(secret1).toBe(secret2);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. getCurrentSecret() tests
  // ---------------------------------------------------------------------------

  describe('getCurrentSecret()', () => {
    it('returns a 64-char hex string', async () => {
      await manager.initialize();
      const secret = await manager.getCurrentSecret();

      expect(secret).toMatch(/^[0-9a-f]{64}$/);
      expect(secret).toHaveLength(64);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. getValidSecrets() tests
  // ---------------------------------------------------------------------------

  describe('getValidSecrets()', () => {
    it('returns single secret when no rotation', async () => {
      await manager.initialize();
      const secrets = await manager.getValidSecrets();

      expect(secrets).toHaveLength(1);
      expect(secrets[0]).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns two secrets within 5-min window after rotation', async () => {
      vi.useFakeTimers();
      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      await manager.initialize();
      const oldSecret = await manager.getCurrentSecret();

      // Advance 6 minutes to allow rotation
      vi.setSystemTime(baseTime + 6 * 60 * 1000);
      await manager.rotateSecret();

      const secrets = await manager.getValidSecrets();
      expect(secrets).toHaveLength(2);

      const newSecret = await manager.getCurrentSecret();
      expect(newSecret).not.toBe(oldSecret);
      expect(secrets).toContain(newSecret);
      expect(secrets).toContain(oldSecret);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. rotateSecret() tests
  // ---------------------------------------------------------------------------

  describe('rotateSecret()', () => {
    it('creates new current, moves old to previous', async () => {
      vi.useFakeTimers();
      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      await manager.initialize();
      const oldSecret = await manager.getCurrentSecret();

      // Advance 6 minutes to allow rotation
      vi.setSystemTime(baseTime + 6 * 60 * 1000);
      await manager.rotateSecret();

      const newSecret = await manager.getCurrentSecret();
      expect(newSecret).not.toBe(oldSecret);
      expect(newSecret).toMatch(/^[0-9a-f]{64}$/);

      // Check that previous is stored in DB
      const prevRow = db
        .select()
        .from(keyValueStore)
        .where(eq(keyValueStore.key, 'jwt_secret_previous'))
        .get();
      expect(prevRow).toBeDefined();

      const prevParsed = JSON.parse(prevRow!.value) as { secret: string };
      expect(prevParsed.secret).toBe(oldSecret);
    });

    it('throws ROTATION_TOO_RECENT if called within 5 minutes', async () => {
      vi.useFakeTimers();
      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      await manager.initialize();

      // Try to rotate immediately (less than 5 min since initialization)
      await expect(manager.rotateSecret()).rejects.toMatchObject({
        code: 'ROTATION_TOO_RECENT',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. signToken() tests
  // ---------------------------------------------------------------------------

  describe('signToken()', () => {
    it('produces a string starting with wai_sess_', async () => {
      await manager.initialize();

      const payload: JwtPayload = {
        sub: 'session-id-123',
        agt: 'agent-id-456',
        iat: nowSeconds(),
        exp: nowSeconds() + 3600,
      };

      const token = await manager.signToken(payload);
      expect(token).toMatch(/^wai_sess_/);
      expect(token.length).toBeGreaterThan('wai_sess_'.length + 10);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. verifyToken() tests
  // ---------------------------------------------------------------------------

  describe('verifyToken()', () => {
    it('decodes a valid token correctly (sub, agt, exp)', async () => {
      await manager.initialize();

      const now = nowSeconds();
      const payload: JwtPayload = {
        sub: 'session-id-abc',
        agt: 'agent-id-xyz',
        iat: now,
        exp: now + 3600,
      };

      const token = await manager.signToken(payload);
      const decoded = await manager.verifyToken(token);

      expect(decoded.sub).toBe('session-id-abc');
      expect(decoded.agt).toBe('agent-id-xyz');
      expect(decoded.exp).toBe(now + 3600);
    });

    it('throws INVALID_TOKEN for garbage tokens', async () => {
      await manager.initialize();

      await expect(manager.verifyToken('wai_sess_garbage.token.here')).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
      });
    });

    it('throws TOKEN_EXPIRED for expired tokens', async () => {
      await manager.initialize();

      const past = nowSeconds() - 3600;
      const payload: JwtPayload = {
        sub: 'session-id-expired',
        agt: 'agent-id-expired',
        iat: past - 7200,
        exp: past,
      };

      const token = await manager.signToken(payload);
      await expect(manager.verifyToken(token)).rejects.toMatchObject({
        code: 'TOKEN_EXPIRED',
      });
    });

    it('succeeds with previous key during rotation window', async () => {
      vi.useFakeTimers();
      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      await manager.initialize();

      const now = Math.floor(baseTime / 1000);
      const payload: JwtPayload = {
        sub: 'session-id-rotation',
        agt: 'agent-id-rotation',
        iat: now,
        exp: now + 3600,
      };

      // Sign token with current (old) secret
      const token = await manager.signToken(payload);

      // Advance 6 minutes and rotate
      vi.setSystemTime(baseTime + 6 * 60 * 1000);
      await manager.rotateSecret();

      // Token signed with old key should still verify during rotation window
      const decoded = await manager.verifyToken(token);
      expect(decoded.sub).toBe('session-id-rotation');
      expect(decoded.agt).toBe('agent-id-rotation');
    });
  });
});
