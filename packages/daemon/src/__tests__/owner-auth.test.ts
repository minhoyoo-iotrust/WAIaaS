/**
 * ownerAuth middleware tests: Ed25519 signature verification for Solana owner addresses.
 *
 * Tests cover:
 * 1. rejects with 401 INVALID_SIGNATURE when headers missing
 * 2. rejects with 404 WALLET_NOT_FOUND when wallet does not exist
 * 3. rejects with 404 OWNER_NOT_CONNECTED when wallet has no owner
 * 4. rejects with 401 INVALID_SIGNATURE when owner address does not match
 * 5. rejects with 401 INVALID_SIGNATURE when signature is invalid
 * 6. passes through when valid Ed25519 signature matches owner address
 *
 * Uses Hono app.request() testing pattern + in-memory SQLite + sodium-native.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createRequire } from 'node:module';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createOwnerAuth } from '../api/middleware/owner-auth.js';
import { errorHandler } from '../api/middleware/error-handler.js';

type SodiumNative = typeof import('sodium-native');

const require = createRequire(import.meta.url);
const sodium = require('sodium-native') as SodiumNative;

// ---------------------------------------------------------------------------
// Base58 encode helper (for converting public key to address in tests)
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buf: Buffer): string {
  let zeroes = 0;
  for (let i = 0; i < buf.length && buf[i] === 0; i++) {
    zeroes++;
  }

  const size = Math.ceil((buf.length * 138) / 100) + 1;
  const b58 = new Uint8Array(size);
  let length = 0;

  for (let i = zeroes; i < buf.length; i++) {
    let carry = buf[i]!;
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 256 * (b58[k] ?? 0);
      b58[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }

  let str = '1'.repeat(zeroes);
  let leadingZeros = true;
  for (let i = 0; i < size; i++) {
    if (leadingZeros && b58[i] === 0) continue;
    leadingZeros = false;
    str += BASE58_ALPHABET[b58[i]!];
  }

  return str || '1';
}

// ---------------------------------------------------------------------------
// Test keypair generation helpers
// ---------------------------------------------------------------------------

interface TestKeypair {
  publicKey: Buffer;
  secretKey: Buffer;
  address: string; // base58 encoded public key
}

function generateTestKeypair(): TestKeypair {
  const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
  const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
  sodium.crypto_sign_keypair(publicKey, secretKey);

  return {
    publicKey,
    secretKey,
    address: encodeBase58(publicKey),
  };
}

function signMessage(message: string, secretKey: Buffer): string {
  const messageBytes = Buffer.from(message, 'utf8');
  const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
  sodium.crypto_sign_detached(signature, messageBytes, secretKey);
  return signature.toString('base64');
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let app: Hono;
let ownerKeypair: TestKeypair;

const TEST_WALLET_ID = '00000001-0001-7001-8001-000000000001';

/** Type-safe JSON body extraction from Response. */
async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Create a test app with ownerAuth middleware on /protected/:id/action */
function createTestApp(database: ReturnType<typeof createDatabase>['db']) {
  const testApp = new Hono();
  testApp.onError(errorHandler);
  testApp.use('/protected/:id/action', createOwnerAuth({ db: database }));
  testApp.post('/protected/:id/action', (c) => {
    const ownerAddress = c.get('ownerAddress' as never) as string | undefined;
    return c.json({ ok: true, ownerAddress });
  });
  return testApp;
}

/** Seed a test wallet with optional owner address */
function seedWallet(opts?: { ownerAddress?: string | null }) {
  const ts = nowSeconds();
  sqlite.prepare(
    `INSERT INTO wallets (id, name, chain, network, public_key, status, owner_verified, owner_address, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    TEST_WALLET_ID,
    'Owner Test Wallet',
    'solana',
    'mainnet',
    `pk-owner-auth-test`,
    'ACTIVE',
    0,
    opts?.ownerAddress ?? null,
    ts,
    ts,
  );
}

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  ownerKeypair = generateTestKeypair();
  app = createTestApp(db);
});

afterEach(() => {
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ownerAuth middleware', () => {
  it('rejects with 401 INVALID_SIGNATURE when headers missing', async () => {
    seedWallet({ ownerAddress: ownerKeypair.address });

    // No headers at all
    const res = await app.request(`/protected/${TEST_WALLET_ID}/action`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('INVALID_SIGNATURE');
  });

  it('rejects with 404 WALLET_NOT_FOUND when wallet does not exist', async () => {
    const message = 'test-message';
    const sig = signMessage(message, ownerKeypair.secretKey);

    const res = await app.request('/protected/nonexistent-wallet-id/action', {
      method: 'POST',
      headers: {
        'X-Owner-Signature': sig,
        'X-Owner-Message': message,
        'X-Owner-Address': ownerKeypair.address,
      },
    });
    expect(res.status).toBe(404);

    const body = await json(res);
    expect(body.code).toBe('WALLET_NOT_FOUND');
  });

  it('rejects with 404 OWNER_NOT_CONNECTED when wallet has no owner', async () => {
    seedWallet({ ownerAddress: null });

    const message = 'test-message';
    const sig = signMessage(message, ownerKeypair.secretKey);

    const res = await app.request(`/protected/${TEST_WALLET_ID}/action`, {
      method: 'POST',
      headers: {
        'X-Owner-Signature': sig,
        'X-Owner-Message': message,
        'X-Owner-Address': ownerKeypair.address,
      },
    });
    expect(res.status).toBe(404);

    const body = await json(res);
    expect(body.code).toBe('OWNER_NOT_CONNECTED');
  });

  it('rejects with 401 INVALID_SIGNATURE when owner address does not match', async () => {
    // Register a different address as owner
    const otherKeypair = generateTestKeypair();
    seedWallet({ ownerAddress: otherKeypair.address });

    const message = 'test-message';
    const sig = signMessage(message, ownerKeypair.secretKey);

    const res = await app.request(`/protected/${TEST_WALLET_ID}/action`, {
      method: 'POST',
      headers: {
        'X-Owner-Signature': sig,
        'X-Owner-Message': message,
        'X-Owner-Address': ownerKeypair.address, // different from wallet owner
      },
    });
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('INVALID_SIGNATURE');
  });

  it('rejects with 401 INVALID_SIGNATURE when signature is invalid', async () => {
    seedWallet({ ownerAddress: ownerKeypair.address });

    const message = 'test-message';
    // Sign a different message to produce invalid signature for this message
    const wrongSig = signMessage('different-message', ownerKeypair.secretKey);

    const res = await app.request(`/protected/${TEST_WALLET_ID}/action`, {
      method: 'POST',
      headers: {
        'X-Owner-Signature': wrongSig,
        'X-Owner-Message': message,
        'X-Owner-Address': ownerKeypair.address,
      },
    });
    expect(res.status).toBe(401);

    const body = await json(res);
    expect(body.code).toBe('INVALID_SIGNATURE');
  });

  it('passes through when valid Ed25519 signature matches owner address', async () => {
    seedWallet({ ownerAddress: ownerKeypair.address });

    const message = 'approve-transaction-1234';
    const sig = signMessage(message, ownerKeypair.secretKey);

    const res = await app.request(`/protected/${TEST_WALLET_ID}/action`, {
      method: 'POST',
      headers: {
        'X-Owner-Signature': sig,
        'X-Owner-Message': message,
        'X-Owner-Address': ownerKeypair.address,
      },
    });
    expect(res.status).toBe(200);

    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.ownerAddress).toBe(ownerKeypair.address);
  });
});
