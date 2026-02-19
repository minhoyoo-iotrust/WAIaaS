/**
 * Tests for daemon startup master password validation (Issue 090).
 *
 * Validates the 3-way password verification logic added in Step 2b:
 *   1. DB hash exists -> verify with argon2
 *   2. No DB hash + keystore files -> decrypt first keystore (migration)
 *   3. No DB hash + no keystore -> first install, store hash
 *
 * Uses real SQLite DB, real Argon2id, and real AES-256-GCM encryption
 * (no mocks) to ensure correctness of the cryptographic validation path.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema, keyValueStore } from '../infrastructure/database/index.js';
import { encrypt, decrypt } from '../infrastructure/keystore/crypto.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORRECT_PASSWORD = 'correct-password-123!';
const WRONG_PASSWORD = 'wrong-password-456!';

/** Argon2id params matching Step 2b in daemon.ts */
const STEP2B_ARGON2_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = join(tmpdir(), `waiaas-pw-validation-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

/** Create a test DB with key_value_store table */
function createTestDb(dir: string) {
  const dbPath = join(dir, 'test.db');
  const { sqlite, db } = createDatabase(dbPath);
  pushSchema(sqlite);
  return { sqlite, db };
}

/** Create a fake keystore file encrypted with the given password */
async function createKeystoreFile(dir: string, walletId: string, password: string) {
  const keystoreDir = join(dir, 'keystore');
  if (!existsSync(keystoreDir)) {
    mkdirSync(keystoreDir, { recursive: true });
  }

  // Encrypt a dummy private key (32 bytes)
  const dummyKey = Buffer.alloc(32, 0xab);
  const encrypted = await encrypt(dummyKey, password);

  const keystoreData = {
    version: 1,
    id: randomUUID(),
    chain: 'solana',
    network: 'devnet',
    curve: 'ed25519',
    publicKey: 'DummyPublicKeyBase58',
    crypto: {
      cipher: 'aes-256-gcm',
      cipherparams: { iv: encrypted.iv.toString('hex') },
      ciphertext: encrypted.ciphertext.toString('hex'),
      authTag: encrypted.authTag.toString('hex'),
      kdf: 'argon2id',
      kdfparams: {
        salt: encrypted.salt.toString('hex'),
        memoryCost: encrypted.kdfparams.memoryCost,
        timeCost: encrypted.kdfparams.timeCost,
        parallelism: encrypted.kdfparams.parallelism,
        hashLength: encrypted.kdfparams.hashLength,
      },
    },
    metadata: {
      name: walletId,
      createdAt: new Date().toISOString(),
      lastUnlockedAt: null,
    },
  };

  const filePath = join(keystoreDir, `${walletId}.json`);
  writeFileSync(filePath, JSON.stringify(keystoreData, null, 2), 'utf-8');
  return filePath;
}

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('master password validation (Issue 090)', () => {
  it('1. first install -- stores hash in DB', async () => {
    const dir = createTempDir();
    const { db, sqlite } = createTestDb(dir);

    // No keystore files, no DB hash -> first install
    // Simulate Step 2b: store hash
    const hash = await argon2.hash(CORRECT_PASSWORD, STEP2B_ARGON2_PARAMS);
    db.insert(keyValueStore)
      .values({
        key: 'master_password_hash',
        value: hash,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .run();

    // Verify hash was stored
    const stored = db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .get();

    expect(stored).toBeDefined();
    expect(stored!.value).toBe(hash);
    expect(await argon2.verify(stored!.value, CORRECT_PASSWORD)).toBe(true);

    sqlite.close();
  });

  it('2. DB hash exists -- correct password passes verification', async () => {
    const dir = createTempDir();
    const { db, sqlite } = createTestDb(dir);

    // Pre-store hash
    const hash = await argon2.hash(CORRECT_PASSWORD, STEP2B_ARGON2_PARAMS);
    db.insert(keyValueStore)
      .values({
        key: 'master_password_hash',
        value: hash,
        updatedAt: new Date(),
      })
      .run();

    // Simulate Step 2b Path A: verify correct password
    const stored = db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .get();

    expect(stored).toBeDefined();
    const isValid = await argon2.verify(stored!.value, CORRECT_PASSWORD);
    expect(isValid).toBe(true);

    sqlite.close();
  });

  it('3. DB hash exists -- wrong password fails verification', async () => {
    const dir = createTempDir();
    const { db, sqlite } = createTestDb(dir);

    // Pre-store hash with correct password
    const hash = await argon2.hash(CORRECT_PASSWORD, STEP2B_ARGON2_PARAMS);
    db.insert(keyValueStore)
      .values({
        key: 'master_password_hash',
        value: hash,
        updatedAt: new Date(),
      })
      .run();

    // Simulate Step 2b Path A: verify wrong password
    const stored = db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .get();

    expect(stored).toBeDefined();
    const isValid = await argon2.verify(stored!.value, WRONG_PASSWORD);
    expect(isValid).toBe(false);
    // In real daemon, this would trigger process.exit(1)

    sqlite.close();
  });

  it('4. existing user migration -- correct password decrypts keystore', async () => {
    const dir = createTempDir();
    const { db, sqlite } = createTestDb(dir);
    const walletId = `wallet-${randomUUID()}`;

    // Create keystore file encrypted with correct password
    await createKeystoreFile(dir, walletId, CORRECT_PASSWORD);

    // Simulate Step 2b Path B: no DB hash, keystore exists
    const existingHash = db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .get();
    expect(existingHash).toBeUndefined();

    // Read keystore and attempt decrypt with correct password
    const { readFileSync } = await import('node:fs');
    const keystorePath = join(dir, 'keystore', `${walletId}.json`);
    const content = readFileSync(keystorePath, 'utf-8');
    const parsed = JSON.parse(content);
    const encrypted = {
      iv: Buffer.from(parsed.crypto.cipherparams.iv, 'hex'),
      ciphertext: Buffer.from(parsed.crypto.ciphertext, 'hex'),
      authTag: Buffer.from(parsed.crypto.authTag, 'hex'),
      salt: Buffer.from(parsed.crypto.kdfparams.salt, 'hex'),
      kdfparams: parsed.crypto.kdfparams,
    };

    // Should succeed without throwing
    const plain = await decrypt(encrypted, CORRECT_PASSWORD);
    expect(plain).toBeInstanceOf(Buffer);
    expect(plain.length).toBe(32);
    plain.fill(0); // zero

    // After successful migration, store hash in DB
    const hash = await argon2.hash(CORRECT_PASSWORD, STEP2B_ARGON2_PARAMS);
    db.insert(keyValueStore)
      .values({
        key: 'master_password_hash',
        value: hash,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .run();

    const storedAfter = db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .get();
    expect(storedAfter).toBeDefined();

    sqlite.close();
  });

  it('5. existing user migration -- wrong password fails decryption', async () => {
    const dir = createTempDir();
    const { db, sqlite } = createTestDb(dir);
    const walletId = `wallet-${randomUUID()}`;

    // Create keystore file encrypted with correct password
    await createKeystoreFile(dir, walletId, CORRECT_PASSWORD);

    // Simulate Step 2b Path B: no DB hash, keystore exists
    const existingHash = db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .get();
    expect(existingHash).toBeUndefined();

    // Read keystore and attempt decrypt with WRONG password
    const { readFileSync } = await import('node:fs');
    const keystorePath = join(dir, 'keystore', `${walletId}.json`);
    const content = readFileSync(keystorePath, 'utf-8');
    const parsed = JSON.parse(content);
    const encrypted = {
      iv: Buffer.from(parsed.crypto.cipherparams.iv, 'hex'),
      ciphertext: Buffer.from(parsed.crypto.ciphertext, 'hex'),
      authTag: Buffer.from(parsed.crypto.authTag, 'hex'),
      salt: Buffer.from(parsed.crypto.kdfparams.salt, 'hex'),
      kdfparams: parsed.crypto.kdfparams,
    };

    // Should throw with decryption failure (WAIaaSError code INVALID_MASTER_PASSWORD)
    await expect(decrypt(encrypted, WRONG_PASSWORD)).rejects.toThrow('Decryption failed');
    // In real daemon, this catch block would trigger process.exit(1)

    sqlite.close();
  });

  it('6. migration then restart -- switches to DB hash verification path', async () => {
    const dir = createTempDir();
    const { db, sqlite } = createTestDb(dir);
    const walletId = `wallet-${randomUUID()}`;

    // Create keystore file (simulates existing user)
    await createKeystoreFile(dir, walletId, CORRECT_PASSWORD);

    // --- First boot: migration path ---
    // No DB hash exists
    let existingHash = db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .get();
    expect(existingHash).toBeUndefined();

    // Decrypt keystore succeeds (migration validation)
    const { readFileSync } = await import('node:fs');
    const keystorePath = join(dir, 'keystore', `${walletId}.json`);
    const content = readFileSync(keystorePath, 'utf-8');
    const parsed = JSON.parse(content);
    const encrypted = {
      iv: Buffer.from(parsed.crypto.cipherparams.iv, 'hex'),
      ciphertext: Buffer.from(parsed.crypto.ciphertext, 'hex'),
      authTag: Buffer.from(parsed.crypto.authTag, 'hex'),
      salt: Buffer.from(parsed.crypto.kdfparams.salt, 'hex'),
      kdfparams: parsed.crypto.kdfparams,
    };
    const plain = await decrypt(encrypted, CORRECT_PASSWORD);
    plain.fill(0);

    // Store hash after migration
    const hash = await argon2.hash(CORRECT_PASSWORD, STEP2B_ARGON2_PARAMS);
    db.insert(keyValueStore)
      .values({
        key: 'master_password_hash',
        value: hash,
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .run();

    // --- Second boot: DB hash path ---
    existingHash = db
      .select()
      .from(keyValueStore)
      .where(eq(keyValueStore.key, 'master_password_hash'))
      .get();

    // DB hash now exists -> Path A should be taken
    expect(existingHash).toBeDefined();
    expect(existingHash!.value.startsWith('$argon2id$')).toBe(true);

    // Correct password passes
    const isValid = await argon2.verify(existingHash!.value, CORRECT_PASSWORD);
    expect(isValid).toBe(true);

    // Wrong password fails
    const isInvalid = await argon2.verify(existingHash!.value, WRONG_PASSWORD);
    expect(isInvalid).toBe(false);

    sqlite.close();
  });
});
