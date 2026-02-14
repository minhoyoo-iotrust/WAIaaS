/**
 * TDD tests for 56-01: Pipeline stage2Auth sessionId + stage3Policy integration.
 *
 * Features tested:
 * A. sessionId audit trail: stage2Auth + stage1Validate sessionId insertion
 * B. evaluateAndReserve TOCTOU-safe policy evaluation in stage3Policy
 * C. downgradeIfNoOwner integration in stage3Policy
 *
 * Uses in-memory SQLite + Drizzle + pushSchema pattern.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, policies, sessions, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import {
  stage1Validate,
  stage2Auth,
  stage3Policy,
} from '../pipeline/stages.js';
import type { PipelineContext } from '../pipeline/stages.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import type { IChainAdapter } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;

function createMockAdapter(): IChainAdapter {
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
    submitTransaction: async () => ({ txHash: 'mock-hash', status: 'submitted' as const }),
    waitForConfirmation: async (txHash: string) => ({
      txHash,
      status: 'confirmed' as const,
      confirmations: 1,
    }),
    getAssets: async () => [],
    // v1.4 stubs
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async () => { throw new Error('not implemented'); },
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async () => { throw new Error('not implemented'); },
    buildApprove: async () => { throw new Error('not implemented'); },
    buildBatch: async () => { throw new Error('not implemented'); },
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
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

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

async function insertTestAgent(
  overrides: { ownerAddress?: string | null; ownerVerified?: boolean } = {},
): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'devnet',
    publicKey: MOCK_PUBLIC_KEY + '-' + id.slice(0, 8), // unique per agent
    status: 'ACTIVE',
    ownerAddress: overrides.ownerAddress ?? null,
    ownerVerified: overrides.ownerVerified ?? false,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertTestSession(walletId: string): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const expires = new Date(now.getTime() + 86400000); // +1 day
  await conn.db.insert(sessions).values({
    id,
    walletId,
    tokenHash: 'hash_' + id,
    expiresAt: expires,
    absoluteExpiresAt: expires,
    createdAt: now,
  });
  return id;
}

async function insertPolicy(overrides: {
  walletId?: string | null;
  type: string;
  rules: string;
  priority?: number;
}): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id,
    walletId: overrides.walletId ?? null,
    type: overrides.type,
    rules: overrides.rules,
    priority: overrides.priority ?? 10,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function createPipelineContext(
  walletId: string,
  overrides: Partial<PipelineContext> = {},
): PipelineContext {
  return {
    db: conn.db,
    adapter: createMockAdapter(),
    keyStore: createMockKeyStore(),
    policyEngine: new DefaultPolicyEngine(),
    masterPassword: 'test-master',
    walletId,
    wallet: { publicKey: MOCK_PUBLIC_KEY, chain: 'solana', environment: 'testnet', defaultNetwork: 'devnet' },
    resolvedNetwork: 'devnet',
    request: { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '1000000000' },
    txId: '',
    ...overrides,
  } as PipelineContext;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// 56-01 Pipeline Integration
// ---------------------------------------------------------------------------

describe('56-01 Pipeline Integration', () => {
  // =========================================================================
  // Feature A: sessionId audit trail
  // =========================================================================

  describe('Feature A: sessionId audit trail', () => {
    it('stage2Auth sets ctx.sessionId from provided value', async () => {
      const walletId = await insertTestAgent();
      const ctx = createPipelineContext(walletId, {
        sessionId: 'sess_123',
      });

      await stage2Auth(ctx);

      // sessionId should remain on context (passthrough)
      expect(ctx.sessionId).toBe('sess_123');
    });

    it('stage1Validate inserts sessionId into transactions table', async () => {
      const walletId = await insertTestAgent();
      const sessionId = await insertTestSession(walletId);
      const ctx = createPipelineContext(walletId, {
        sessionId,
      });

      await stage1Validate(ctx);

      // Query the transaction row and verify sessionId
      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, ctx.txId))
        .get();

      expect(tx).toBeTruthy();
      expect(tx!.sessionId).toBe(sessionId);
    });

    it('stage1Validate inserts null sessionId when not provided', async () => {
      const walletId = await insertTestAgent();
      const ctx = createPipelineContext(walletId);

      await stage1Validate(ctx);

      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, ctx.txId))
        .get();

      expect(tx).toBeTruthy();
      expect(tx!.sessionId).toBeNull();
    });
  });

  // =========================================================================
  // Feature B: evaluateAndReserve TOCTOU-safe policy
  // =========================================================================

  describe('Feature B: evaluateAndReserve TOCTOU-safe policy', () => {
    it('stage3Policy calls evaluateAndReserve for TOCTOU-safe evaluation', async () => {
      const walletId = await insertTestAgent();

      // Insert a SPENDING_LIMIT policy: instant_max=100, notify_max=500, delay_max=1000
      await insertPolicy({
        walletId,
        type: 'SPENDING_LIMIT',
        rules: JSON.stringify({
          instant_max: '100',
          notify_max: '500',
          delay_max: '1000',
          delay_seconds: 300,
        }),
      });

      // Create a DatabasePolicyEngine with sqlite for evaluateAndReserve
      const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);

      const ctx = createPipelineContext(walletId, {
        policyEngine,
        sqlite: conn.sqlite,
        request: { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '50' },
      });

      // Run stage1 to create the tx row first
      await stage1Validate(ctx);

      // Run stage3 -- should use evaluateAndReserve
      await stage3Policy(ctx);

      expect(ctx.tier).toBe('INSTANT');

      // Check reserved_amount was set on the transaction row
      const row = conn.sqlite
        .prepare('SELECT reserved_amount FROM transactions WHERE id = ?')
        .get(ctx.txId) as { reserved_amount: string | null };
      expect(row.reserved_amount).toBe('50');
    });

    it('stage3Policy sets DELAY tier for amount between notify_max and delay_max', async () => {
      const walletId = await insertTestAgent();

      await insertPolicy({
        walletId,
        type: 'SPENDING_LIMIT',
        rules: JSON.stringify({
          instant_max: '100',
          notify_max: '500',
          delay_max: '1000',
          delay_seconds: 300,
        }),
      });

      const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);

      const ctx = createPipelineContext(walletId, {
        policyEngine,
        sqlite: conn.sqlite,
        request: { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '700' },
      });

      await stage1Validate(ctx);
      await stage3Policy(ctx);

      expect(ctx.tier).toBe('DELAY');

      // Check the DB row has the correct tier
      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, ctx.txId))
        .get();
      expect(tx!.tier).toBe('DELAY');
    });

    it('stage3Policy denies transaction when whitelist policy rejects', async () => {
      const walletId = await insertTestAgent();

      // Insert a WHITELIST policy with only 'addr1' allowed
      await insertPolicy({
        walletId,
        type: 'WHITELIST',
        rules: JSON.stringify({ allowed_addresses: ['addr1'] }),
        priority: 20,
      });

      const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);

      const ctx = createPipelineContext(walletId, {
        policyEngine,
        sqlite: conn.sqlite,
        request: { to: 'addr_not_whitelisted', amount: '50' },
      });

      await stage1Validate(ctx);

      // stage3Policy should throw with whitelist denial message
      await expect(stage3Policy(ctx)).rejects.toThrow('not in whitelist');

      // Transaction status should be CANCELLED
      const tx = await conn.db
        .select()
        .from(transactions)
        .where(eq(transactions.id, ctx.txId))
        .get();
      expect(tx!.status).toBe('CANCELLED');
    });
  });

  // =========================================================================
  // Feature C: downgradeIfNoOwner integration
  // =========================================================================

  describe('Feature C: downgradeIfNoOwner integration', () => {
    it('stage3Policy downgrades APPROVAL to DELAY when owner is NONE', async () => {
      // Agent with NO owner address (NONE state)
      const walletId = await insertTestAgent({ ownerAddress: null, ownerVerified: false });

      // Insert SPENDING_LIMIT where the amount triggers APPROVAL (above delay_max)
      await insertPolicy({
        walletId,
        type: 'SPENDING_LIMIT',
        rules: JSON.stringify({
          instant_max: '100',
          notify_max: '500',
          delay_max: '1000',
          delay_seconds: 300,
        }),
      });

      const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);

      const ctx = createPipelineContext(walletId, {
        policyEngine,
        sqlite: conn.sqlite,
        request: { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '2000' },
      });

      await stage1Validate(ctx);
      await stage3Policy(ctx);

      // Should be downgraded from APPROVAL to DELAY
      expect(ctx.tier).toBe('DELAY');
      expect(ctx.downgraded).toBe(true);
    });

    it('stage3Policy keeps APPROVAL when owner exists', async () => {
      // Agent WITH owner address (GRACE or LOCKED state)
      const walletId = await insertTestAgent({
        ownerAddress: 'OwnerWalletAddress123',
        ownerVerified: true,
      });

      // Same policy as above
      await insertPolicy({
        walletId,
        type: 'SPENDING_LIMIT',
        rules: JSON.stringify({
          instant_max: '100',
          notify_max: '500',
          delay_max: '1000',
          delay_seconds: 300,
        }),
      });

      const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);

      const ctx = createPipelineContext(walletId, {
        policyEngine,
        sqlite: conn.sqlite,
        request: { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '2000' },
      });

      await stage1Validate(ctx);
      await stage3Policy(ctx);

      // Should remain APPROVAL (not downgraded)
      expect(ctx.tier).toBe('APPROVAL');
    });
  });
});
