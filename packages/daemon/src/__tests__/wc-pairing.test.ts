/**
 * WcSessionService pairing / session management unit tests (Phase 147).
 *
 * Tests createPairing, getSessionInfo, getPairingStatus, disconnectSession,
 * getSessionTopic, and CAIP2_CHAIN_IDS constant verification.
 *
 * Uses in-memory SQLite with pushSchema for a fresh DB per test.
 * SignClient is mocked via (service as any).signClient assignment.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { WcSessionService, CAIP2_CHAIN_IDS } from '../services/wc-session-service.js';
import type * as schema from '../infrastructure/database/schema.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_MASTER_PASSWORD = 'test-master-password';
const WALLET_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee01';
const _WALLET_ID_2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee02';

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

function insertTestWallet(sqlite: DatabaseType, walletId: string, chain = 'ethereum', network = 'ethereum-sepolia'): void {
  const ts = now();
  sqlite.prepare(
    `INSERT INTO wallets (id, name, chain, environment, default_network, public_key, status, owner_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(walletId, `Wallet ${walletId.slice(-2)}`, chain, 'testnet', network, `pk-${walletId.slice(-4)}`, 'ACTIVE', 0, ts, ts);
}

function insertTestSession(
  sqlite: DatabaseType,
  walletId: string,
  topic: string,
  chainId = 'eip155:11155111',
  ownerAddress = '0xOwnerAddr',
): void {
  const ts = now();
  sqlite.prepare(
    `INSERT INTO wc_sessions (wallet_id, topic, peer_meta, chain_id, owner_address, namespaces, expiry, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(walletId, topic, JSON.stringify({ name: 'TestWallet', url: 'https://test.example.com' }), chainId, ownerAddress, '{}', ts + 86400, ts);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WcSessionService Pairing', () => {
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
  // createPairing
  // -------------------------------------------------------------------------

  describe('createPairing', () => {
    it('throws WC_NOT_CONFIGURED when signClient is null', async () => {
      // signClient is null by default (initialize() not called)
      expect(service.getSignClient()).toBeNull();

      try {
        await service.createPairing(WALLET_ID, 'ethereum-sepolia', 'ethereum');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        expect((err as WAIaaSError).code).toBe('WC_NOT_CONFIGURED');
        expect((err as WAIaaSError).httpStatus).toBe(503);
      }
    });

    it('throws WC_SESSION_EXISTS when wallet already has active session', async () => {
      insertTestWallet(sqlite, WALLET_ID);
      insertTestSession(sqlite, WALLET_ID, 'topic-existing');

      // Restore session map
      (service as any).restoreSessions();
      expect(service.hasActiveSession(WALLET_ID)).toBe(true);

      // Set a mock signClient to pass the null check
      (service as any).signClient = {};

      try {
        await service.createPairing(WALLET_ID, 'ethereum-sepolia', 'ethereum');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        expect((err as WAIaaSError).code).toBe('WC_SESSION_EXISTS');
        expect((err as WAIaaSError).httpStatus).toBe(409);
      }
    });

    it('returns existing pending pairing if still valid', async () => {
      // Manually set a pending pairing
      const futureExpiry = now() + 200;
      (service as any).pendingPairing.set(WALLET_ID, {
        expiresAt: futureExpiry,
        uri: 'wc:test-uri-123@2?relay-protocol=irn&symKey=abc',
      });

      // Set a mock signClient
      (service as any).signClient = {};

      const result = await service.createPairing(WALLET_ID, 'ethereum-sepolia', 'ethereum');

      expect(result.uri).toBe('wc:test-uri-123@2?relay-protocol=irn&symKey=abc');
      expect(result.expiresAt).toBe(futureExpiry);
      // QR data URL should be a data URI
      expect(result.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  // -------------------------------------------------------------------------
  // getPairingStatus
  // -------------------------------------------------------------------------

  describe('getPairingStatus', () => {
    it('returns "none" when no state exists', () => {
      expect(service.getPairingStatus(WALLET_ID)).toBe('none');
    });

    it('returns "pending" when pairing is in progress and not expired', () => {
      (service as any).pendingPairing.set(WALLET_ID, {
        expiresAt: now() + 200,
        uri: 'wc:pending-uri@2',
      });

      expect(service.getPairingStatus(WALLET_ID)).toBe('pending');
    });

    it('returns "expired" and cleans up when pairing has expired', () => {
      (service as any).pendingPairing.set(WALLET_ID, {
        expiresAt: now() - 10, // already expired
        uri: 'wc:expired-uri@2',
      });

      expect(service.getPairingStatus(WALLET_ID)).toBe('expired');
      // Verify cleanup
      expect((service as any).pendingPairing.has(WALLET_ID)).toBe(false);
    });

    it('returns "connected" when wallet has active session', () => {
      insertTestWallet(sqlite, WALLET_ID);
      insertTestSession(sqlite, WALLET_ID, 'topic-connected');
      (service as any).restoreSessions();

      expect(service.getPairingStatus(WALLET_ID)).toBe('connected');
    });
  });

  // -------------------------------------------------------------------------
  // getSessionInfo
  // -------------------------------------------------------------------------

  describe('getSessionInfo', () => {
    it('returns session info when session exists in DB', () => {
      insertTestWallet(sqlite, WALLET_ID);
      insertTestSession(sqlite, WALLET_ID, 'topic-info', 'eip155:11155111', '0xABC123');

      const info = service.getSessionInfo(WALLET_ID);
      expect(info).not.toBeNull();
      expect(info!.walletId).toBe(WALLET_ID);
      expect(info!.topic).toBe('topic-info');
      expect(info!.peerName).toBe('TestWallet');
      expect(info!.peerUrl).toBe('https://test.example.com');
      expect(info!.chainId).toBe('eip155:11155111');
      expect(info!.ownerAddress).toBe('0xABC123');
      expect(info!.expiry).toBeGreaterThan(now());
      expect(info!.createdAt).toBeGreaterThan(0);
    });

    it('returns null when no session exists', () => {
      const info = service.getSessionInfo(WALLET_ID);
      expect(info).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // disconnectSession
  // -------------------------------------------------------------------------

  describe('disconnectSession', () => {
    it('throws WC_NOT_CONFIGURED when signClient is null', async () => {
      try {
        await service.disconnectSession(WALLET_ID);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        expect((err as WAIaaSError).code).toBe('WC_NOT_CONFIGURED');
      }
    });

    it('throws WC_SESSION_NOT_FOUND when no session in sessionMap', async () => {
      // Set a mock signClient
      (service as any).signClient = {
        disconnect: async () => {},
      };

      try {
        await service.disconnectSession(WALLET_ID);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        expect((err as WAIaaSError).code).toBe('WC_SESSION_NOT_FOUND');
        expect((err as WAIaaSError).httpStatus).toBe(404);
      }
    });
  });

  // -------------------------------------------------------------------------
  // getSessionTopic
  // -------------------------------------------------------------------------

  describe('getSessionTopic', () => {
    it('returns topic when session exists in map', () => {
      insertTestWallet(sqlite, WALLET_ID);
      insertTestSession(sqlite, WALLET_ID, 'topic-public');
      (service as any).restoreSessions();

      expect(service.getSessionTopic(WALLET_ID)).toBe('topic-public');
    });

    it('returns null when no session exists', () => {
      expect(service.getSessionTopic(WALLET_ID)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // CAIP2_CHAIN_IDS constant verification
  // -------------------------------------------------------------------------

  describe('CAIP2_CHAIN_IDS', () => {
    it('maps Solana devnet correctly', () => {
      expect(CAIP2_CHAIN_IDS['devnet']).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
    });

    it('maps ethereum-sepolia correctly', () => {
      expect(CAIP2_CHAIN_IDS['ethereum-sepolia']).toBe('eip155:11155111');
    });

    it('maps Solana mainnet correctly', () => {
      expect(CAIP2_CHAIN_IDS['mainnet']).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
    });

    it('maps base-sepolia correctly', () => {
      expect(CAIP2_CHAIN_IDS['base-sepolia']).toBe('eip155:84532');
    });

    it('has 13 entries total (3 Solana + 10 EVM)', () => {
      expect(Object.keys(CAIP2_CHAIN_IDS).length).toBe(13);
    });
  });
});
