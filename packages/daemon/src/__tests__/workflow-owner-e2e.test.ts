/**
 * Owner state transition + APPROVAL -> DELAY downgrade E2E tests.
 *
 * Tests cover:
 * - TEST-05: Owner NONE -> GRACE -> LOCKED state transitions via API
 * - TEST-05: LOCKED returns 409 OWNER_ALREADY_CONNECTED on PUT /agents/:id/owner
 * - TEST-05: GRACE allows owner change
 * - TEST-05: NONE owner removal is no-op
 * - TEST-05: APPROVAL -> DELAY downgrade when no owner connected
 * - TEST-05: APPROVAL preserved when owner connected
 *
 * Uses Hono createApp() with full deps: db, jwtSecretManager, masterPasswordHash,
 * config, policyEngine, delayQueue, approvalWorkflow, ownerLifecycle, sqlite,
 * MockChainAdapter, MockKeyStore.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import { JwtSecretManager } from '../infrastructure/jwt/index.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';
import { createApp } from '../api/server.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { DelayQueue } from '../workflow/delay-queue.js';
import { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import { OwnerLifecycleService } from '../workflow/owner-state.js';
import type { IChainAdapter } from '@waiaas/core';
import type { Hono } from 'hono';

// ---------------------------------------------------------------------------
// sodium-native for ownerAuth Ed25519 signatures
// ---------------------------------------------------------------------------

type SodiumNative = typeof import('sodium-native');

const require = createRequire(import.meta.url);
const sodium = require('sodium-native') as SodiumNative;

// ---------------------------------------------------------------------------
// Base58 encode helper
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
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-owner-e2e';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<IChainAdapter> = {}): IChainAdapter {
  return {
    chain: 'solana' as const,
    network: 'devnet' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async () => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string) => ({
      address: addr,
      balance: 1_000_000_000n,
      decimals: 9,
      symbol: 'SOL',
    }),
    buildTransaction: async () => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    simulateTransaction: async () => ({ success: true, logs: [] }),
    signTransaction: async () => new Uint8Array(256),
    submitTransaction: async () => ({
      txHash: 'mock-hash-' + Date.now(),
      status: 'submitted' as const,
    }),
    waitForConfirmation: async (txHash: string) => ({
      txHash,
      status: 'confirmed' as const,
      confirmations: 1,
    }),
    ...overrides,
  };
}

function createMockKeyStore() {
  return {
    generateKeyPair: async () => ({
      publicKey: '11111111111111111111111111111112',
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64).fill(42),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as any;
}

function generateTestKeypair() {
  const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
  const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES);
  sodium.crypto_sign_keypair(publicKey, secretKey);
  return { publicKey, secretKey, address: encodeBase58(publicKey) };
}

function signMessage(message: string, secretKey: Buffer): string {
  const messageBytes = Buffer.from(message, 'utf8');
  const signature = Buffer.alloc(sodium.crypto_sign_BYTES);
  sodium.crypto_sign_detached(signature, messageBytes, secretKey);
  return signature.toString('base64');
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function masterAuthJsonHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
    'Content-Type': 'application/json',
  };
}

function masterAuthHeader(): Record<string, string> {
  return { Host: HOST, 'X-Master-Password': TEST_PASSWORD };
}

function bearerJsonHeader(token: string): Record<string, string> {
  return {
    Host: HOST,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function ownerAuthHeaders(
  token: string,
  ownerAddress: string,
  message: string,
  secretKey: Buffer,
): Record<string, string> {
  const sig = signMessage(message, secretKey);
  return {
    Host: HOST,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Owner-Signature': sig,
    'X-Owner-Message': message,
    'X-Owner-Address': ownerAddress,
  };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedAgent(
  sqlite: DatabaseType,
  agentId: string,
  opts?: { ownerAddress?: string | null; ownerVerified?: boolean },
): void {
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO agents (id, name, chain, network, public_key, status, owner_verified, owner_address, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      agentId,
      'Test Agent',
      'solana',
      'devnet',
      `pk-${agentId}`,
      'ACTIVE',
      opts?.ownerVerified ? 1 : 0,
      opts?.ownerAddress ?? null,
      ts,
      ts,
    );
}

function seedSpendingLimitPolicy(
  sqlite: DatabaseType,
  agentId: string,
  rules: {
    instant_max: string;
    notify_max: string;
    delay_max: string;
    delay_seconds: number;
  },
): void {
  const id = generateId();
  const ts = Math.floor(Date.now() / 1000);
  sqlite
    .prepare(
      `INSERT INTO policies (id, agent_id, type, rules, priority, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, agentId, 'SPENDING_LIMIT', JSON.stringify(rules), 100, 1, ts, ts);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];
let jwtManager: JwtSecretManager;
let policyEngine: DatabasePolicyEngine;
let delayQueue: DelayQueue;
let approvalWorkflow: ApprovalWorkflow;
let ownerLifecycle: OwnerLifecycleService;
let app: Hono;

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-02-10T12:00:00Z'));

  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);

  jwtManager = new JwtSecretManager(db);
  await jwtManager.initialize();

  const config = DaemonConfigSchema.parse({});

  policyEngine = new DatabasePolicyEngine(db, sqlite);
  delayQueue = new DelayQueue({ db, sqlite });
  approvalWorkflow = new ApprovalWorkflow({
    db,
    sqlite,
    config: {
      policy_defaults_approval_timeout:
        config.security.policy_defaults_approval_timeout,
    },
  });
  ownerLifecycle = new OwnerLifecycleService({ db, sqlite });

  app = createApp({
    db,
    sqlite,
    jwtSecretManager: jwtManager,
    masterPasswordHash: passwordHash,
    masterPassword: TEST_PASSWORD,
    config,
    adapter: createMockAdapter(),
    keyStore: createMockKeyStore(),
    policyEngine,
    delayQueue,
    approvalWorkflow,
    ownerLifecycle,
  });
});

afterEach(() => {
  vi.useRealTimers();
  try {
    sqlite.close();
  } catch {
    // already closed
  }
});

// ===========================================================================
// TEST-05: Owner State Transitions E2E
// ===========================================================================

describe('Owner State Transitions E2E (TEST-05)', () => {
  it('NONE -> GRACE: PUT /v1/agents/:id/owner sets owner address', async () => {
    const agentId = generateId();
    seedAgent(sqlite, agentId); // NONE state -- no owner

    const ownerKeypair = generateTestKeypair();

    const res = await app.request(`/v1/agents/${agentId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ owner_address: ownerKeypair.address }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ownerAddress).toBe(ownerKeypair.address);
    expect(body.ownerVerified).toBe(false);

    // Verify DB state: GRACE (ownerAddress set, ownerVerified=false)
    const row = sqlite
      .prepare('SELECT owner_address, owner_verified FROM agents WHERE id = ?')
      .get(agentId) as { owner_address: string | null; owner_verified: number };
    expect(row.owner_address).toBe(ownerKeypair.address);
    expect(row.owner_verified).toBe(0);
  });

  it('GRACE -> LOCKED: ownerAuth success triggers markOwnerVerified', async () => {
    const ownerKeypair = generateTestKeypair();
    const agentId = generateId();
    seedAgent(sqlite, agentId, {
      ownerAddress: ownerKeypair.address,
      ownerVerified: false,
    });

    // Setup policy so we can trigger an APPROVAL transaction
    seedSpendingLimitPolicy(sqlite, agentId, {
      instant_max: '1000000000',
      notify_max: '2000000000',
      delay_max: '10000000000',
      delay_seconds: 60,
    });

    // Create session for agent
    const sessionRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ agentId }),
    });
    expect(sessionRes.status).toBe(201);
    const session = await json(sessionRes);
    const token = session.token as string;

    // Send a transaction in APPROVAL range (> 10 SOL)
    const sendRes = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(token),
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '20000000000',
      }),
    });
    expect(sendRes.status).toBe(201);
    const sendBody = await json(sendRes);
    const txId = sendBody.id as string;

    // Wait for async pipeline
    await vi.advanceTimersByTimeAsync(100);

    // Verify ownerVerified is still false (GRACE)
    const beforeRow = sqlite
      .prepare('SELECT owner_verified FROM agents WHERE id = ?')
      .get(agentId) as { owner_verified: number };
    expect(beforeRow.owner_verified).toBe(0);

    // Owner approves -- this triggers ownerAuth middleware + markOwnerVerified
    const message = `approve:${txId}`;
    const approveRes = await app.request(`/v1/transactions/${txId}/approve`, {
      method: 'POST',
      headers: ownerAuthHeaders(token, ownerKeypair.address, message, ownerKeypair.secretKey),
    });
    expect(approveRes.status).toBe(200);

    // Verify ownerVerified is now true (LOCKED)
    const afterRow = sqlite
      .prepare('SELECT owner_verified FROM agents WHERE id = ?')
      .get(agentId) as { owner_verified: number };
    expect(afterRow.owner_verified).toBe(1);
  });

  it('LOCKED: PUT /v1/agents/:id/owner returns 409 OWNER_ALREADY_CONNECTED', async () => {
    const ownerKeypair = generateTestKeypair();
    const agentId = generateId();
    seedAgent(sqlite, agentId, {
      ownerAddress: ownerKeypair.address,
      ownerVerified: true, // LOCKED state
    });

    const newKeypair = generateTestKeypair();
    const res = await app.request(`/v1/agents/${agentId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ owner_address: newKeypair.address }),
    });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.code).toBe('OWNER_ALREADY_CONNECTED');
  });

  it('GRACE: owner can be changed before verification', async () => {
    const firstKeypair = generateTestKeypair();
    const agentId = generateId();
    seedAgent(sqlite, agentId, {
      ownerAddress: firstKeypair.address,
      ownerVerified: false, // GRACE state
    });

    const secondKeypair = generateTestKeypair();
    const res = await app.request(`/v1/agents/${agentId}/owner`, {
      method: 'PUT',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ owner_address: secondKeypair.address }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ownerAddress).toBe(secondKeypair.address);

    // Verify DB updated
    const row = sqlite
      .prepare('SELECT owner_address FROM agents WHERE id = ?')
      .get(agentId) as { owner_address: string | null };
    expect(row.owner_address).toBe(secondKeypair.address);
  });

  it('NONE: owner removal is a no-op (DELETE /v1/agents/:id/owner not implemented, use lifecycle directly)', async () => {
    const agentId = generateId();
    seedAgent(sqlite, agentId); // NONE state

    // Since DELETE /v1/agents/:id/owner is not an API route,
    // verify the lifecycle service directly (NONE state = no-op)
    ownerLifecycle.removeOwner(agentId);

    const row = sqlite
      .prepare('SELECT owner_address, owner_verified FROM agents WHERE id = ?')
      .get(agentId) as { owner_address: string | null; owner_verified: number };
    expect(row.owner_address).toBeNull();
    expect(row.owner_verified).toBe(0);
  });
});

// ===========================================================================
// TEST-05: APPROVAL -> DELAY Downgrade E2E
// ===========================================================================

describe('APPROVAL -> DELAY Downgrade E2E (TEST-05)', () => {
  it('APPROVAL downgraded to DELAY when no owner is connected', async () => {
    // Create agent WITHOUT owner address (NONE state)
    const agentId = generateId();
    seedAgent(sqlite, agentId); // No owner

    // Policy where 20 SOL triggers APPROVAL tier
    seedSpendingLimitPolicy(sqlite, agentId, {
      instant_max: '1000000000',
      notify_max: '2000000000',
      delay_max: '10000000000',
      delay_seconds: 300,
    });

    // Create session
    const sessionRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ agentId }),
    });
    expect(sessionRes.status).toBe(201);
    const session = await json(sessionRes);
    const token = session.token as string;

    // Send transaction in APPROVAL range (> 10 SOL)
    const sendRes = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(token),
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '20000000000',
      }),
    });
    expect(sendRes.status).toBe(201);
    const sendBody = await json(sendRes);
    const txId = sendBody.id as string;

    // Wait for async pipeline
    await vi.advanceTimersByTimeAsync(100);

    // Verify transaction in DB: tier should be DELAY (downgraded from APPROVAL)
    const row = sqlite
      .prepare('SELECT status, tier FROM transactions WHERE id = ?')
      .get(txId) as { status: string; tier: string | null };
    expect(row.status).toBe('QUEUED');
    expect(row.tier).toBe('DELAY'); // Downgraded from APPROVAL

    // Should NOT have pending_approvals record (downgraded to DELAY, not APPROVAL)
    const approvalCount = sqlite
      .prepare('SELECT COUNT(*) as cnt FROM pending_approvals WHERE tx_id = ?')
      .get(txId) as { cnt: number };
    expect(approvalCount.cnt).toBe(0);
  });

  it('APPROVAL NOT downgraded when owner IS connected', async () => {
    const ownerKeypair = generateTestKeypair();
    const agentId = generateId();
    seedAgent(sqlite, agentId, {
      ownerAddress: ownerKeypair.address,
      ownerVerified: false, // GRACE state -- owner connected
    });

    seedSpendingLimitPolicy(sqlite, agentId, {
      instant_max: '1000000000',
      notify_max: '2000000000',
      delay_max: '10000000000',
      delay_seconds: 300,
    });

    // Create session
    const sessionRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ agentId }),
    });
    expect(sessionRes.status).toBe(201);
    const session = await json(sessionRes);
    const token = session.token as string;

    // Send transaction in APPROVAL range
    const sendRes = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(token),
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '20000000000',
      }),
    });
    expect(sendRes.status).toBe(201);
    const sendBody = await json(sendRes);
    const txId = sendBody.id as string;

    // Wait for async pipeline
    await vi.advanceTimersByTimeAsync(100);

    // Verify transaction in DB: tier should be APPROVAL (NOT downgraded)
    const row = sqlite
      .prepare('SELECT status, tier FROM transactions WHERE id = ?')
      .get(txId) as { status: string; tier: string | null };
    expect(row.status).toBe('QUEUED');
    expect(row.tier).toBe('APPROVAL');

    // Should have pending_approvals record
    const approval = sqlite
      .prepare('SELECT id FROM pending_approvals WHERE tx_id = ?')
      .get(txId) as { id: string } | undefined;
    expect(approval).toBeDefined();
  });
});
