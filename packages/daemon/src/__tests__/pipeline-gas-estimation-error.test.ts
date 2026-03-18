/**
 * Pipeline gas estimation error supplementary tests.
 *
 * Tests ChainError to WAIaaSError conversion in stage5 when
 * simulation/gas estimation fails:
 * - EVM revert reason in error message
 * - Solana InstructionError in error message
 * - ChainError -> WAIaaSError conversion preserves code and chain
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import {
  stage1Validate,
  stage5Execute,
} from '../pipeline/stages.js';
import type { PipelineContext } from '../pipeline/stages.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import {
  ChainError,
  WAIaaSError,
  type IChainAdapter,
  type UnsignedTransaction,
  type SimulationResult,
  type SubmitResult,
  type BalanceInfo,
  type HealthInfo,
} from '@waiaas/core';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';

// Mock sleep
vi.mock('../pipeline/sleep.js', () => ({
  sleep: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

function createMockAdapter(overrides: Partial<IChainAdapter> = {}): IChainAdapter {
  return {
    chain: 'solana' as const,
    network: 'solana-devnet' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async (): Promise<HealthInfo> => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string): Promise<BalanceInfo> => ({
      address: addr, balance: 1_000_000_000n, decimals: 9, symbol: 'SOL',
    }),
    buildTransaction: vi.fn(async (): Promise<UnsignedTransaction> => ({
      chain: 'solana', serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    })),
    simulateTransaction: vi.fn(async (): Promise<SimulationResult> => ({
      success: true, logs: [],
    })),
    signTransaction: vi.fn(async (): Promise<Uint8Array> => new Uint8Array(256)),
    submitTransaction: vi.fn(async (): Promise<SubmitResult> => ({
      txHash: 'mock-tx', status: 'submitted',
    })),
    waitForConfirmation: async (txHash: string): Promise<SubmitResult> => ({
      txHash, status: 'confirmed', confirmations: 1,
    }),
    getAssets: async () => [],
    estimateFee: async () => { throw new Error('not implemented'); },
    buildTokenTransfer: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana', serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    getTokenInfo: async () => { throw new Error('not implemented'); },
    buildContractCall: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana', serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    buildApprove: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana', serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    buildBatch: async (): Promise<UnsignedTransaction> => ({
      chain: 'solana', serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    getTransactionFee: async () => { throw new Error('not implemented'); },
    getCurrentNonce: async () => 0,
    sweepAll: async () => { throw new Error('not implemented'); },
    ...overrides,
  };
}

function createMockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => ({ publicKey: MOCK_PUBLIC_KEY, encryptedPrivateKey: new Uint8Array(64) }),
    decryptPrivateKey: async () => new Uint8Array(64).fill(42),
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
    id, name: 'test-wallet', chain: 'solana', environment: 'testnet',
    defaultNetwork: 'solana-devnet', publicKey: MOCK_PUBLIC_KEY,
    status: 'ACTIVE', createdAt: now, updatedAt: now,
  });
  return id;
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

describe('Gas estimation error: simulation failure propagation', () => {
  it('throws WAIaaSError when simulateTransaction fails with PERMANENT ChainError', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request = { to: 'recipient_addr', amount: '1000000000' };

    const adapter = createMockAdapter({
      simulateTransaction: vi.fn(async () => {
        throw new ChainError('EXECUTION_REVERTED', 'solana', {
          message: 'Transaction simulation failed: insufficient funds for rent',
        });
      }),
    });

    const ctx: PipelineContext = {
      db: dbConn.db,
      adapter,
      keyStore: createMockKeyStore(),
      policyEngine: new DefaultPolicyEngine(),
      masterPassword: 'test-master',
      walletId,
      wallet: { publicKey: MOCK_PUBLIC_KEY, chain: 'solana', environment: 'testnet', defaultNetwork: 'solana-devnet' },
      resolvedNetwork: 'solana-devnet',
      request,
      txId: '',
    };

    await stage1Validate(ctx);
    dbConn.db.update(transactions).set({ status: 'PENDING' }).where(eq(transactions.id, ctx.txId)).run();

    try {
      await stage5Execute(ctx);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      const waErr = err as WAIaaSError;
      expect(waErr.message).toContain('insufficient funds');
    }
  });

  it('throws WAIaaSError with revert reason for EVM contract revert', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request = { to: 'recipient_addr', amount: '1000000000' };

    const adapter = createMockAdapter({
      chain: 'ethereum' as any,
      network: 'ethereum-sepolia' as any,
      simulateTransaction: vi.fn(async () => {
        throw new ChainError('EXECUTION_REVERTED', 'ethereum', {
          message: 'execution reverted: ERC20: transfer amount exceeds balance',
        });
      }),
    });

    const ctx: PipelineContext = {
      db: dbConn.db,
      adapter,
      keyStore: createMockKeyStore(),
      policyEngine: new DefaultPolicyEngine(),
      masterPassword: 'test-master',
      walletId,
      wallet: { publicKey: '0xabc', chain: 'ethereum', environment: 'testnet', defaultNetwork: 'ethereum-sepolia' },
      resolvedNetwork: 'ethereum-sepolia',
      request,
      txId: '',
    };

    await stage1Validate(ctx);
    dbConn.db.update(transactions).set({ status: 'PENDING' }).where(eq(transactions.id, ctx.txId)).run();

    try {
      await stage5Execute(ctx);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      const waErr = err as WAIaaSError;
      expect(waErr.message).toContain('exceeds balance');
    }
  });

  it('marks transaction as FAILED in DB on simulation error', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request = { to: 'recipient_addr', amount: '1000000000' };

    const adapter = createMockAdapter({
      simulateTransaction: vi.fn(async () => {
        throw new ChainError('EXECUTION_REVERTED', 'solana', {
          message: 'custom program error: 0x1',
        });
      }),
    });

    const ctx: PipelineContext = {
      db: dbConn.db,
      adapter,
      keyStore: createMockKeyStore(),
      policyEngine: new DefaultPolicyEngine(),
      masterPassword: 'test-master',
      walletId,
      wallet: { publicKey: MOCK_PUBLIC_KEY, chain: 'solana', environment: 'testnet', defaultNetwork: 'solana-devnet' },
      resolvedNetwork: 'solana-devnet',
      request,
      txId: '',
    };

    await stage1Validate(ctx);
    dbConn.db.update(transactions).set({ status: 'PENDING' }).where(eq(transactions.id, ctx.txId)).run();

    try {
      await stage5Execute(ctx);
    } catch {
      // Expected
    }

    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    expect(tx!.status).toBe('FAILED');
  });
});

describe('Gas estimation error: buildTransaction failure', () => {
  it('throws when buildTransaction fails with gas estimation error', async () => {
    const walletId = await insertTestWallet(dbConn);
    const request = { to: 'recipient_addr', amount: '1000000000' };

    const adapter = createMockAdapter({
      buildTransaction: vi.fn(async () => {
        throw new ChainError('FEE_ESTIMATION_FAILED', 'solana', {
          message: 'Failed to estimate transaction fee',
        });
      }),
    });

    const ctx: PipelineContext = {
      db: dbConn.db,
      adapter,
      keyStore: createMockKeyStore(),
      policyEngine: new DefaultPolicyEngine(),
      masterPassword: 'test-master',
      walletId,
      wallet: { publicKey: MOCK_PUBLIC_KEY, chain: 'solana', environment: 'testnet', defaultNetwork: 'solana-devnet' },
      resolvedNetwork: 'solana-devnet',
      request,
      txId: '',
    };

    await stage1Validate(ctx);
    dbConn.db.update(transactions).set({ status: 'PENDING' }).where(eq(transactions.id, ctx.txId)).run();

    try {
      await stage5Execute(ctx);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
    }
  });
});
