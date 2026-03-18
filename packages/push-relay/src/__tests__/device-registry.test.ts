import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import { DeviceRegistry } from '../registry/device-registry.js';

let registry: DeviceRegistry;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `push-relay-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  registry = new DeviceRegistry(join(tmpDir, 'test.db'));
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true });
});

describe('DeviceRegistry', () => {
  it('registers a device and retrieves tokens by wallet name', () => {
    registry.register('dcent', 'token-1', 'ios');
    registry.register('dcent', 'token-2', 'android');

    const tokens = registry.getTokensByWalletName('dcent');
    expect(tokens).toHaveLength(2);
    expect(tokens).toContain('token-1');
    expect(tokens).toContain('token-2');
  });

  it('returns empty array for unknown wallet', () => {
    expect(registry.getTokensByWalletName('unknown')).toEqual([]);
  });

  it('upserts on duplicate push_token', () => {
    registry.register('dcent', 'token-1', 'ios');
    registry.register('other-wallet', 'token-1', 'android');

    const dcentTokens = registry.getTokensByWalletName('dcent');
    expect(dcentTokens).toEqual([]);

    const otherTokens = registry.getTokensByWalletName('other-wallet');
    expect(otherTokens).toEqual(['token-1']);
  });

  it('unregisters a token', () => {
    registry.register('dcent', 'token-1', 'ios');
    expect(registry.unregister('token-1')).toBe(true);
    expect(registry.getTokensByWalletName('dcent')).toEqual([]);
  });

  it('returns false when unregistering non-existent token', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('removes multiple tokens', () => {
    registry.register('dcent', 'token-1', 'ios');
    registry.register('dcent', 'token-2', 'android');
    registry.register('dcent', 'token-3', 'ios');

    registry.removeTokens(['token-1', 'token-3']);
    const tokens = registry.getTokensByWalletName('dcent');
    expect(tokens).toEqual(['token-2']);
  });

  it('handles removeTokens with empty array', () => {
    registry.register('dcent', 'token-1', 'ios');
    registry.removeTokens([]);
    expect(registry.getTokensByWalletName('dcent')).toEqual(['token-1']);
  });

  it('counts registered devices', () => {
    expect(registry.count()).toBe(0);
    registry.register('dcent', 'token-1', 'ios');
    registry.register('dcent', 'token-2', 'android');
    expect(registry.count()).toBe(2);
  });

  it('getByPushToken returns device record', () => {
    registry.register('dcent', 'token-1', 'ios');
    const device = registry.getByPushToken('token-1');
    expect(device).not.toBeNull();
    expect(device!.walletName).toBe('dcent');
    expect(device!.platform).toBe('ios');
    expect(device!.pushToken).toBe('token-1');
    expect(device!.subscriptionToken).toBeTruthy();
  });

  it('getByPushToken returns null for unknown token', () => {
    expect(registry.getByPushToken('nonexistent')).toBeNull();
  });

  it('listAll returns all devices', () => {
    registry.register('w1', 'token-1', 'ios');
    registry.register('w2', 'token-2', 'android');
    registry.register('w1', 'token-3', 'ios');

    const devices = registry.listAll();
    expect(devices).toHaveLength(3);
    const names = devices.map((d) => d.walletName);
    expect(names).toContain('w1');
    expect(names).toContain('w2');
  });

  it('listAll returns empty array when no devices', () => {
    expect(registry.listAll()).toEqual([]);
  });

  it('getBySubscriptionToken returns device for valid token', () => {
    const result = registry.register('dcent', 'token-1', 'ios');
    const device = registry.getBySubscriptionToken(result.subscriptionToken);
    expect(device).not.toBeNull();
    expect(device!.pushToken).toBe('token-1');
    expect(device!.walletName).toBe('dcent');
    expect(device!.subscriptionToken).toBe(result.subscriptionToken);
  });

  it('getBySubscriptionToken returns null for unknown token', () => {
    expect(registry.getBySubscriptionToken('nonexistent')).toBeNull();
  });

  it('getBySubscriptionToken isolates devices — same wallet different tokens', () => {
    const r1 = registry.register('dcent', 'token-1', 'ios');
    const r2 = registry.register('dcent', 'token-2', 'android');

    const d1 = registry.getBySubscriptionToken(r1.subscriptionToken);
    const d2 = registry.getBySubscriptionToken(r2.subscriptionToken);

    expect(d1!.pushToken).toBe('token-1');
    expect(d2!.pushToken).toBe('token-2');
  });

  it('enforces subscription_token uniqueness via index', () => {
    registry.register('w1', 'token-1', 'ios');
    const token1 = registry.getSubscriptionToken('token-1');
    expect(token1).toBeTruthy();

    // Force duplicate subscription_token via raw SQL
    const dbPath = join(tmpDir, 'test.db');
    const rawDb = new Database(dbPath);
    expect(() => {
      rawDb.prepare(
        `INSERT INTO devices (push_token, wallet_name, platform, subscription_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('token-dup', 'w2', 'android', token1, 0, 0);
    }).toThrow(/UNIQUE/);
    rawDb.close();
  });
});

