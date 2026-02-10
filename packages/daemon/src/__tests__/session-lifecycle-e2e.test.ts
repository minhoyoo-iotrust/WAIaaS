/**
 * Session lifecycle + DELAY/APPROVAL workflow E2E tests.
 *
 * Tests cover:
 * - TEST-03: Full session lifecycle: create -> use -> renew -> use renewed -> revoke -> rejection
 * - TEST-04: DELAY workflow: send -> QUEUED -> processExpired -> CONFIRMED + cancel path
 * - TEST-04: APPROVAL workflow: send -> QUEUED -> approve/reject/timeout with ownerAuth
 *
 * Uses Hono createApp() with full deps: db, jwtSecretManager, masterPasswordHash,
 * config, policyEngine, delayQueue, approvalWorkflow, ownerLifecycle, sqlite,
 * MockChainAdapter, MockKeyStore.
 *
 * Uses vi.useFakeTimers() for controlled time advancement.
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
// Base58 encode helper (for ownerAuth public key address)
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

const TEST_PASSWORD = 'test-master-password-e2e';
const HOST = '127.0.0.1:3100';
const SESSION_TTL = 3600; // 1 hour
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

function bearerHeader(token: string): Record<string, string> {
  return { Host: HOST, Authorization: `Bearer ${token}` };
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
let testAgentId: string;

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

  testAgentId = generateId();
  seedAgent(sqlite, testAgentId);
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
// TEST-03: Session Lifecycle E2E
// ===========================================================================

describe('Session Lifecycle E2E (TEST-03)', () => {
  it('full lifecycle: create -> use for wallet call -> renew -> use renewed token -> revoke -> rejection', async () => {
    // 1. POST /v1/sessions with masterAuth -> 201, get token
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ agentId: testAgentId, ttl: SESSION_TTL }),
    });
    expect(createRes.status).toBe(201);
    const created = await json(createRes);
    const sessionId = created.id as string;
    const token = created.token as string;
    expect(token.startsWith('wai_sess_')).toBe(true);

    // 2. GET /v1/wallet/address with Bearer token -> 200
    const walletRes = await app.request('/v1/wallet/address', {
      headers: bearerHeader(token),
    });
    expect(walletRes.status).toBe(200);
    const walletBody = await json(walletRes);
    expect(walletBody.agentId).toBe(testAgentId);
    expect(walletBody.address).toBe(`pk-${testAgentId}`);

    // 3. Advance time past 50% TTL (> 1800 seconds)
    vi.advanceTimersByTime(1801 * 1000);

    // 4. PUT /v1/sessions/:id/renew with Bearer token -> 200, get new token
    const renewRes = await app.request(`/v1/sessions/${sessionId}/renew`, {
      method: 'PUT',
      headers: bearerHeader(token),
    });
    expect(renewRes.status).toBe(200);
    const renewed = await json(renewRes);
    const newToken = renewed.token as string;
    expect(newToken).not.toBe(token);
    expect(newToken.startsWith('wai_sess_')).toBe(true);
    expect(renewed.renewalCount).toBe(1);

    // 5. GET /v1/wallet/address with NEW token -> 200
    const walletRes2 = await app.request('/v1/wallet/address', {
      headers: bearerHeader(newToken),
    });
    expect(walletRes2.status).toBe(200);
    const walletBody2 = await json(walletRes2);
    expect(walletBody2.agentId).toBe(testAgentId);

    // 6. DELETE /v1/sessions/:id with masterAuth -> 200
    const deleteRes = await app.request(`/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: masterAuthHeader(),
    });
    expect(deleteRes.status).toBe(200);
    const deleteBody = await json(deleteRes);
    expect(deleteBody.status).toBe('REVOKED');

    // 7. GET /v1/wallet/address with renewed token -> 401 SESSION_REVOKED
    const rejectedRes = await app.request('/v1/wallet/address', {
      headers: bearerHeader(newToken),
    });
    expect(rejectedRes.status).toBe(401);
    const rejectedBody = await json(rejectedRes);
    expect(rejectedBody.code).toBe('SESSION_REVOKED');
  });
});

// ===========================================================================
// TEST-04: DELAY Workflow E2E
// ===========================================================================

describe('DELAY Workflow E2E (TEST-04)', () => {
  it('DELAY: send -> QUEUED status -> processExpired -> CONFIRMED', async () => {
    // Setup: SPENDING_LIMIT where 5 SOL (5_000_000_000) triggers DELAY tier
    seedSpendingLimitPolicy(sqlite, testAgentId, {
      instant_max: '1000000000',   // 1 SOL
      notify_max: '2000000000',     // 2 SOL
      delay_max: '10000000000',     // 10 SOL
      delay_seconds: 60,            // 60 second delay
    });

    // Create session
    const sessionRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ agentId: testAgentId }),
    });
    expect(sessionRes.status).toBe(201);
    const session = await json(sessionRes);
    const token = session.token as string;

    // Send transaction with amount in DELAY range (5 SOL)
    const sendRes = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(token),
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '5000000000',
      }),
    });
    expect(sendRes.status).toBe(201);
    const sendBody = await json(sendRes);
    const txId = sendBody.id as string;
    expect(sendBody.status).toBe('PENDING');

    // Wait a tick for async pipeline to process (fire-and-forget)
    await vi.advanceTimersByTimeAsync(100);

    // Verify transaction is QUEUED in DB (pipeline halted at stage4)
    const queuedRow = sqlite
      .prepare('SELECT status, tier, metadata FROM transactions WHERE id = ?')
      .get(txId) as { status: string; tier: string | null; metadata: string | null };
    expect(queuedRow.status).toBe('QUEUED');
    expect(queuedRow.tier).toBe('DELAY');

    // Advance time past delay period (60 seconds)
    vi.advanceTimersByTime(61 * 1000);

    // Manually call processExpired (simulating BackgroundWorker tick)
    const now = Math.floor(Date.now() / 1000);
    const expired = delayQueue.processExpired(now);
    expect(expired).toHaveLength(1);
    expect(expired[0]!.txId).toBe(txId);

    // Verify transaction transitions to EXECUTING
    const executingRow = sqlite
      .prepare('SELECT status FROM transactions WHERE id = ?')
      .get(txId) as { status: string };
    expect(executingRow.status).toBe('EXECUTING');
  });

  it('DELAY: send -> QUEUED -> cancel before expiry -> CANCELLED', async () => {
    seedSpendingLimitPolicy(sqlite, testAgentId, {
      instant_max: '1000000000',
      notify_max: '2000000000',
      delay_max: '10000000000',
      delay_seconds: 300,
    });

    // Create session
    const sessionRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ agentId: testAgentId }),
    });
    const session = await json(sessionRes);
    const token = session.token as string;

    // Send transaction in DELAY range
    const sendRes = await app.request('/v1/transactions/send', {
      method: 'POST',
      headers: bearerJsonHeader(token),
      body: JSON.stringify({
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: '5000000000',
      }),
    });
    expect(sendRes.status).toBe(201);
    const sendBody = await json(sendRes);
    const txId = sendBody.id as string;

    // Wait for async pipeline
    await vi.advanceTimersByTimeAsync(100);

    // Verify QUEUED
    const queuedRow = sqlite
      .prepare('SELECT status FROM transactions WHERE id = ?')
      .get(txId) as { status: string };
    expect(queuedRow.status).toBe('QUEUED');

    // Cancel via API (sessionAuth, agent self-service)
    const cancelRes = await app.request(`/v1/transactions/${txId}/cancel`, {
      method: 'POST',
      headers: bearerHeader(token),
    });
    expect(cancelRes.status).toBe(200);
    const cancelBody = await json(cancelRes);
    expect(cancelBody.status).toBe('CANCELLED');

    // Verify CANCELLED in DB
    const cancelledRow = sqlite
      .prepare('SELECT status, reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { status: string; reserved_amount: string | null };
    expect(cancelledRow.status).toBe('CANCELLED');
    expect(cancelledRow.reserved_amount).toBeNull();
  });
});

// ===========================================================================
// TEST-04: APPROVAL Workflow E2E
// ===========================================================================

describe('APPROVAL Workflow E2E (TEST-04)', () => {
  let ownerKeypair: ReturnType<typeof generateTestKeypair>;

  beforeEach(() => {
    ownerKeypair = generateTestKeypair();
  });

  it('APPROVAL: send -> QUEUED -> owner approves -> EXECUTING', async () => {
    // Create agent with owner address (GRACE state) so APPROVAL is not downgraded
    const agentId = generateId();
    seedAgent(sqlite, agentId, {
      ownerAddress: ownerKeypair.address,
      ownerVerified: false,
    });

    // Setup policy: amount > 10 SOL triggers APPROVAL
    seedSpendingLimitPolicy(sqlite, agentId, {
      instant_max: '1000000000',
      notify_max: '2000000000',
      delay_max: '10000000000',
      delay_seconds: 60,
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

    // Verify QUEUED + pending_approvals record
    const queuedRow = sqlite
      .prepare('SELECT status, tier FROM transactions WHERE id = ?')
      .get(txId) as { status: string; tier: string | null };
    expect(queuedRow.status).toBe('QUEUED');
    expect(queuedRow.tier).toBe('APPROVAL');

    const approval = sqlite
      .prepare('SELECT id, tx_id FROM pending_approvals WHERE tx_id = ?')
      .get(txId) as { id: string; tx_id: string } | undefined;
    expect(approval).toBeDefined();

    // Owner approves with Ed25519 signature (ownerAuth headers + sessionAuth Bearer)
    const message = `approve:${txId}`;
    const approveRes = await app.request(`/v1/transactions/${txId}/approve`, {
      method: 'POST',
      headers: ownerAuthHeaders(token, ownerKeypair.address, message, ownerKeypair.secretKey),
    });
    expect(approveRes.status).toBe(200);
    const approveBody = await json(approveRes);
    expect(approveBody.status).toBe('EXECUTING');
    expect(approveBody.approvedAt).toBeDefined();

    // Verify transaction transitions to EXECUTING in DB
    const executingRow = sqlite
      .prepare('SELECT status, reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { status: string; reserved_amount: string | null };
    expect(executingRow.status).toBe('EXECUTING');
    expect(executingRow.reserved_amount).toBeNull();
  });

  it('APPROVAL: send -> QUEUED -> owner rejects -> CANCELLED', async () => {
    const agentId = generateId();
    seedAgent(sqlite, agentId, {
      ownerAddress: ownerKeypair.address,
      ownerVerified: false,
    });

    seedSpendingLimitPolicy(sqlite, agentId, {
      instant_max: '1000000000',
      notify_max: '2000000000',
      delay_max: '10000000000',
      delay_seconds: 60,
    });

    const sessionRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ agentId }),
    });
    const session = await json(sessionRes);
    const token = session.token as string;

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

    await vi.advanceTimersByTimeAsync(100);

    // Verify QUEUED
    const queuedRow = sqlite
      .prepare('SELECT status FROM transactions WHERE id = ?')
      .get(txId) as { status: string };
    expect(queuedRow.status).toBe('QUEUED');

    // Owner rejects
    const message = `reject:${txId}`;
    const rejectRes = await app.request(`/v1/transactions/${txId}/reject`, {
      method: 'POST',
      headers: ownerAuthHeaders(token, ownerKeypair.address, message, ownerKeypair.secretKey),
    });
    expect(rejectRes.status).toBe(200);
    const rejectBody = await json(rejectRes);
    expect(rejectBody.status).toBe('CANCELLED');
    expect(rejectBody.rejectedAt).toBeDefined();

    // Verify CANCELLED in DB
    const cancelledRow = sqlite
      .prepare('SELECT status, reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { status: string; reserved_amount: string | null };
    expect(cancelledRow.status).toBe('CANCELLED');
    expect(cancelledRow.reserved_amount).toBeNull();
  });

  it('APPROVAL: send -> QUEUED -> timeout -> EXPIRED', async () => {
    const agentId = generateId();
    seedAgent(sqlite, agentId, {
      ownerAddress: ownerKeypair.address,
      ownerVerified: false,
    });

    seedSpendingLimitPolicy(sqlite, agentId, {
      instant_max: '1000000000',
      notify_max: '2000000000',
      delay_max: '10000000000',
      delay_seconds: 60,
    });

    const sessionRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: masterAuthJsonHeaders(),
      body: JSON.stringify({ agentId }),
    });
    const session = await json(sessionRes);
    const token = session.token as string;

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

    await vi.advanceTimersByTimeAsync(100);

    // Verify QUEUED
    const queuedRow = sqlite
      .prepare('SELECT status FROM transactions WHERE id = ?')
      .get(txId) as { status: string };
    expect(queuedRow.status).toBe('QUEUED');

    // Force expiration: set pending_approval expires_at to past
    const pastExpiry = Math.floor(Date.now() / 1000) - 100;
    sqlite
      .prepare('UPDATE pending_approvals SET expires_at = ? WHERE tx_id = ?')
      .run(pastExpiry, txId);

    // Process expired approvals
    const now = Math.floor(Date.now() / 1000);
    const count = approvalWorkflow.processExpiredApprovals(now);
    expect(count).toBe(1);

    // Verify EXPIRED in DB
    const expiredRow = sqlite
      .prepare('SELECT status, reserved_amount FROM transactions WHERE id = ?')
      .get(txId) as { status: string; reserved_amount: string | null };
    expect(expiredRow.status).toBe('EXPIRED');
    expect(expiredRow.reserved_amount).toBeNull();
  });
});
