/**
 * WcSessionService unit tests: session restore / delete / hasActiveSession.
 *
 * Tests the SQLite-level session management without SignClient (no relay connection).
 * Directly invokes private methods via (service as any) for DB-level verification,
 * since SignClient.init() requires an external relay connection.
 *
 * Uses in-memory SQLite with pushSchema for a fresh DB per test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { WcSessionService } from '../services/wc-session-service.js';
import type * as schema from '../infrastructure/database/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_MASTER_PASSWORD = 'test-master-password';

function createTestDb(): { sqlite: DatabaseType; db: BetterSQLite3Database<typeof schema> } {
  const conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  return conn;
}

function createTestSettingsService(
  db: BetterSQLite3Database<typeof schema>,
): SettingsService {
  return new SettingsService({
    db,
    config: DaemonConfigSchema.parse({}),
    masterPassword: TEST_MASTER_PASSWORD,
  });
}

const now = () => Math.floor(Date.now() / 1000);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WcSessionService', () => {
  let sqlite: DatabaseType;
  let db: BetterSQLite3Database<typeof schema>;
  let service: WcSessionService;

  beforeEach(() => {
    const conn = createTestDb();
    sqlite = conn.sqlite;
    db = conn.db;
    const settingsService = createTestSettingsService(db);
    service = new WcSessionService({ sqlite, settingsService });
  });

  afterEach(() => {
    try {
      sqlite.close();
    } catch {
      // already closed
    }
  });

  // -------------------------------------------------------------------------
  // hasActiveSession - empty state
  // -------------------------------------------------------------------------

  describe('hasActiveSession (empty state)', () => {
    it('returns false when no sessions exist', () => {
      expect(service.hasActiveSession('wallet-1')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // restoreSessions - restore from DB to in-memory map
  // -------------------------------------------------------------------------

  describe('restoreSessions', () => {
    it('restores walletId -> topic mappings from wc_sessions table', () => {
      const ts = now();

      // Insert wallet first (FK constraint)
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-wc-1', 'WC Wallet 1', 'ethereum', 'testnet', 'ethereum-sepolia', 'pk-wc-1', 'ACTIVE', 0, ts, ts);

      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-wc-2', 'WC Wallet 2', 'solana', 'testnet', 'devnet', 'pk-wc-2', 'ACTIVE', 0, ts, ts);

      // Insert wc_sessions directly
      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('w-wc-1', 'topic-aaa', 'eip155:11155111', '0xOwner1', ts + 86400, ts);

      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('w-wc-2', 'topic-bbb', 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', 'OwnerSol2', ts + 86400, ts);

      // Call restoreSessions via private method access
      (service as any).restoreSessions();

      // Verify in-memory map via hasActiveSession
      expect(service.hasActiveSession('w-wc-1')).toBe(true);
      expect(service.hasActiveSession('w-wc-2')).toBe(true);
      expect(service.hasActiveSession('w-wc-999')).toBe(false);
    });

    it('handles empty wc_sessions table without error', () => {
      expect(() => (service as any).restoreSessions()).not.toThrow();
      expect(service.hasActiveSession('any-wallet')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // handleSessionDelete - removes from DB and in-memory map
  // -------------------------------------------------------------------------

  describe('handleSessionDelete', () => {
    it('removes session from DB and in-memory map by topic', () => {
      const ts = now();

      // Create wallet
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-del-1', 'WC Del', 'ethereum', 'testnet', 'ethereum-sepolia', 'pk-del-1', 'ACTIVE', 0, ts, ts);

      // Insert session
      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('w-del-1', 'topic-delete-me', 'eip155:11155111', '0xOwner', ts + 86400, ts);

      // Restore to populate in-memory map
      (service as any).restoreSessions();
      expect(service.hasActiveSession('w-del-1')).toBe(true);

      // Delete by topic
      (service as any).handleSessionDelete('topic-delete-me');

      // Verify removed from in-memory map
      expect(service.hasActiveSession('w-del-1')).toBe(false);

      // Verify removed from DB
      const row = sqlite.prepare('SELECT * FROM wc_sessions WHERE topic = ?').get('topic-delete-me');
      expect(row).toBeUndefined();
    });

    it('does not throw when deleting non-existent topic', () => {
      expect(() => (service as any).handleSessionDelete('non-existent-topic')).not.toThrow();
    });

    it('only removes the matching session, preserving others', () => {
      const ts = now();

      // Create two wallets
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-keep', 'WC Keep', 'ethereum', 'testnet', 'ethereum-sepolia', 'pk-keep', 'ACTIVE', 0, ts, ts);

      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-remove', 'WC Remove', 'ethereum', 'mainnet', 'ethereum-mainnet', 'pk-remove', 'ACTIVE', 0, ts, ts);

      // Insert two sessions
      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('w-keep', 'topic-keep', 'eip155:1', '0xKeep', ts + 86400, ts);

      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('w-remove', 'topic-remove', 'eip155:1', '0xRemove', ts + 86400, ts);

      // Restore
      (service as any).restoreSessions();
      expect(service.hasActiveSession('w-keep')).toBe(true);
      expect(service.hasActiveSession('w-remove')).toBe(true);

      // Delete one
      (service as any).handleSessionDelete('topic-remove');

      // Verify only the targeted session is removed
      expect(service.hasActiveSession('w-keep')).toBe(true);
      expect(service.hasActiveSession('w-remove')).toBe(false);

      // Verify DB state
      const remaining = sqlite.prepare('SELECT COUNT(*) as cnt FROM wc_sessions').get() as { cnt: number };
      expect(remaining.cnt).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getSignClient - returns null when not initialized
  // -------------------------------------------------------------------------

  describe('getSignClient', () => {
    it('returns null when initialize() has not been called', () => {
      expect(service.getSignClient()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // shutdown - storage closed guard
  // -------------------------------------------------------------------------

  describe('shutdown (storage closed guard)', () => {
    it('marks storage as closed after shutdown()', async () => {
      // Manually assign a storage instance to simulate initialized state
      const { SqliteKeyValueStorage } = await import('../services/wc-storage.js');
      const storage = new SqliteKeyValueStorage(sqlite);
      (service as any).storage = storage;

      await service.shutdown();

      // Storage should be closed — setItem is no-op, no DB errors
      await expect(storage.setItem('after-shutdown', 'value')).resolves.not.toThrow();
      const row = sqlite.prepare('SELECT * FROM wc_store WHERE key = ?').get('after-shutdown');
      expect(row).toBeUndefined();
    });

    it('does not throw when storage is null (WC not initialized)', async () => {
      await expect(service.shutdown()).resolves.not.toThrow();
    });
  });
});
