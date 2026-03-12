/**
 * Tests for credential crypto utilities and LocalCredentialVault.
 *
 * Coverage:
 * - credential-crypto: HKDF domain separation, AES-256-GCM encrypt/decrypt, AAD binding, wrong password/AAD
 * - LocalCredentialVault: create/get/list/delete/rotate, per-wallet vs global priority, expiry, duplicate detection
 *
 * Uses in-memory SQLite with Drizzle schema push.
 *
 * @see packages/daemon/src/infrastructure/credential/credential-crypto.ts
 * @see packages/daemon/src/infrastructure/credential/credential-vault.ts
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type * as schema from '../infrastructure/database/schema.js';
import {
  deriveCredentialKey,
  encryptCredential,
  decryptCredential,
} from '../infrastructure/credential/credential-crypto.js';
import { LocalCredentialVault } from '../infrastructure/credential/credential-vault.js';
import { deriveSettingsKey } from '../infrastructure/settings/settings-crypto.js';
import type { CreateCredentialParams } from '@waiaas/core';
import { wallets } from '../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-pw';
const WALLET_ID = 'wlt_test-wallet-001';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let db: BetterSQLite3Database<typeof schema>;

function ensureWallet(walletId: string): void {
  const existing = db.select().from(wallets).where(eq(wallets.id, walletId)).get();
  if (!existing) {
    db.insert(wallets)
      .values({
        id: walletId,
        name: walletId,
        chain: 'ethereum',
        environment: 'mainnet',
        publicKey: `pk_${walletId}_${Date.now()}`,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  }
}

beforeAll(() => {
  const conn = createDatabase(':memory:');
  db = conn.db;
  pushSchema(conn.sqlite);
  // Create the wallet needed for per-wallet credential tests
  ensureWallet(WALLET_ID);
});

// ---------------------------------------------------------------------------
// credential-crypto
// ---------------------------------------------------------------------------

describe('credential-crypto', () => {
  describe('deriveCredentialKey', () => {
    it('should derive a 32-byte Buffer', () => {
      const key = deriveCredentialKey(TEST_PASSWORD);
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should derive a different key from deriveSettingsKey (domain separation)', () => {
      const credKey = deriveCredentialKey(TEST_PASSWORD);
      const settingsKey = deriveSettingsKey(TEST_PASSWORD);
      expect(credKey.equals(settingsKey)).toBe(false);
    });

    it('should derive the same key for the same password', () => {
      const key1 = deriveCredentialKey(TEST_PASSWORD);
      const key2 = deriveCredentialKey(TEST_PASSWORD);
      expect(key1.equals(key2)).toBe(true);
    });
  });

  describe('encryptCredential / decryptCredential', () => {
    it('should round-trip encrypt and decrypt', () => {
      const plaintext = 'my-secret-api-key-12345';
      const aad = 'cred-id:global:api-key';
      const encrypted = encryptCredential(plaintext, TEST_PASSWORD, aad);

      expect(encrypted.encryptedValue).toBeInstanceOf(Buffer);
      expect(encrypted.iv).toBeInstanceOf(Buffer);
      expect(encrypted.iv.length).toBe(12);
      expect(encrypted.authTag).toBeInstanceOf(Buffer);
      expect(encrypted.authTag.length).toBe(16);

      const decrypted = decryptCredential(encrypted, TEST_PASSWORD, aad);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw on wrong password', () => {
      const encrypted = encryptCredential('secret', TEST_PASSWORD, 'aad');
      expect(() => decryptCredential(encrypted, 'wrong-password', 'aad')).toThrow();
    });

    it('should throw on wrong AAD', () => {
      const encrypted = encryptCredential('secret', TEST_PASSWORD, 'correct-aad');
      expect(() => decryptCredential(encrypted, TEST_PASSWORD, 'wrong-aad')).toThrow();
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const aad = 'test-aad';
      const enc1 = encryptCredential('same-value', TEST_PASSWORD, aad);
      const enc2 = encryptCredential('same-value', TEST_PASSWORD, aad);
      expect(enc1.iv.equals(enc2.iv)).toBe(false);
      expect(enc1.encryptedValue.equals(enc2.encryptedValue)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// LocalCredentialVault
// ---------------------------------------------------------------------------

describe('LocalCredentialVault', () => {
  let vault: LocalCredentialVault;

  beforeEach(() => {
    // Fresh vault instance; DB state persists from previous tests
    vault = new LocalCredentialVault(db, () => TEST_PASSWORD);
  });

  const makeParams = (
    overrides: Partial<CreateCredentialParams> = {},
  ): CreateCredentialParams => ({
    type: 'api-key' as const,
    name: `test-cred-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    value: 'secret-value-123',
    ...overrides,
  });

  describe('create', () => {
    it('should create a global credential (walletId=null)', async () => {
      const params = makeParams({ name: 'global-cred-create' });
      const meta = await vault.create(null, params);

      expect(meta.id).toBeDefined();
      expect(meta.walletId).toBeNull();
      expect(meta.type).toBe('api-key');
      expect(meta.name).toBe('global-cred-create');
      expect(meta.metadata).toEqual({});
      expect(meta.createdAt).toBeDefined();
      expect(meta.updatedAt).toBeDefined();
      // value must never appear in metadata
      expect('value' in meta).toBe(false);
    });

    it('should create a per-wallet credential', async () => {
      const params = makeParams({ name: 'wallet-cred-create' });
      const meta = await vault.create(WALLET_ID, params);

      expect(meta.walletId).toBe(WALLET_ID);
      expect(meta.name).toBe('wallet-cred-create');
    });

    it('should throw conflict on duplicate name for same walletId', async () => {
      const name = `dup-name-${Date.now()}`;
      const params = makeParams({ name });
      await vault.create(null, params);
      await expect(vault.create(null, makeParams({ name }))).rejects.toThrow();
    });

    it('should allow same name for different walletIds', async () => {
      const name = `shared-name-${Date.now()}`;
      const globalMeta = await vault.create(null, makeParams({ name }));
      const walletMeta = await vault.create(WALLET_ID, makeParams({ name }));
      expect(globalMeta.id).not.toBe(walletMeta.id);
    });
  });

  describe('get', () => {
    it('should get by UUID and return decrypted value', async () => {
      const params = makeParams({ name: `get-uuid-${Date.now()}`, value: 'my-secret' });
      const created = await vault.create(null, params);

      const result = await vault.get(created.id);
      expect(result.value).toBe('my-secret');
      expect(result.id).toBe(created.id);
    });

    it('should throw CREDENTIAL_NOT_FOUND for non-existent UUID', async () => {
      await expect(vault.get('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        /not found|CREDENTIAL_NOT_FOUND/i,
      );
    });

    it('should throw CREDENTIAL_EXPIRED for expired credential', async () => {
      const params = makeParams({
        name: `expired-${Date.now()}`,
        expiresAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      });
      const created = await vault.create(null, params);

      await expect(vault.get(created.id)).rejects.toThrow(
        /expired|CREDENTIAL_EXPIRED/i,
      );
    });

    it('should resolve by name with per-wallet priority over global', async () => {
      const name = `priority-${Date.now()}`;
      await vault.create(null, makeParams({ name, value: 'global-secret' }));
      await vault.create(WALLET_ID, makeParams({ name, value: 'wallet-secret' }));

      const result = await vault.get(name, WALLET_ID);
      expect(result.value).toBe('wallet-secret');
    });

    it('should resolve by name with global fallback when no per-wallet match', async () => {
      const name = `global-only-${Date.now()}`;
      await vault.create(null, makeParams({ name, value: 'global-fallback' }));

      const result = await vault.get(name, WALLET_ID);
      expect(result.value).toBe('global-fallback');
    });

    it('should throw CREDENTIAL_NOT_FOUND when name does not match any', async () => {
      await expect(vault.get('nonexistent-name', WALLET_ID)).rejects.toThrow(
        /not found|CREDENTIAL_NOT_FOUND/i,
      );
    });
  });

  describe('list', () => {
    it('should list global credentials without value', async () => {
      const name = `list-global-${Date.now()}`;
      await vault.create(null, makeParams({ name }));

      const list = await vault.list();
      const found = list.find((c) => c.name === name);
      expect(found).toBeDefined();
      expect('value' in (found as Record<string, unknown>)).toBe(false);
    });

    it('should list per-wallet credentials', async () => {
      const name = `list-wallet-${Date.now()}`;
      const walletId = `wlt_list-${Date.now()}`;
      ensureWallet(walletId);
      await vault.create(walletId, makeParams({ name }));

      const list = await vault.list(walletId);
      const found = list.find((c) => c.name === name);
      expect(found).toBeDefined();
      expect(found!.walletId).toBe(walletId);
    });
  });

  describe('delete', () => {
    it('should delete a credential', async () => {
      const params = makeParams({ name: `delete-${Date.now()}` });
      const created = await vault.create(null, params);

      await vault.delete(created.id);
      await expect(vault.get(created.id)).rejects.toThrow(
        /not found|CREDENTIAL_NOT_FOUND/i,
      );
    });
  });

  describe('rotate', () => {
    it('should re-encrypt with new value', async () => {
      const params = makeParams({ name: `rotate-${Date.now()}`, value: 'old-value' });
      const created = await vault.create(null, params);

      const updated = await vault.rotate(created.id, 'new-value');
      expect(updated.id).toBe(created.id);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
      // value must not appear in metadata
      expect('value' in updated).toBe(false);

      // Verify new value is decrypted correctly
      const decrypted = await vault.get(created.id);
      expect(decrypted.value).toBe('new-value');
    });
  });
});
