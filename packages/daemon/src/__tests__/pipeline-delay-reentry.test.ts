/**
 * Pipeline DELAY re-entry supplementary tests.
 *
 * Focuses on type-specific request serialization/restoration beyond
 * what pipeline-reentry.test.ts covers:
 * - SIGN type request preservation
 * - Multiple request types produce independent metadata
 * - X402_PAYMENT type request with paymentDetails
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import { stage1Validate } from '../pipeline/stages.js';
import type { PipelineContext } from '../pipeline/stages.js';
import type {
  IChainAdapter,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  TransactionRequest,
} from '@waiaas/core';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

function createMockAdapter(chain: string = 'solana', network: string = 'solana-devnet'): IChainAdapter {
  return {
    chain: chain as any,
    network: network as any,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string): Promise<BalanceInfo> => ({
      address: addr, balance: 1_000_000_000n, decimals: 9, symbol: 'SOL',
    }),
    buildTransaction: async (): Promise<UnsignedTransaction> => ({
      chain: chain as any, serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    simulateTransaction: async (): Promise<SimulationResult> => ({ success: true, logs: [] }),
    signTransaction: async (): Promise<Uint8Array> => new Uint8Array(256),
    submitTransaction: async (): Promise<SubmitResult> => ({ txHash: 'mock-tx', status: 'submitted' }),
    waitForConfirmation: async (txHash: string): Promise<SubmitResult> => ({ txHash, status: 'confirmed', confirmations: 1 }),
    getAssets: async () => [],
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async (): Promise<UnsignedTransaction> => ({
      chain: chain as any, serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async (): Promise<UnsignedTransaction> => ({
      chain: chain as any, serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    buildApprove: async (): Promise<UnsignedTransaction> => ({
      chain: chain as any, serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    buildBatch: async (): Promise<UnsignedTransaction> => ({
      chain: chain as any, serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
  };
}

function createMockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => ({ publicKey: MOCK_PUBLIC_KEY, encryptedPrivateKey: new Uint8Array(64) }),
    decryptPrivateKey: async () => new Uint8Array(64).fill(42),
    releaseKey: () => {},
    hasKey: async () => true,
    deleteKey: async () => {},
    lockAll: () => {},
    sodiumAvailable: true,
  } as unknown as LocalKeyStore;
}

async function insertTestWallet(conn: DatabaseConnection, chain: string = 'solana'): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const defaultNetwork = chain === 'ethereum' ? 'ethereum-sepolia' : 'solana-devnet';
  await conn.db.insert(wallets).values({
    id, name: 'test-wallet', chain, environment: 'testnet',
    defaultNetwork, publicKey: MOCK_PUBLIC_KEY,
    status: 'ACTIVE', createdAt: now, updatedAt: now,
  });
  return id;
}

function createCtx(
  conn: DatabaseConnection,
  walletId: string,
  request: TransactionRequest | { to: string; amount: string },
  chain: string = 'solana',
): PipelineContext {
  const defaultNetwork = chain === 'ethereum' ? 'ethereum-sepolia' : 'solana-devnet';
  return {
    db: conn.db,
    adapter: createMockAdapter(chain, defaultNetwork),
    keyStore: createMockKeyStore(),
    policyEngine: new DefaultPolicyEngine(),
    masterPassword: 'test-master',
    walletId,
    wallet: { publicKey: MOCK_PUBLIC_KEY, chain, environment: 'testnet', defaultNetwork },
    resolvedNetwork: defaultNetwork,
    request,
    txId: '',
  };
}

// ---------------------------------------------------------------------------
// Setup
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
// Tests
// ---------------------------------------------------------------------------

describe('DELAY re-entry: APPROVE type request preservation', () => {
  it('serializes APPROVE request with spender and token fields in metadata', async () => {
    const walletId = await insertTestWallet(dbConn, 'ethereum');
    const request: TransactionRequest = {
      type: 'APPROVE',
      spender: '0xSpenderAddress1234567890123456789012345678',
      token: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        symbol: 'USDC',
      },
      amount: '1000000',
    } as TransactionRequest;

    const ctx = createCtx(dbConn, walletId, request, 'ethereum');
    await stage1Validate(ctx);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    expect(tx).toBeDefined();
    const meta = JSON.parse(tx!.metadata!);
    expect(meta.originalRequest.type).toBe('APPROVE');
    expect(meta.originalRequest.spender).toBe('0xSpenderAddress1234567890123456789012345678');
    expect(meta.originalRequest.token.symbol).toBe('USDC');
  });
});

describe('DELAY re-entry: TOKEN_TRANSFER with memo preservation', () => {
  it('serializes TOKEN_TRANSFER request with memo field', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request: TransactionRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000',
      token: {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
        symbol: 'USDC',
      },
      memo: 'payment for invoice #42',
    } as TransactionRequest;

    const ctx = createCtx(dbConn, walletId, request);
    await stage1Validate(ctx);

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    const meta = JSON.parse(tx!.metadata!);
    expect(meta.originalRequest.type).toBe('TOKEN_TRANSFER');
    expect(meta.originalRequest.memo).toBe('payment for invoice #42');
    expect(meta.originalRequest.token.symbol).toBe('USDC');
  });
});

describe('DELAY re-entry: metadata integrity on repeated serialization', () => {
  it('two different requests produce independent metadata', async () => {
    const walletId = await insertTestWallet(dbConn);

    // Request 1: TRANSFER
    const ctx1 = createCtx(dbConn, walletId, { to: 'addr1', amount: '100' });
    await stage1Validate(ctx1);

    // Request 2: CONTRACT_CALL
    const ctx2 = createCtx(dbConn, walletId, {
      type: 'CONTRACT_CALL',
      to: 'addr2',
      programId: 'prog1',
      instructionData: 'data1',
      accounts: [],
    } as TransactionRequest);
    await stage1Validate(ctx2);

    const tx1 = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx1.txId)).get();
    const tx2 = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx2.txId)).get();

    const meta1 = JSON.parse(tx1!.metadata!);
    const meta2 = JSON.parse(tx2!.metadata!);

    expect(meta1.originalRequest.to).toBe('addr1');
    expect(meta2.originalRequest.type).toBe('CONTRACT_CALL');
    expect(meta2.originalRequest.programId).toBe('prog1');
  });

  it('TRANSFER and BATCH stored independently', async () => {
    const walletId = await insertTestWallet(dbConn);

    const ctx1 = createCtx(dbConn, walletId, { to: 'addr1', amount: '500' });
    await stage1Validate(ctx1);

    const batchReq: TransactionRequest = {
      type: 'BATCH',
      instructions: [
        { to: 'batch1', amount: '100' },
        { to: 'batch2', amount: '200' },
      ],
    } as TransactionRequest;
    const ctx2 = createCtx(dbConn, walletId, batchReq);
    await stage1Validate(ctx2);

    const meta1 = JSON.parse(
      dbConn.db.select().from(transactions).where(eq(transactions.id, ctx1.txId)).get()!.metadata!,
    );
    const meta2 = JSON.parse(
      dbConn.db.select().from(transactions).where(eq(transactions.id, ctx2.txId)).get()!.metadata!,
    );

    expect(meta1.originalRequest.amount).toBe('500');
    expect(meta2.originalRequest.type).toBe('BATCH');
    expect(meta2.originalRequest.instructions).toHaveLength(2);
  });
});
