/**
 * WalletAppService unit tests.
 *
 * Tests cover:
 * - register(), ensureRegistered(), getByName(), getById()
 * - list(), listWithUsedBy(), getAlertEnabledApps()
 * - update() toggle fields
 * - remove()
 * - Duplicate 409 and not-found 404 error cases
 *
 * @see packages/daemon/src/services/signing-sdk/wallet-app-service.ts
 * @see internal/objectives/m29-07-dcent-owner-signing.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { WalletAppService } from '../services/signing-sdk/wallet-app-service.js';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let service: WalletAppService;

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  pushSchema(sqlite);
  service = new WalletAppService(sqlite);
});

afterEach(() => {
  sqlite?.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowTs(): number {
  return Math.floor(Date.now() / 1000);
}

function seedWallet(id: string, name: string, walletType: string | null): void {
  const ts = nowTs();
  sqlite.prepare(
    `INSERT INTO wallets (id, name, chain, environment, public_key, status, wallet_type, created_at, updated_at)
     VALUES (?, ?, 'solana', 'testnet', ?, 'ACTIVE', ?, ?, ?)`,
  ).run(id, name, `pk-${id}`, walletType, ts, ts);
}

// ---------------------------------------------------------------------------
// Tests: register
// ---------------------------------------------------------------------------

describe('WalletAppService', () => {
  describe('register()', () => {
    it('T-APP-02: creates a wallet app with correct fields', () => {
      const app = service.register('dcent', "D'CENT Wallet");

      expect(app.id).toBeTruthy();
      expect(app.name).toBe('dcent');
      expect(app.displayName).toBe("D'CENT Wallet");
      expect(app.signingEnabled).toBe(true);
      expect(app.alertsEnabled).toBe(true);
      expect(app.createdAt).toBeGreaterThan(0);
      expect(app.updatedAt).toBeGreaterThan(0);

      // Verify DB row
      const row = sqlite.prepare('SELECT * FROM wallet_apps WHERE id = ?').get(app.id);
      expect(row).toBeTruthy();
    });

    it('T-APP-07: duplicate name throws WALLET_APP_DUPLICATE (409)', () => {
      service.register('dcent', "D'CENT Wallet");

      expect(() => service.register('dcent', 'Another')).toThrow(WAIaaSError);
      try {
        service.register('dcent', 'Another');
      } catch (err) {
        const waErr = err as WAIaaSError;
        expect(waErr.code).toBe('WALLET_APP_DUPLICATE');
        expect(waErr.httpStatus).toBe(409);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: ensureRegistered
  // ---------------------------------------------------------------------------

  describe('ensureRegistered()', () => {
    it('T-APP-07b: idempotent — returns existing app on duplicate', () => {
      const first = service.ensureRegistered('dcent', "D'CENT Wallet");
      const second = service.ensureRegistered('dcent', 'Different Display Name');

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('dcent');
      // Display name should remain as original (not updated)
      expect(second.displayName).toBe("D'CENT Wallet");
    });

    it('creates new app when name does not exist', () => {
      const app = service.ensureRegistered('new-app', 'New App');
      expect(app.name).toBe('new-app');
      expect(app.displayName).toBe('New App');
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: list
  // ---------------------------------------------------------------------------

  describe('list()', () => {
    it('T-APP-03: returns registered apps in created_at order', () => {
      service.register('alpha', 'Alpha');
      service.register('beta', 'Beta');

      const apps = service.list();
      expect(apps).toHaveLength(2);
      expect(apps[0]!.name).toBe('alpha');
      expect(apps[1]!.name).toBe('beta');
    });

    it('returns empty array when no apps', () => {
      expect(service.list()).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: getByName / getById
  // ---------------------------------------------------------------------------

  describe('getByName() / getById()', () => {
    it('getByName returns the app', () => {
      const registered = service.register('dcent', "D'CENT");
      const found = service.getByName('dcent');
      expect(found).toBeTruthy();
      expect(found!.id).toBe(registered.id);
    });

    it('getByName returns undefined for nonexistent', () => {
      expect(service.getByName('nonexistent')).toBeUndefined();
    });

    it('getById returns the app', () => {
      const registered = service.register('dcent', "D'CENT");
      const found = service.getById(registered.id);
      expect(found).toBeTruthy();
      expect(found!.name).toBe('dcent');
    });

    it('getById returns undefined for nonexistent', () => {
      expect(service.getById('nonexistent-id')).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: update
  // ---------------------------------------------------------------------------

  describe('update()', () => {
    it('T-APP-04: toggles signing_enabled', () => {
      const app = service.register('dcent', "D'CENT");
      expect(app.signingEnabled).toBe(true);

      const updated = service.update(app.id, { signingEnabled: false });
      expect(updated.signingEnabled).toBe(false);
      expect(updated.alertsEnabled).toBe(true); // unchanged
    });

    it('toggles alerts_enabled', () => {
      const app = service.register('dcent', "D'CENT");
      const updated = service.update(app.id, { alertsEnabled: false });
      expect(updated.alertsEnabled).toBe(false);
      expect(updated.signingEnabled).toBe(true); // unchanged
    });

    it('T-APP-04b: throws WALLET_APP_NOT_FOUND for unknown id', () => {
      expect(() => service.update('nonexistent', { signingEnabled: false })).toThrow(WAIaaSError);
      try {
        service.update('nonexistent', { signingEnabled: false });
      } catch (err) {
        const waErr = err as WAIaaSError;
        expect(waErr.code).toBe('WALLET_APP_NOT_FOUND');
        expect(waErr.httpStatus).toBe(404);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: remove
  // ---------------------------------------------------------------------------

  describe('remove()', () => {
    it('T-APP-05: deletes app from database', () => {
      const app = service.register('dcent', "D'CENT");
      service.remove(app.id);
      expect(service.list()).toHaveLength(0);
    });

    it('T-APP-05b: throws WALLET_APP_NOT_FOUND for unknown id', () => {
      expect(() => service.remove('nonexistent')).toThrow(WAIaaSError);
      try {
        service.remove('nonexistent');
      } catch (err) {
        const waErr = err as WAIaaSError;
        expect(waErr.code).toBe('WALLET_APP_NOT_FOUND');
        expect(waErr.httpStatus).toBe(404);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: listWithUsedBy
  // ---------------------------------------------------------------------------

  describe('listWithUsedBy()', () => {
    it('T-APP-10: includes wallet references', () => {
      service.register('dcent', "D'CENT Wallet");
      seedWallet('w1', 'my-wallet', 'dcent');

      const apps = service.listWithUsedBy();
      expect(apps).toHaveLength(1);
      expect(apps[0]!.usedBy).toHaveLength(1);
      expect(apps[0]!.usedBy[0]!.id).toBe('w1');
      expect(apps[0]!.usedBy[0]!.label).toBe('my-wallet');
    });

    it('T-APP-10b: shows empty usedBy when no wallets use the app', () => {
      service.register('dcent', "D'CENT Wallet");

      const apps = service.listWithUsedBy();
      expect(apps).toHaveLength(1);
      expect(apps[0]!.usedBy).toHaveLength(0);
    });

    it('shows multiple wallet references', () => {
      service.register('dcent', "D'CENT Wallet");
      seedWallet('w1', 'wallet-a', 'dcent');
      seedWallet('w2', 'wallet-b', 'dcent');

      const apps = service.listWithUsedBy();
      expect(apps[0]!.usedBy).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Tests: getAlertEnabledApps
  // ---------------------------------------------------------------------------

  describe('getAlertEnabledApps()', () => {
    it('T-APP-03b: filters by alerts_enabled', () => {
      const app1 = service.register('dcent', "D'CENT");
      const app2 = service.register('custom', 'Custom');
      service.update(app2.id, { alertsEnabled: false });

      const alertApps = service.getAlertEnabledApps();
      expect(alertApps).toHaveLength(1);
      expect(alertApps[0]!.name).toBe('dcent');
    });

    it('returns empty when all apps have alerts disabled', () => {
      const app = service.register('dcent', "D'CENT");
      service.update(app.id, { alertsEnabled: false });

      expect(service.getAlertEnabledApps()).toHaveLength(0);
    });
  });
});
