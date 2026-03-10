/**
 * Tests for PolymarketApiKeyService: lazy API Key creation + encrypted storage.
 *
 * Plan 371-03 Task 1: ApiKeyService tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { PolymarketApiKeyService } from '../api-key-service.js';
import type { ApiKeyDb, PolymarketApiKeyRow } from '../api-key-service.js';
import type { PolymarketClobClient, ApiCredentials } from '../clob-client.js';
import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const WALLET_ID = 'wallet-001';
const WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;

const TEST_CREDS: ApiCredentials = {
  apiKey: 'test-api-key',
  secret: 'dGVzdC1zZWNyZXQ=', // base64 "test-secret"
  passphrase: 'test-passphrase',
};

function createMockDb(): ApiKeyDb & { rows: Map<string, PolymarketApiKeyRow> } {
  const rows = new Map<string, PolymarketApiKeyRow>();
  return {
    rows,
    getApiKeyByWalletId(walletId: string) {
      for (const row of rows.values()) {
        if (row.wallet_id === walletId) return row;
      }
      return null;
    },
    insertApiKey(row: Omit<PolymarketApiKeyRow, 'created_at'>) {
      rows.set(row.id, { ...row, created_at: Math.floor(Date.now() / 1000) });
    },
    deleteApiKeyByWalletId(walletId: string) {
      for (const [id, row] of rows.entries()) {
        if (row.wallet_id === walletId) rows.delete(id);
      }
    },
  };
}

function createMockClobClient(): PolymarketClobClient {
  return {
    createApiKey: vi.fn().mockResolvedValue(TEST_CREDS),
    deleteApiKey: vi.fn().mockResolvedValue(undefined),
  } as unknown as PolymarketClobClient;
}

// Simple encrypt/decrypt (rot13-like for testing)
const encrypt = (s: string) => `enc:${s}`;
const decrypt = (s: string) => s.replace('enc:', '');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PolymarketApiKeyService', () => {
  it('ensureApiKeys creates key on first call', async () => {
    const db = createMockDb();
    const client = createMockClobClient();
    const service = new PolymarketApiKeyService(client, db, encrypt, decrypt, () => 'uuid-1');

    const creds = await service.ensureApiKeys(WALLET_ID, WALLET_ADDRESS, PRIVATE_KEY);

    expect(creds.apiKey).toBe(TEST_CREDS.apiKey);
    expect(creds.secret).toBe(TEST_CREDS.secret);
    expect(creds.passphrase).toBe(TEST_CREDS.passphrase);
    expect(client.createApiKey).toHaveBeenCalledTimes(1);
    expect(db.rows.size).toBe(1);
  });

  it('ensureApiKeys returns cached on subsequent calls', async () => {
    const db = createMockDb();
    const client = createMockClobClient();
    const service = new PolymarketApiKeyService(client, db, encrypt, decrypt, () => 'uuid-2');

    // First call creates
    await service.ensureApiKeys(WALLET_ID, WALLET_ADDRESS, PRIVATE_KEY);
    expect(client.createApiKey).toHaveBeenCalledTimes(1);

    // Second call returns cached
    const creds = await service.ensureApiKeys(WALLET_ID, WALLET_ADDRESS, PRIVATE_KEY);
    expect(client.createApiKey).toHaveBeenCalledTimes(1); // Not called again
    expect(creds.apiKey).toBe(TEST_CREDS.apiKey);
  });

  it('secret and passphrase are encrypted in DB', async () => {
    const db = createMockDb();
    const client = createMockClobClient();
    const service = new PolymarketApiKeyService(client, db, encrypt, decrypt, () => 'uuid-3');

    await service.ensureApiKeys(WALLET_ID, WALLET_ADDRESS, PRIVATE_KEY);

    const row = db.rows.get('uuid-3')!;
    expect(row.api_key).toBe(TEST_CREDS.apiKey); // plaintext
    expect(row.api_secret_encrypted).toBe(`enc:${TEST_CREDS.secret}`); // encrypted
    expect(row.api_passphrase_encrypted).toBe(`enc:${TEST_CREDS.passphrase}`); // encrypted
  });

  it('getApiKeys returns decrypted credentials', async () => {
    const db = createMockDb();
    const client = createMockClobClient();
    const service = new PolymarketApiKeyService(client, db, encrypt, decrypt, () => 'uuid-4');

    await service.ensureApiKeys(WALLET_ID, WALLET_ADDRESS, PRIVATE_KEY);

    const creds = service.getApiKeys(WALLET_ID);
    expect(creds).not.toBeNull();
    expect(creds!.secret).toBe(TEST_CREDS.secret);
    expect(creds!.passphrase).toBe(TEST_CREDS.passphrase);
  });

  it('getApiKeys returns null for unknown wallet', () => {
    const db = createMockDb();
    const client = createMockClobClient();
    const service = new PolymarketApiKeyService(client, db, encrypt, decrypt);

    const creds = service.getApiKeys('unknown-wallet');
    expect(creds).toBeNull();
  });

  it('deleteApiKeys removes from CLOB and DB', async () => {
    const db = createMockDb();
    const client = createMockClobClient();
    const service = new PolymarketApiKeyService(client, db, encrypt, decrypt, () => 'uuid-5');

    await service.ensureApiKeys(WALLET_ID, WALLET_ADDRESS, PRIVATE_KEY);
    expect(db.rows.size).toBe(1);

    await service.deleteApiKeys(WALLET_ID, WALLET_ADDRESS, PRIVATE_KEY);

    expect(client.deleteApiKey).toHaveBeenCalledTimes(1);
    expect(db.rows.size).toBe(0);
  });
});
