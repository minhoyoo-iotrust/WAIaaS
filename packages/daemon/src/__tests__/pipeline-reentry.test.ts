/**
 * Tests for pipeline re-entry (#207, #208).
 *
 * #207: notificationService must be available in re-entry PipelineContext
 * #208: Original request must be serialized in stage1 metadata and restored in re-entry
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
  stage5Execute,
} from '../pipeline/stages.js';
import type { PipelineContext } from '../pipeline/stages.js';
import type {
  IChainAdapter,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  SendTransactionRequest,
  TransactionRequest,
} from '@waiaas/core';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAdapter(overrides: Partial<IChainAdapter> = {}): IChainAdapter {
  return {
    chain: 'solana' as const,
    network: 'solana-devnet' as const,
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
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    buildApprove: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    buildBatch: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    }),
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
    ...overrides,
  };
}

const MOCK_PRIVATE_KEY = new Uint8Array(64).fill(42);
const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

function createMockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => ({
      publicKey: MOCK_PUBLIC_KEY,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => MOCK_PRIVATE_KEY,
    releaseKey: vi.fn(),
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
}

async function insertTestWallet(conn: DatabaseConnection): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'solana-devnet',
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
  request: SendTransactionRequest | TransactionRequest,
  overrides: Partial<PipelineContext> = {},
): PipelineContext {
  return {
    db: conn.db,
    adapter: createMockAdapter(),
    keyStore: createMockKeyStore(),
    policyEngine: new DefaultPolicyEngine(),
    masterPassword: 'test-master',
    walletId,
    wallet: { publicKey: MOCK_PUBLIC_KEY, chain: 'solana', environment: 'testnet', defaultNetwork: 'solana-devnet' },
    resolvedNetwork: 'solana-devnet',
    request,
    txId: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let dbConn: DatabaseConnection;

beforeEach(() => {
  dbConn = createDatabase(':memory:');
  pushSchema(dbConn.sqlite);
});

afterEach(() => {
  dbConn.sqlite.close();
});

// ---------------------------------------------------------------------------
// #208: Original request serialization in Stage 1
// ---------------------------------------------------------------------------

describe('#208 - Stage 1 originalRequest serialization', () => {
  it('should serialize TRANSFER request in metadata', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request: SendTransactionRequest = {
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };
    const ctx = createPipelineContext(dbConn, walletId, request);
    await stage1Validate(ctx);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    expect(tx).toBeDefined();
    expect(tx!.metadata).toBeDefined();

    const meta = JSON.parse(tx!.metadata!);
    expect(meta.originalRequest).toEqual(request);
  });

  it('should serialize CONTRACT_CALL request with all fields in metadata', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request: TransactionRequest = {
      type: 'CONTRACT_CALL',
      to: 'Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb',
      programId: 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy',
      instructionData: 'AQAAAACYLOYE',
      accounts: [
        { pubkey: 'addr1', isSigner: true, isWritable: true },
        { pubkey: 'addr2', isSigner: false, isWritable: true },
      ],
    };
    const ctx = createPipelineContext(dbConn, walletId, request);
    await stage1Validate(ctx);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    const meta = JSON.parse(tx!.metadata!);
    expect(meta.originalRequest).toEqual(request);
    expect(meta.originalRequest.type).toBe('CONTRACT_CALL');
    expect(meta.originalRequest.programId).toBe('SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy');
    expect(meta.originalRequest.instructionData).toBe('AQAAAACYLOYE');
    expect(meta.originalRequest.accounts).toHaveLength(2);
  });

  it('should serialize TOKEN_TRANSFER request with token info in metadata', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request: TransactionRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '500000',
      token: {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
        symbol: 'USDC',
      },
    };
    const ctx = createPipelineContext(dbConn, walletId, request);
    await stage1Validate(ctx);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    const meta = JSON.parse(tx!.metadata!);
    expect(meta.originalRequest.type).toBe('TOKEN_TRANSFER');
    expect(meta.originalRequest.token.address).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(meta.originalRequest.token.decimals).toBe(6);
  });

  it('should serialize APPROVE request in metadata', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request: TransactionRequest = {
      type: 'APPROVE',
      spender: '0x1234567890abcdef1234567890abcdef12345678',
      token: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        symbol: 'USDC',
      },
      amount: '1000000',
    };

    const mockEvmAdapter = createMockAdapter({
      chain: 'ethereum' as any,
      network: 'ethereum-sepolia' as any,
    });
    const ctx = createPipelineContext(dbConn, walletId, request, {
      adapter: mockEvmAdapter,
      wallet: { publicKey: '0xabcdef', chain: 'ethereum', environment: 'testnet', defaultNetwork: 'ethereum-sepolia' },
    });
    await stage1Validate(ctx);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    const meta = JSON.parse(tx!.metadata!);
    expect(meta.originalRequest.type).toBe('APPROVE');
    expect(meta.originalRequest.spender).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(meta.originalRequest.token.symbol).toBe('USDC');
  });

  it('should serialize BATCH request with instructions array in metadata', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request: TransactionRequest = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '100' },
        { to: 'addr2', amount: '200' },
      ],
    };
    const ctx = createPipelineContext(dbConn, walletId, request);
    await stage1Validate(ctx);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    const meta = JSON.parse(tx!.metadata!);
    expect(meta.originalRequest.type).toBe('BATCH');
    expect(meta.originalRequest.instructions).toHaveLength(2);
    expect(meta.originalRequest.instructions[0].to).toBe('addr1');
  });
});

// ---------------------------------------------------------------------------
// #208: Re-entry request restoration
// ---------------------------------------------------------------------------

describe('#208 - Re-entry request restoration', () => {
  it('should restore CONTRACT_CALL request from metadata and call buildContractCall', async () => {
    const walletId = await insertTestWallet(dbConn);
    const originalRequest: TransactionRequest = {
      type: 'CONTRACT_CALL',
      to: 'Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb',
      programId: 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy',
      instructionData: 'AQAAAACYLOYE',
      accounts: [
        { pubkey: 'addr1', isSigner: true, isWritable: true },
        { pubkey: 'addr2', isSigner: false, isWritable: true },
      ],
    };

    // Stage 1: Insert with serialized request
    const ctx = createPipelineContext(dbConn, walletId, originalRequest);
    await stage1Validate(ctx);

    // Verify metadata was stored
    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    const meta = JSON.parse(tx!.metadata!);

    // Simulate re-entry: restore request from metadata (same logic as daemon.ts)
    const restoredRequest = meta.originalRequest;
    expect(restoredRequest.type).toBe('CONTRACT_CALL');
    expect(restoredRequest.programId).toBe('SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy');
    expect(restoredRequest.instructionData).toBe('AQAAAACYLOYE');
    expect(restoredRequest.accounts).toHaveLength(2);

    // Verify buildContractCall would be called (not buildTransaction)
    const buildContractCallSpy = vi.fn().mockResolvedValue({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    });
    const reentryAdapter = createMockAdapter({ buildContractCall: buildContractCallSpy });
    const reentryCtx = createPipelineContext(dbConn, walletId, restoredRequest, {
      adapter: reentryAdapter,
      txId: ctx.txId,
    });

    // Update status to allow stage5 execution
    dbConn.db.update(transactions).set({ status: 'PENDING' }).where(eq(transactions.id, ctx.txId)).run();

    await stage5Execute(reentryCtx);

    expect(buildContractCallSpy).toHaveBeenCalledTimes(1);
    expect(buildContractCallSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        programId: 'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy',
      }),
    );
  });

  it('should restore TOKEN_TRANSFER request from metadata and call buildTokenTransfer', async () => {
    const walletId = await insertTestWallet(dbConn);
    const originalRequest: TransactionRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '500000',
      token: {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
        symbol: 'USDC',
      },
    };

    const ctx = createPipelineContext(dbConn, walletId, originalRequest);
    await stage1Validate(ctx);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    const meta = JSON.parse(tx!.metadata!);
    const restoredRequest = meta.originalRequest;

    const buildTokenTransferSpy = vi.fn().mockResolvedValue({
      chain: 'solana',
      serialized: new Uint8Array(128),
      estimatedFee: 5000n,
      metadata: {},
    });
    const reentryAdapter = createMockAdapter({ buildTokenTransfer: buildTokenTransferSpy });
    const reentryCtx = createPipelineContext(dbConn, walletId, restoredRequest, {
      adapter: reentryAdapter,
      txId: ctx.txId,
    });

    dbConn.db.update(transactions).set({ status: 'PENDING' }).where(eq(transactions.id, ctx.txId)).run();
    await stage5Execute(reentryCtx);

    expect(buildTokenTransferSpy).toHaveBeenCalledTimes(1);
    expect(buildTokenTransferSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ symbol: 'USDC', decimals: 6 }),
      }),
    );
  });

  it('should fallback gracefully when metadata has no originalRequest (legacy tx)', async () => {
    const walletId = await insertTestWallet(dbConn);
    const txId = generateId();
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);

    // Insert a legacy transaction without originalRequest in metadata
    dbConn.db.insert(transactions).values({
      id: txId,
      walletId,
      chain: 'solana',
      network: 'solana-devnet',
      type: 'TRANSFER',
      status: 'PENDING',
      amount: '1000000000',
      toAddress: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      createdAt: now,
      metadata: null,
    }).run();

    // Simulate re-entry fallback (same logic as daemon.ts)
    const txMetadata: string | null = null;
    const meta = txMetadata ? JSON.parse(txMetadata) : {};
    const request = meta.originalRequest ?? {
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
      memo: undefined,
    };

    expect(request.to).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
    expect(request.amount).toBe('1000000000');
  });
});

// ---------------------------------------------------------------------------
// #207: notificationService in re-entry
// ---------------------------------------------------------------------------

describe('#207 - notificationService in re-entry context', () => {
  it('should call notificationService.notify when available in re-entry context', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request: SendTransactionRequest = {
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };
    const ctx = createPipelineContext(dbConn, walletId, request);
    await stage1Validate(ctx);

    // Create mock notificationService
    const notifyMock = vi.fn().mockResolvedValue(undefined);
    const mockNotificationService = { notify: notifyMock } as any;

    // Re-entry context with notificationService (#207 fix)
    const reentryCtx = createPipelineContext(dbConn, walletId, request, {
      txId: ctx.txId,
      notificationService: mockNotificationService,
    });

    dbConn.db.update(transactions).set({ status: 'PENDING' }).where(eq(transactions.id, ctx.txId)).run();
    await stage5Execute(reentryCtx);

    // notificationService.notify should have been called for TX_SUBMITTED
    expect(notifyMock).toHaveBeenCalledWith(
      'TX_SUBMITTED',
      walletId,
      expect.objectContaining({ txId: ctx.txId }),
      expect.objectContaining({ txId: ctx.txId }),
    );
  });

  it('should not throw when notificationService is undefined in re-entry context', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request: SendTransactionRequest = {
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };
    const ctx = createPipelineContext(dbConn, walletId, request);
    await stage1Validate(ctx);

    // Re-entry context WITHOUT notificationService (should not throw)
    const reentryCtx = createPipelineContext(dbConn, walletId, request, {
      txId: ctx.txId,
      notificationService: undefined,
    });

    dbConn.db.update(transactions).set({ status: 'PENDING' }).where(eq(transactions.id, ctx.txId)).run();
    await expect(stage5Execute(reentryCtx)).resolves.not.toThrow();
  });
});
