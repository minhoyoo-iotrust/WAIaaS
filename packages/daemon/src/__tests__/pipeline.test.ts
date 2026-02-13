/**
 * Tests for 6-stage transaction pipeline and DefaultPolicyEngine.
 *
 * Uses in-memory SQLite + mock adapter + mock keyStore.
 * DefaultPolicyEngine is tested as real (trivial implementation).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import {
  stage1Validate,
  stage3Policy,
  stage5Execute,
  stage6Confirm,
} from '../pipeline/stages.js';
import { TransactionPipeline } from '../pipeline/pipeline.js';
import type { PipelineContext } from '../pipeline/stages.js';
import type {
  IChainAdapter,
  IPolicyEngine,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  SendTransactionRequest,
} from '@waiaas/core';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<IChainAdapter> = {}): IChainAdapter {
  return {
    chain: 'solana' as const,
    network: 'devnet' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string): Promise<BalanceInfo> => ({
      address: addr,
      balance: 1_000_000_000n,
      decimals: 9,
      symbol: 'SOL',
    }),
    buildTransaction: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    simulateTransaction: async (): Promise<SimulationResult> => ({
      success: true,
      logs: ['Program log: success'],
    }),
    signTransaction: async (): Promise<Uint8Array> => new Uint8Array(256),
    submitTransaction: async (): Promise<SubmitResult> => ({
      txHash: 'mock-tx-hash-' + Date.now(),
      status: 'submitted',
    }),
    waitForConfirmation: async (txHash: string): Promise<SubmitResult> => ({
      txHash,
      status: 'confirmed',
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
    ...overrides,
  };
}

const MOCK_PRIVATE_KEY = new Uint8Array(64).fill(42);

function createMockKeyStore(overrides: Partial<LocalKeyStore> = {}): LocalKeyStore {
  return {
    generateKeyPair: async () => ({
      publicKey: '11111111111111111111111111111112',
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => MOCK_PRIVATE_KEY,
    releaseKey: vi.fn(),
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
    ...overrides,
  } as unknown as LocalKeyStore;
}

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

function createTestRequest(): SendTransactionRequest {
  return {
    to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    amount: '1000000000',
  };
}

async function insertTestAgent(conn: DatabaseConnection): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    network: 'devnet',
    publicKey: MOCK_PUBLIC_KEY,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function createPipelineContext(
  conn: DatabaseConnection,
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
    wallet: { publicKey: MOCK_PUBLIC_KEY, chain: 'solana', network: 'devnet' },
    request: createTestRequest(),
    txId: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;

beforeEach(() => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// DefaultPolicyEngine (2 tests)
// ---------------------------------------------------------------------------

describe('DefaultPolicyEngine', () => {
  it('should return INSTANT tier and allowed=true', async () => {
    const engine = new DefaultPolicyEngine();
    const result = await engine.evaluate('some-wallet-id', {
      type: 'TRANSFER',
      amount: '1000000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      chain: 'solana',
    });

    expect(result.tier).toBe('INSTANT');
    expect(result.allowed).toBe(true);
  });

  it('should work for any input combination', async () => {
    const engine = new DefaultPolicyEngine();
    const result = await engine.evaluate('different-wallet', {
      type: 'CONTRACT_CALL',
      amount: '999999999999',
      toAddress: 'random-address',
      chain: 'ethereum',
    });

    expect(result.tier).toBe('INSTANT');
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stage 1: Validate + INSERT (3 tests)
// ---------------------------------------------------------------------------

describe('Stage 1: Validate + INSERT', () => {
  it('should create PENDING transaction in DB for valid request', async () => {
    const walletId = await insertTestAgent(conn);
    const ctx = createPipelineContext(conn, walletId);

    await stage1Validate(ctx);

    expect(ctx.txId).toBeTruthy();
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx).toBeTruthy();
    expect(tx!.status).toBe('PENDING');
    expect(tx!.type).toBe('TRANSFER');
    expect(tx!.amount).toBe('1000000000');
    expect(tx!.toAddress).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
  });

  it('should throw validation error for invalid request (missing to)', async () => {
    const walletId = await insertTestAgent(conn);
    const ctx = createPipelineContext(conn, walletId, {
      request: { amount: '1000' } as SendTransactionRequest,
    });

    await expect(stage1Validate(ctx)).rejects.toThrow();
  });

  it('should generate UUID v7 format txId', async () => {
    const walletId = await insertTestAgent(conn);
    const ctx = createPipelineContext(conn, walletId);

    await stage1Validate(ctx);

    // UUID v7 format: 8-4-4-4-12 hex chars, version 7
    expect(ctx.txId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

// ---------------------------------------------------------------------------
// Stage 3: Policy (2 tests)
// ---------------------------------------------------------------------------

describe('Stage 3: Policy', () => {
  it('should set INSTANT tier with DefaultPolicyEngine', async () => {
    const walletId = await insertTestAgent(conn);
    const ctx = createPipelineContext(conn, walletId);
    await stage1Validate(ctx);

    await stage3Policy(ctx);

    expect(ctx.tier).toBe('INSTANT');
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.tier).toBe('INSTANT');
  });

  it('should CANCEL transaction when policy engine returns allowed=false', async () => {
    const walletId = await insertTestAgent(conn);
    const denyEngine: IPolicyEngine = {
      evaluate: async () => ({
        tier: 'INSTANT' as const,
        allowed: false,
        reason: 'Test denial',
      }),
    };
    const ctx = createPipelineContext(conn, walletId, { policyEngine: denyEngine });
    await stage1Validate(ctx);

    await expect(stage3Policy(ctx)).rejects.toThrow('Test denial');

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('CANCELLED');
  });
});

// ---------------------------------------------------------------------------
// Stage 5: Execute (3 tests)
// ---------------------------------------------------------------------------

describe('Stage 5: Execute', () => {
  it('should call build -> simulate -> sign -> submit in order', async () => {
    const walletId = await insertTestAgent(conn);
    const callOrder: string[] = [];

    const adapter = createMockAdapter({
      buildTransaction: async () => {
        callOrder.push('build');
        return { chain: 'solana', serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {} };
      },
      simulateTransaction: async () => {
        callOrder.push('simulate');
        return { success: true, logs: [] };
      },
      signTransaction: async () => {
        callOrder.push('sign');
        return new Uint8Array(256);
      },
      submitTransaction: async () => {
        callOrder.push('submit');
        return { txHash: 'hash-123', status: 'submitted' as const };
      },
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    expect(callOrder).toEqual(['build', 'simulate', 'sign', 'submit']);
  });

  it('should mark FAILED on simulation failure', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter({
      simulateTransaction: async (): Promise<SimulationResult> => ({
        success: false,
        logs: ['error'],
        error: 'Insufficient funds',
      }),
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await expect(stage5Execute(ctx)).rejects.toThrow('Insufficient funds');

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('FAILED');
    expect(tx!.error).toBe('Insufficient funds');
  });

  it('should release private key even when sign throws (finally block)', async () => {
    const walletId = await insertTestAgent(conn);
    const releaseKey = vi.fn();

    const adapter = createMockAdapter({
      signTransaction: async () => {
        throw new Error('Sign error');
      },
    });
    const keyStore = createMockKeyStore({ releaseKey });

    const ctx = createPipelineContext(conn, walletId, { adapter, keyStore });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await expect(stage5Execute(ctx)).rejects.toThrow('Sign error');

    // Key should still be released in finally block
    expect(releaseKey).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Stage 6: Confirm (2 tests)
// ---------------------------------------------------------------------------

describe('Stage 6: Confirm', () => {
  it('should update DB to CONFIRMED on success', async () => {
    const walletId = await insertTestAgent(conn);
    const ctx = createPipelineContext(conn, walletId);
    await stage1Validate(ctx);
    await stage3Policy(ctx);
    await stage5Execute(ctx);

    await stage6Confirm(ctx);

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('CONFIRMED');
    expect(tx!.executedAt).toBeTruthy();
  });

  it('should update DB to FAILED on timeout/error', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter({
      waitForConfirmation: async () => {
        throw new Error('Timeout waiting for confirmation');
      },
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);
    await stage5Execute(ctx);

    await expect(stage6Confirm(ctx)).rejects.toThrow('Timeout waiting for confirmation');

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('FAILED');
    expect(tx!.error).toBe('Timeout waiting for confirmation');
  });
});

// ---------------------------------------------------------------------------
// Full pipeline integration (2 tests)
// ---------------------------------------------------------------------------

describe('Full pipeline integration', () => {
  it('should complete executeSend with all mocks returning success -> CONFIRMED', async () => {
    const walletId = await insertTestAgent(conn);

    const pipeline = new TransactionPipeline({
      db: conn.db,
      adapter: createMockAdapter(),
      keyStore: createMockKeyStore(),
      policyEngine: new DefaultPolicyEngine(),
      masterPassword: 'test-master',
    });

    const txId = await pipeline.executeSend(walletId, createTestRequest());

    expect(txId).toBeTruthy();
    const tx = await pipeline.getTransaction(txId);
    expect(tx.status).toBe('CONFIRMED');
    expect(tx.tier).toBe('INSTANT');
    expect(tx.type).toBe('TRANSFER');
    expect(tx.amount).toBe('1000000000');
  });

  it('should throw WALLET_NOT_FOUND for non-existent wallet', async () => {
    const pipeline = new TransactionPipeline({
      db: conn.db,
      adapter: createMockAdapter(),
      keyStore: createMockKeyStore(),
      policyEngine: new DefaultPolicyEngine(),
      masterPassword: 'test-master',
    });

    await expect(
      pipeline.executeSend('00000000-0000-7000-8000-000000000000', createTestRequest()),
    ).rejects.toThrow('Wallet');
  });
});