describe('DeviceRegistry sign response cleanup', () => {
  it('cleanupExpiredResponses removes expired entries', () => {
    // Save a response with 1 second TTL
    registry.saveSignResponse('req-expired', '{"action":"approve"}', 1);
    // Save one with long TTL
    registry.saveSignResponse('req-valid', '{"action":"reject"}', 3600);

    // Advance time by manipulating the stored expires_at via raw check
    // Instead, just wait — but we can use a trick: save with TTL=0 which expires immediately
    registry.saveSignResponse('req-instant-expire', '{"action":"approve"}', 0);

    const cleaned = registry.cleanupExpiredResponses();
    // At least the TTL=0 one should be cleaned
    expect(cleaned).toBeGreaterThanOrEqual(1);

    // The valid one should still be there
    expect(registry.getSignResponse('req-valid')).not.toBeNull();
  });

  it('cleanupExpiredResponses returns 0 when nothing expired', () => {
    registry.saveSignResponse('req-future', '{"action":"approve"}', 3600);
    const cleaned = registry.cleanupExpiredResponses();
    expect(cleaned).toBe(0);
  });
});

describe('DeviceRegistry migration', () => {
  it('migrates existing DB without subscription_token column', () => {
    const dir = join(tmpdir(), `push-relay-mig-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, 'legacy.db');

    // Create legacy schema without subscription_token
    const legacyDb = new Database(dbPath);
    legacyDb.pragma('journal_mode = WAL');
    legacyDb.exec(`
      CREATE TABLE devices (
        push_token TEXT PRIMARY KEY,
        wallet_name TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    legacyDb.exec(`CREATE INDEX IF NOT EXISTS idx_devices_wallet_name ON devices(wallet_name)`);
    legacyDb.prepare('INSERT INTO devices (push_token, wallet_name, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('existing-token', 'old-wallet', 'ios', 1000, 1000);
    legacyDb.close();

    // DeviceRegistry constructor triggers migration — should NOT crash
    const reg = new DeviceRegistry(dbPath);
    expect(reg.count()).toBe(1);

    // subscription_token column should exist after migration
    const result = reg.register('new-wallet', 'new-token', 'android');
    expect(result.subscriptionToken).toBeTruthy();

    // Existing row's subscription_token is null (not yet assigned)
    expect(reg.getSubscriptionToken('existing-token')).toBeNull();

    reg.close();
    rmSync(dir, { recursive: true });
  });

  it('re-opening an already-migrated DB does not error', () => {
    const dir = join(tmpdir(), `push-relay-reopen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, 'test.db');

    const reg1 = new DeviceRegistry(dbPath);
    reg1.register('w', 't', 'ios');
    reg1.close();

    // Second open — migration should be idempotent
    const reg2 = new DeviceRegistry(dbPath);
    expect(reg2.count()).toBe(1);
    reg2.close();

    rmSync(dir, { recursive: true });
  });
});
