/**
 * TDD tests for Stage 5 CONC-01 retry logic + type-based adapter routing.
 *
 * Tests:
 * - buildByType routes to correct adapter method based on request.type
 * - ChainError PERMANENT -> immediate FAILED, no retry
 * - ChainError TRANSIENT -> exponential backoff, max 3 retries (retryCount >= 3)
 * - ChainError STALE -> rebuild from Stage 5a, max 1 (retryCount >= 1)
 * - retryCount shared between TRANSIENT and STALE
 * - ChainError -> WAIaaSError conversion
 * - Integration: full flow for TOKEN_TRANSFER, BATCH, DB state + notification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import {
  stage1Validate,
  stage3Policy,
  stage5Execute,
} from '../pipeline/stages.js';
import type { PipelineContext } from '../pipeline/stages.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';

// Mock sleep to avoid actual delays in tests (exponential backoff: 1s, 2s, 4s)
vi.mock('../pipeline/sleep.js', () => ({
  sleep: vi.fn(async () => {}),
}));

import {
  ChainError,
  WAIaaSError,
  type IChainAdapter,
  type UnsignedTransaction,
  type SimulationResult,
  type SubmitResult,
  type BalanceInfo,
  type HealthInfo,
  type SendTransactionRequest,
  type TokenTransferRequest,
  type ContractCallRequest,
  type ApproveRequest,
  type BatchRequest,
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
    buildTransaction: vi.fn(async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    })),
    simulateTransaction: vi.fn(async (): Promise<SimulationResult> => ({
      success: true,
      logs: ['Program log: success'],
    })),
    signTransaction: vi.fn(async (): Promise<Uint8Array> => new Uint8Array(256)),
    submitTransaction: vi.fn(async (): Promise<SubmitResult> => ({
      txHash: 'mock-tx-hash-' + Date.now(),
      status: 'submitted',
    })),
    waitForConfirmation: async (txHash: string): Promise<SubmitResult> => ({
      txHash,
      status: 'confirmed',
      confirmations: 1,
    }),
    getAssets: async () => [],
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: vi.fn(async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    })),
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: vi.fn(async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    })),
    buildApprove: vi.fn(async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    })),
    buildBatch: vi.fn(async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    })),
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

function createMockNotificationService(): NotificationService {
  return {
    notify: vi.fn(),
    getRecentLogs: vi.fn(async () => []),
  } as unknown as NotificationService;
}

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

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
    request: { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '1000000000' },
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

// ===========================================================================
// buildByType routing tests (5 tests)
// ===========================================================================

describe('Stage 5: buildByType routing', () => {
  it('should call adapter.buildTransaction for TRANSFER request', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter();
    const request = {
      type: 'TRANSFER' as const,
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };

    const ctx = createPipelineContext(conn, walletId, {
      adapter,
      request: request as unknown as SendTransactionRequest,
    });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    expect(adapter.buildTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        from: MOCK_PUBLIC_KEY,
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: 1000000000n,
      }),
    );
  });

  it('should call adapter.buildTokenTransfer for TOKEN_TRANSFER request', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter();
    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
    };

    const ctx = createPipelineContext(conn, walletId, {
      adapter,
      request: request as unknown as SendTransactionRequest,
    });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    expect(adapter.buildTokenTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        from: MOCK_PUBLIC_KEY,
        to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
        amount: 5000000n,
        token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
      }),
    );
  });

  it('should call adapter.buildContractCall for CONTRACT_CALL request', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter();
    const request: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      calldata: '0xa9059cbb0000000000000000',
    };

    const ctx = createPipelineContext(conn, walletId, {
      adapter,
      request: request as unknown as SendTransactionRequest,
    });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    expect(adapter.buildContractCall).toHaveBeenCalledWith(
      expect.objectContaining({
        from: MOCK_PUBLIC_KEY,
        to: '0x1234567890abcdef1234567890abcdef12345678',
        calldata: '0xa9059cbb0000000000000000',
      }),
    );
  });

  it('should call adapter.buildApprove for APPROVE request', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter();
    const request: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xabcdef1234567890abcdef1234567890abcdef12',
      token: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, symbol: 'USDC' },
      amount: '1000000',
    };

    const ctx = createPipelineContext(conn, walletId, {
      adapter,
      request: request as unknown as SendTransactionRequest,
    });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    expect(adapter.buildApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        from: MOCK_PUBLIC_KEY,
        spender: '0xabcdef1234567890abcdef1234567890abcdef12',
        token: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, symbol: 'USDC' },
        amount: 1000000n,
      }),
    );
  });

  it('should call adapter.buildBatch for BATCH request', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter();
    const request: BatchRequest = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000' },
        { to: 'addr2', amount: '2000000' },
      ],
    };

    const ctx = createPipelineContext(conn, walletId, {
      adapter,
      request: request as unknown as SendTransactionRequest,
    });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    expect(adapter.buildBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        from: MOCK_PUBLIC_KEY,
        instructions: expect.arrayContaining([
          expect.objectContaining({ from: MOCK_PUBLIC_KEY, to: 'addr1', amount: 1000000n }),
          expect.objectContaining({ from: MOCK_PUBLIC_KEY, to: 'addr2', amount: 2000000n }),
        ]),
      }),
    );
  });
});

// ===========================================================================
// ChainError category retry tests (7 tests)
// ===========================================================================

describe('Stage 5: ChainError category-based retry', () => {
  it('should immediately FAIL on PERMANENT ChainError with no retry', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter({
      simulateTransaction: vi.fn(async () => {
        throw new ChainError('INSUFFICIENT_BALANCE', 'solana', {
          message: 'Insufficient balance for transfer',
        });
      }),
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await expect(stage5Execute(ctx)).rejects.toThrow(WAIaaSError);

    // DB should be FAILED
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('FAILED');

    // simulate should only be called once (no retry for PERMANENT)
    expect(adapter.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it('should retry TRANSIENT ChainError with exponential backoff', async () => {
    const walletId = await insertTestAgent(conn);
    let callCount = 0;
    const adapter = createMockAdapter({
      simulateTransaction: vi.fn(async (): Promise<SimulationResult> => {
        callCount++;
        if (callCount <= 1) {
          throw new ChainError('RPC_TIMEOUT', 'solana', {
            message: 'RPC timeout',
          });
        }
        return { success: true, logs: [] };
      }),
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // Should succeed after retry
    await stage5Execute(ctx);

    // simulate called twice: initial failure + 1 retry
    expect(adapter.simulateTransaction).toHaveBeenCalledTimes(2);
  });

  it('should FAIL after TRANSIENT retryCount >= 3 (initial + 3 retries = 4 total attempts)', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter({
      simulateTransaction: vi.fn(async () => {
        throw new ChainError('RPC_TIMEOUT', 'solana', {
          message: 'RPC timeout',
        });
      }),
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await expect(stage5Execute(ctx)).rejects.toThrow(WAIaaSError);

    // DB should be FAILED
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('FAILED');

    // simulate called 4 times: initial + 3 retries (retryCount 0,1,2 -> fail at retryCount=3)
    expect(adapter.simulateTransaction).toHaveBeenCalledTimes(4);
  });

  it('should rebuild from Stage 5a on STALE ChainError', async () => {
    const walletId = await insertTestAgent(conn);
    let submitCount = 0;
    const adapter = createMockAdapter({
      submitTransaction: vi.fn(async (): Promise<SubmitResult> => {
        submitCount++;
        if (submitCount <= 1) {
          throw new ChainError('BLOCKHASH_EXPIRED', 'solana', {
            message: 'Blockhash expired',
          });
        }
        return { txHash: 'final-hash', status: 'submitted' };
      }),
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    // buildTransaction should be called twice (initial + rebuild after STALE)
    expect(adapter.buildTransaction).toHaveBeenCalledTimes(2);
    // submit should be called twice (initial STALE + success after rebuild)
    expect(adapter.submitTransaction).toHaveBeenCalledTimes(2);
  });

  it('should succeed on STALE retry after rebuild', async () => {
    const walletId = await insertTestAgent(conn);
    let submitCount = 0;
    const adapter = createMockAdapter({
      submitTransaction: vi.fn(async (): Promise<SubmitResult> => {
        submitCount++;
        if (submitCount <= 1) {
          throw new ChainError('NONCE_TOO_LOW', 'solana', {
            message: 'Nonce too low',
          });
        }
        return { txHash: 'success-hash', status: 'submitted' };
      }),
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    // DB should be SUBMITTED with final hash
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('SUBMITTED');
    expect(tx!.txHash).toBe('success-hash');
  });

  it('should FAIL on second STALE after rebuild (retryCount shared)', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter({
      submitTransaction: vi.fn(async () => {
        throw new ChainError('BLOCKHASH_EXPIRED', 'solana', {
          message: 'Blockhash expired again',
        });
      }),
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await expect(stage5Execute(ctx)).rejects.toThrow(WAIaaSError);

    // DB should be FAILED
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('FAILED');

    // buildTransaction called twice (initial + 1 rebuild), then STALE hits retryCount>=1
    expect(adapter.buildTransaction).toHaveBeenCalledTimes(2);
    // submit called twice (initial STALE + second STALE after rebuild)
    expect(adapter.submitTransaction).toHaveBeenCalledTimes(2);
  });

  it('should convert ChainError to WAIaaSError with CHAIN_ERROR code', async () => {
    const walletId = await insertTestAgent(conn);
    const adapter = createMockAdapter({
      simulateTransaction: vi.fn(async () => {
        throw new ChainError('INVALID_ADDRESS', 'solana', {
          message: 'Invalid destination address',
        });
      }),
    });

    const ctx = createPipelineContext(conn, walletId, { adapter });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    try {
      await stage5Execute(ctx);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('CHAIN_ERROR');
      expect((err as WAIaaSError).message).toContain('Invalid destination address');
    }
  });
});

// ===========================================================================
// Integration tests (3 tests)
// ===========================================================================

describe('Stage 5: Integration tests', () => {
  it('should complete TOKEN_TRANSFER full flow: buildTokenTransfer -> simulate -> sign -> submit', async () => {
    const walletId = await insertTestAgent(conn);
    const callOrder: string[] = [];

    const adapter = createMockAdapter({
      buildTokenTransfer: vi.fn(async (): Promise<UnsignedTransaction> => {
        callOrder.push('buildTokenTransfer');
        return { chain: 'solana', serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {} };
      }),
      simulateTransaction: vi.fn(async (): Promise<SimulationResult> => {
        callOrder.push('simulate');
        return { success: true, logs: [] };
      }),
      signTransaction: vi.fn(async (): Promise<Uint8Array> => {
        callOrder.push('sign');
        return new Uint8Array(256);
      }),
      submitTransaction: vi.fn(async (): Promise<SubmitResult> => {
        callOrder.push('submit');
        return { txHash: 'token-tx-hash', status: 'submitted' };
      }),
    });

    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
    };

    const ctx = createPipelineContext(conn, walletId, {
      adapter,
      request: request as unknown as SendTransactionRequest,
    });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    expect(callOrder).toEqual(['buildTokenTransfer', 'simulate', 'sign', 'submit']);

    // DB should be SUBMITTED
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('SUBMITTED');
    expect(tx!.txHash).toBe('token-tx-hash');
  });

  it('should complete BATCH full flow: buildBatch -> simulate -> sign -> submit', async () => {
    const walletId = await insertTestAgent(conn);
    const callOrder: string[] = [];

    const adapter = createMockAdapter({
      buildBatch: vi.fn(async (): Promise<UnsignedTransaction> => {
        callOrder.push('buildBatch');
        return { chain: 'solana', serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {} };
      }),
      simulateTransaction: vi.fn(async (): Promise<SimulationResult> => {
        callOrder.push('simulate');
        return { success: true, logs: [] };
      }),
      signTransaction: vi.fn(async (): Promise<Uint8Array> => {
        callOrder.push('sign');
        return new Uint8Array(256);
      }),
      submitTransaction: vi.fn(async (): Promise<SubmitResult> => {
        callOrder.push('submit');
        return { txHash: 'batch-tx-hash', status: 'submitted' };
      }),
    });

    const request: BatchRequest = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000' },
        { to: 'addr2', amount: '2000000' },
      ],
    };

    const ctx = createPipelineContext(conn, walletId, {
      adapter,
      request: request as unknown as SendTransactionRequest,
    });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    await stage5Execute(ctx);

    expect(callOrder).toEqual(['buildBatch', 'simulate', 'sign', 'submit']);

    // DB should be SUBMITTED
    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('SUBMITTED');
    expect(tx!.txHash).toBe('batch-tx-hash');
  });

  it('should update DB PENDING -> SUBMITTED and fire TX_SUBMITTED notification on success', async () => {
    const walletId = await insertTestAgent(conn);
    const notificationService = createMockNotificationService();

    const adapter = createMockAdapter({
      submitTransaction: vi.fn(async (): Promise<SubmitResult> => ({
        txHash: 'notify-hash',
        status: 'submitted',
      })),
    });

    const request = {
      type: 'TRANSFER' as const,
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };

    const ctx = createPipelineContext(conn, walletId, {
      adapter,
      request: request as unknown as SendTransactionRequest,
      notificationService,
    });
    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // Before stage5, status is PENDING
    let tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('PENDING');

    await stage5Execute(ctx);

    // After stage5, status is SUBMITTED
    tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx!.status).toBe('SUBMITTED');
    expect(tx!.txHash).toBe('notify-hash');

    // TX_SUBMITTED notification should have been fired
    expect(notificationService.notify).toHaveBeenCalledWith(
      'TX_SUBMITTED',
      walletId,
      expect.objectContaining({ txHash: 'notify-hash' }),
      expect.objectContaining({ txId: ctx.txId }),
    );
  });
});
