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
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-wc-1', 'WC Wallet 1', 'ethereum', 'testnet', 'pk-wc-1', 'ACTIVE', 0, ts, ts);

      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-wc-2', 'WC Wallet 2', 'solana', 'testnet', 'pk-wc-2', 'ACTIVE', 0, ts, ts);

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
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-del-1', 'WC Del', 'ethereum', 'testnet', 'pk-del-1', 'ACTIVE', 0, ts, ts);

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
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-keep', 'WC Keep', 'ethereum', 'testnet', 'pk-keep', 'ACTIVE', 0, ts, ts);

      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-remove', 'WC Remove', 'ethereum', 'mainnet', 'pk-remove', 'ACTIVE', 0, ts, ts);

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
  // getSessionTopic
  // -------------------------------------------------------------------------

  describe('getSessionTopic', () => {
    it('returns null when no session exists for wallet', () => {
      expect(service.getSessionTopic('no-such-wallet')).toBeNull();
    });

    it('returns topic when session exists in memory map', () => {
      const ts = now();
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-topic-1', 'Topic Wallet', 'ethereum', 'testnet', 'pk-t1', 'ACTIVE', 0, ts, ts);
      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('w-topic-1', 'topic-xyz', 'eip155:11155111', '0xOwner', ts + 86400, ts);
      (service as any).restoreSessions();

      expect(service.getSessionTopic('w-topic-1')).toBe('topic-xyz');
    });
  });

  // -------------------------------------------------------------------------
  // getSessionInfo
  // -------------------------------------------------------------------------

  describe('getSessionInfo', () => {
    it('returns null when no session exists', () => {
      expect(service.getSessionInfo('no-wallet')).toBeNull();
    });

    it('returns session info with parsed peer metadata', () => {
      const ts = now();
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-info-1', 'Info Wallet', 'ethereum', 'testnet', 'pk-i1', 'ACTIVE', 0, ts, ts);
      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, peer_meta, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-info-1', 'topic-info', JSON.stringify({ name: 'MetaMask', url: 'https://metamask.io' }), 'eip155:1', '0xAddr', ts + 86400, ts);

      const info = service.getSessionInfo('w-info-1');
      expect(info).not.toBeNull();
      expect(info!.walletId).toBe('w-info-1');
      expect(info!.topic).toBe('topic-info');
      expect(info!.peerName).toBe('MetaMask');
      expect(info!.peerUrl).toBe('https://metamask.io');
      expect(info!.chainId).toBe('eip155:1');
      expect(info!.ownerAddress).toBe('0xAddr');
    });

    it('returns null peer fields when peer_meta is null', () => {
      const ts = now();
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-info-2', 'Info Wallet 2', 'solana', 'testnet', 'pk-i2', 'ACTIVE', 0, ts, ts);
      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, peer_meta, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-info-2', 'topic-info-2', null, 'solana:devnet', 'SolAddr', ts + 86400, ts);

      const info = service.getSessionInfo('w-info-2');
      expect(info).not.toBeNull();
      expect(info!.peerName).toBeNull();
      expect(info!.peerUrl).toBeNull();
    });

    it('handles invalid peer_meta JSON gracefully', () => {
      const ts = now();
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-info-3', 'Info Wallet 3', 'ethereum', 'testnet', 'pk-i3', 'ACTIVE', 0, ts, ts);
      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, peer_meta, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-info-3', 'topic-info-3', 'not-json', 'eip155:1', '0xAddr3', ts + 86400, ts);

      const info = service.getSessionInfo('w-info-3');
      expect(info).not.toBeNull();
      expect(info!.peerName).toBeNull();
      expect(info!.peerUrl).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getPairingStatus
  // -------------------------------------------------------------------------

  describe('getPairingStatus', () => {
    it('returns "none" when no session or pending pairing exists', () => {
      expect(service.getPairingStatus('w-none')).toBe('none');
    });

    it('returns "connected" when wallet has active session', () => {
      const ts = now();
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-conn', 'Connected', 'ethereum', 'testnet', 'pk-c', 'ACTIVE', 0, ts, ts);
      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('w-conn', 'topic-conn', 'eip155:1', '0xC', ts + 86400, ts);
      (service as any).restoreSessions();

      expect(service.getPairingStatus('w-conn')).toBe('connected');
    });

    it('returns "pending" when pairing is not yet expired', () => {
      const futureExpiry = Math.floor(Date.now() / 1000) + 300;
      (service as any).pendingPairing.set('w-pending', { expiresAt: futureExpiry, uri: 'wc:xxx' });

      expect(service.getPairingStatus('w-pending')).toBe('pending');
    });

    it('returns "expired" and cleans up when pairing has expired', () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 10;
      (service as any).pendingPairing.set('w-expired', { expiresAt: pastExpiry, uri: 'wc:old' });

      expect(service.getPairingStatus('w-expired')).toBe('expired');
      // Verify cleanup
      expect((service as any).pendingPairing.has('w-expired')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // createPairing - error cases
  // -------------------------------------------------------------------------

  describe('createPairing', () => {
    it('throws WC_NOT_CONFIGURED when signClient is null', async () => {
      await expect(service.createPairing('w1', 'mainnet', 'ethereum'))
        .rejects.toThrow('WalletConnect is not configured');
    });

    it('throws WC_SESSION_EXISTS when wallet already has active session', async () => {
      (service as any).signClient = {};
      (service as any).sessionMap.set('w-dup', 'topic-existing');

      await expect(service.createPairing('w-dup', 'mainnet', 'ethereum'))
        .rejects.toThrow('Wallet already has an active WC session');
    });

    it('returns existing pending pairing if not expired', async () => {
      const futureExpiry = Math.floor(Date.now() / 1000) + 300;
      (service as any).signClient = {};
      (service as any).pendingPairing.set('w-reuse', { expiresAt: futureExpiry, uri: 'wc:existing-uri' });

      const result = await service.createPairing('w-reuse', 'ethereum-sepolia', 'ethereum');
      expect(result.uri).toBe('wc:existing-uri');
      expect(result.qrDataUrl).toContain('data:image/png;base64');
      expect(result.expiresAt).toBe(futureExpiry);
    });

    it('creates new pairing via signClient.connect for EVM', async () => {
      const mockApproval = () => new Promise<any>(() => {}); // never resolves
      const mockSignClient = {
        connect: async () => ({ uri: 'wc:new-uri', approval: mockApproval }),
      };
      (service as any).signClient = mockSignClient;

      const result = await service.createPairing('w-new', 'ethereum-sepolia', 'ethereum');
      expect(result.uri).toBe('wc:new-uri');
      expect(result.qrDataUrl).toContain('data:image/png;base64');
      expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('creates new pairing via signClient.connect for Solana', async () => {
      const mockApproval = () => new Promise<any>(() => {}); // never resolves
      const mockSignClient = {
        connect: async () => ({ uri: 'wc:sol-uri', approval: mockApproval }),
      };
      (service as any).signClient = mockSignClient;

      const result = await service.createPairing('w-sol', 'solana-devnet', 'solana');
      expect(result.uri).toBe('wc:sol-uri');
    });

    it('throws when signClient.connect returns no URI', async () => {
      const mockSignClient = {
        connect: async () => ({ uri: undefined, approval: () => Promise.resolve() }),
      };
      (service as any).signClient = mockSignClient;

      await expect(service.createPairing('w-fail', 'ethereum-sepolia', 'ethereum'))
        .rejects.toThrow('Failed to generate pairing URI');
    });
  });

  // -------------------------------------------------------------------------
  // waitForApproval
  // -------------------------------------------------------------------------

  describe('waitForApproval (private)', () => {
    it('saves session to DB and sessionMap on successful approval', async () => {
      const ts = now();
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-approve', 'Approve Wallet', 'ethereum', 'testnet', 'pk-a', 'ACTIVE', 0, ts, ts);

      const mockSession = {
        topic: 'topic-approved',
        namespaces: { eip155: { accounts: ['eip155:11155111:0xApproved'] } },
        peer: { metadata: { name: 'TestWallet', url: 'https://test.com' } },
        expiry: ts + 86400,
      };
      const approval = () => Promise.resolve(mockSession);

      (service as any).pendingPairing.set('w-approve', { expiresAt: ts + 300, uri: 'wc:x' });

      (service as any).waitForApproval('w-approve', 'eip155:11155111', approval);

      // Wait for the promise to settle
      await new Promise(r => setTimeout(r, 50));

      expect(service.hasActiveSession('w-approve')).toBe(true);
      expect(service.getSessionTopic('w-approve')).toBe('topic-approved');
      expect((service as any).pendingPairing.has('w-approve')).toBe(false);
    });

    it('rejects session when connected address does not match owner', async () => {
      const ts = now();
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at, owner_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-mismatch', 'Mismatch', 'ethereum', 'testnet', 'pk-m', 'ACTIVE', 1, ts, ts, '0xRegisteredOwner');

      const mockSession = {
        topic: 'topic-mismatch',
        namespaces: { eip155: { accounts: ['eip155:1:0xDifferentAddr'] } },
        peer: { metadata: null },
        expiry: ts + 86400,
      };
      const mockDisconnect = async () => {};
      (service as any).signClient = { disconnect: mockDisconnect };
      (service as any).pendingPairing.set('w-mismatch', { expiresAt: ts + 300, uri: 'wc:y' });

      const approval = () => Promise.resolve(mockSession);
      (service as any).waitForApproval('w-mismatch', 'eip155:1', approval);

      await new Promise(r => setTimeout(r, 50));

      expect(service.hasActiveSession('w-mismatch')).toBe(false);
      expect((service as any).pendingPairing.has('w-mismatch')).toBe(false);
    });

    it('cleans up pending pairing on approval rejection', async () => {
      (service as any).pendingPairing.set('w-reject', { expiresAt: 9999999999, uri: 'wc:z' });

      const approval = () => Promise.reject(new Error('user rejected'));
      (service as any).waitForApproval('w-reject', 'eip155:1', approval);

      await new Promise(r => setTimeout(r, 50));

      expect((service as any).pendingPairing.has('w-reject')).toBe(false);
    });

    it('matches owner case-insensitively for EVM chains', async () => {
      const ts = now();
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at, owner_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-case', 'Case Wallet', 'ethereum', 'testnet', 'pk-c', 'ACTIVE', 1, ts, ts, '0xAbCdEf');

      const mockSession = {
        topic: 'topic-case',
        namespaces: { eip155: { accounts: ['eip155:1:0xabcdef'] } },
        peer: { metadata: null },
        expiry: ts + 86400,
      };
      (service as any).pendingPairing.set('w-case', { expiresAt: ts + 300, uri: 'wc:c' });

      const approval = () => Promise.resolve(mockSession);
      (service as any).waitForApproval('w-case', 'eip155:1', approval);

      await new Promise(r => setTimeout(r, 50));

      expect(service.hasActiveSession('w-case')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // disconnectSession - error cases
  // -------------------------------------------------------------------------

  describe('disconnectSession', () => {
    it('throws WC_NOT_CONFIGURED when signClient is null', async () => {
      await expect(service.disconnectSession('w1'))
        .rejects.toThrow('WalletConnect is not configured');
    });

    it('throws WC_SESSION_NOT_FOUND when wallet has no active session', async () => {
      (service as any).signClient = {};
      await expect(service.disconnectSession('w-no-session'))
        .rejects.toThrow('No active WC session for this wallet');
    });

    it('calls signClient.disconnect and cleans up on success', async () => {
      const ts = now();
      sqlite.prepare(
        `INSERT INTO wallets (id, name, chain, environment, public_key, status, owner_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('w-disc', 'Disc Wallet', 'ethereum', 'testnet', 'pk-d', 'ACTIVE', 0, ts, ts);
      sqlite.prepare(
        `INSERT INTO wc_sessions (wallet_id, topic, chain_id, owner_address, expiry, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('w-disc', 'topic-disc', 'eip155:1', '0xD', ts + 86400, ts);
      (service as any).restoreSessions();

      // Mock signClient with disconnect
      const mockDisconnect = async () => {};
      (service as any).signClient = { disconnect: mockDisconnect };

      await service.disconnectSession('w-disc');

      expect(service.hasActiveSession('w-disc')).toBe(false);
      const row = sqlite.prepare('SELECT * FROM wc_sessions WHERE wallet_id = ?').get('w-disc');
      expect(row).toBeUndefined();
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

    it('clears signClient, sessionMap, and pendingPairing on shutdown', async () => {
      // Simulate initialized state
      const mockRelayer = { provider: { disconnect: async () => {} } };
      (service as any).signClient = { core: { relayer: mockRelayer } };
      (service as any).sessionMap.set('w1', 'topic1');
      (service as any).pendingPairing.set('w2', { expiresAt: 999, uri: 'wc:x' });

      const { SqliteKeyValueStorage } = await import('../services/wc-storage.js');
      (service as any).storage = new SqliteKeyValueStorage(sqlite);

      await service.shutdown();

      expect(service.getSignClient()).toBeNull();
      expect(service.hasActiveSession('w1')).toBe(false);
      expect((service as any).pendingPairing.size).toBe(0);
    });

    it('handles relayer disconnect error gracefully', async () => {
      const mockRelayer = {
        provider: { disconnect: async () => { throw new Error('relay error'); } },
      };
      (service as any).signClient = { core: { relayer: mockRelayer } };

      await expect(service.shutdown()).resolves.not.toThrow();
      expect(service.getSignClient()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // initialize - no-op when project_id not configured
  // -------------------------------------------------------------------------

  describe('initialize', () => {
    it('does nothing when walletconnect.project_id is not set', async () => {
      await service.initialize();
      expect(service.getSignClient()).toBeNull();
    });
  });
});
