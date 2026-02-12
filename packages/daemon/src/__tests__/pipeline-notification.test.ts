/**
 * Tests for pipeline stage notification triggers.
 *
 * Verifies that each pipeline stage fires the correct NotificationService.notify()
 * event type as fire-and-forget (void). Uses mock NotificationService injected
 * via PipelineContext.notificationService.
 *
 * @see packages/daemon/src/pipeline/stages.ts
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
  stage2Auth,
  stage3Policy,
  stage5Execute,
  stage6Confirm,
} from '../pipeline/stages.js';
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
import type { NotificationService } from '../notifications/notification-service.js';

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

function createMockNotificationService() {
  return {
    notify: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotificationService;
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
// Stage 1: TX_REQUESTED notification
// ---------------------------------------------------------------------------

describe('stage1Validate: TX_REQUESTED notification', () => {
  it('should fire TX_REQUESTED notify after DB INSERT', async () => {
    const walletId = await insertTestAgent(conn);
    const notificationService = createMockNotificationService();
    const ctx = createPipelineContext(conn, walletId, { notificationService });

    await stage1Validate(ctx);

    expect(notificationService.notify).toHaveBeenCalledTimes(1);
    expect(notificationService.notify).toHaveBeenCalledWith(
      'TX_REQUESTED',
      walletId,
      { amount: '1000000000', to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', type: 'TRANSFER' },
      { txId: ctx.txId },
    );
  });
});

// ---------------------------------------------------------------------------
// Stage 3: POLICY_VIOLATION notification
// ---------------------------------------------------------------------------

describe('stage3Policy: POLICY_VIOLATION notification', () => {
  it('should fire POLICY_VIOLATION notify when policy denies', async () => {
    const walletId = await insertTestAgent(conn);
    const notificationService = createMockNotificationService();
    const denyEngine: IPolicyEngine = {
      evaluate: async () => ({
        tier: 'INSTANT' as const,
        allowed: false,
        reason: 'limit exceeded',
      }),
    };
    const ctx = createPipelineContext(conn, walletId, {
      notificationService,
      policyEngine: denyEngine,
    });
    await stage1Validate(ctx);

    // stage3Policy should throw POLICY_DENIED
    await expect(stage3Policy(ctx)).rejects.toThrow('limit exceeded');

    // notify should have been called for both TX_REQUESTED (stage1) and POLICY_VIOLATION (stage3)
    expect(notificationService.notify).toHaveBeenCalledTimes(2);
    expect(notificationService.notify).toHaveBeenCalledWith(
      'POLICY_VIOLATION',
      walletId,
      { reason: 'limit exceeded', amount: '1000000000', to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr' },
      { txId: ctx.txId },
    );
  });
});

// ---------------------------------------------------------------------------
// Stage 5: TX_SUBMITTED notification
// ---------------------------------------------------------------------------

describe('stage5Execute: TX_SUBMITTED notification', () => {
  it('should fire TX_SUBMITTED notify on successful submit', async () => {
    const walletId = await insertTestAgent(conn);
    const notificationService = createMockNotificationService();
    const ctx = createPipelineContext(conn, walletId, { notificationService });

    await stage1Validate(ctx);
    await stage3Policy(ctx);
    await stage5Execute(ctx);

    // TX_REQUESTED (stage1) + TX_SUBMITTED (stage5) = 2 calls
    const calls = (notificationService.notify as ReturnType<typeof vi.fn>).mock.calls;
    const submittedCall = calls.find(
      (c: unknown[]) => c[0] === 'TX_SUBMITTED',
    );
    expect(submittedCall).toBeTruthy();
    expect(submittedCall![1]).toBe(walletId);
    expect(submittedCall![2]).toHaveProperty('txHash');
    expect(submittedCall![2]).toHaveProperty('amount', '1000000000');
    expect(submittedCall![2]).toHaveProperty('to', 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
    expect(submittedCall![3]).toEqual({ txId: ctx.txId });
  });
});

// ---------------------------------------------------------------------------
// Stage 5: TX_FAILED on simulation failure
// ---------------------------------------------------------------------------

describe('stage5Execute: TX_FAILED notification on simulation failure', () => {
  it('should fire TX_FAILED notify when simulation fails', async () => {
    const walletId = await insertTestAgent(conn);
    const notificationService = createMockNotificationService();
    const adapter = createMockAdapter({
      simulateTransaction: async (): Promise<SimulationResult> => ({
        success: false,
        logs: ['error'],
        error: 'Insufficient funds',
      }),
    });
    const ctx = createPipelineContext(conn, walletId, {
      notificationService,
      adapter,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await expect(stage5Execute(ctx)).rejects.toThrow('Insufficient funds');

    const calls = (notificationService.notify as ReturnType<typeof vi.fn>).mock.calls;
    const failedCall = calls.find(
      (c: unknown[]) => c[0] === 'TX_FAILED',
    );
    expect(failedCall).toBeTruthy();
    expect(failedCall![1]).toBe(walletId);
    expect(failedCall![2]).toHaveProperty('reason', 'Insufficient funds');
    expect(failedCall![2]).toHaveProperty('amount', '1000000000');
    expect(failedCall![3]).toEqual({ txId: ctx.txId });
  });
});

// ---------------------------------------------------------------------------
// Stage 6: TX_CONFIRMED notification
// ---------------------------------------------------------------------------

describe('stage6Confirm: TX_CONFIRMED notification', () => {
  it('should fire TX_CONFIRMED notify on successful confirmation', async () => {
    const walletId = await insertTestAgent(conn);
    const notificationService = createMockNotificationService();
    const ctx = createPipelineContext(conn, walletId, { notificationService });

    await stage1Validate(ctx);
    await stage3Policy(ctx);
    await stage5Execute(ctx);
    await stage6Confirm(ctx);

    const calls = (notificationService.notify as ReturnType<typeof vi.fn>).mock.calls;
    const confirmedCall = calls.find(
      (c: unknown[]) => c[0] === 'TX_CONFIRMED',
    );
    expect(confirmedCall).toBeTruthy();
    expect(confirmedCall![1]).toBe(walletId);
    expect(confirmedCall![2]).toHaveProperty('txHash');
    expect(confirmedCall![2]).toHaveProperty('amount', '1000000000');
    expect(confirmedCall![2]).toHaveProperty('to', 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
    expect(confirmedCall![3]).toEqual({ txId: ctx.txId });
  });
});

// ---------------------------------------------------------------------------
// Stage 6: TX_FAILED on confirmation failure
// ---------------------------------------------------------------------------

describe('stage6Confirm: TX_FAILED notification on confirmation failure', () => {
  it('should fire TX_FAILED notify when confirmation times out', async () => {
    const walletId = await insertTestAgent(conn);
    const notificationService = createMockNotificationService();
    const adapter = createMockAdapter({
      waitForConfirmation: async () => {
        throw new Error('Timeout waiting for confirmation');
      },
    });
    const ctx = createPipelineContext(conn, walletId, {
      notificationService,
      adapter,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);
    await stage5Execute(ctx);

    await expect(stage6Confirm(ctx)).rejects.toThrow('Timeout waiting for confirmation');

    const calls = (notificationService.notify as ReturnType<typeof vi.fn>).mock.calls;
    const failedCall = calls.find(
      (c: unknown[]) => c[0] === 'TX_FAILED',
    );
    expect(failedCall).toBeTruthy();
    expect(failedCall![1]).toBe(walletId);
    expect(failedCall![2]).toHaveProperty('reason', 'Timeout waiting for confirmation');
    expect(failedCall![2]).toHaveProperty('amount', '1000000000');
    expect(failedCall![3]).toEqual({ txId: ctx.txId });
  });
});

// ---------------------------------------------------------------------------
// Optional chaining safety: no notificationService
// ---------------------------------------------------------------------------

describe('Pipeline stages without notificationService', () => {
  it('should complete full pipeline without errors when notificationService is undefined', async () => {
    const walletId = await insertTestAgent(conn);
    // No notificationService set -- should use optional chaining safely
    const ctx = createPipelineContext(conn, walletId);

    await stage1Validate(ctx);
    await stage2Auth(ctx);
    await stage3Policy(ctx);
    await stage5Execute(ctx);
    await stage6Confirm(ctx);

    // Verify pipeline completed successfully
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('CONFIRMED');
  });
});

// ---------------------------------------------------------------------------
// Fire-and-forget safety: notify rejection does not block stage
// ---------------------------------------------------------------------------

describe('Fire-and-forget safety', () => {
  it('should not block stage1Validate even when notify rejects', async () => {
    const walletId = await insertTestAgent(conn);
    const notificationService = createMockNotificationService();
    (notificationService.notify as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('channel down'),
    );
    const ctx = createPipelineContext(conn, walletId, { notificationService });

    // stage1Validate should complete despite notify rejection
    // void fire-and-forget means the rejection is detached from the stage's await
    await expect(stage1Validate(ctx)).resolves.not.toThrow();

    // Verify stage still worked correctly
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('PENDING');
  });
});
