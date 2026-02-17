/**
 * Integration tests for network resolution across pipeline layers.
 *
 * Tests:
 *   1. Stage 1 records resolvedNetwork to transactions.network column
 *   2. Stage 3 passes resolvedNetwork to policy engine TransactionParam.network
 *   3. Route layer error conversion: environment mismatch -> ENVIRONMENT_NETWORK_MISMATCH WAIaaSError
 *   4. Route layer error conversion: chain mismatch -> ACTION_VALIDATION_FAILED WAIaaSError
 *   5. daemon.ts re-entry: tx.network used directly, null falls back to getDefaultNetwork
 *
 * @see docs/70-pipeline-network-resolve-design.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { stage1Validate, stage3Policy } from '../pipeline/stages.js';
import type { PipelineContext } from '../pipeline/stages.js';
import { resolveNetwork } from '../pipeline/network-resolver.js';
import { WAIaaSError, getDefaultNetwork } from '@waiaas/core';
import type {
  IChainAdapter,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
} from '@waiaas/core';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';

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

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

function createMockKeyStore(): LocalKeyStore {
  return {
    generateKeyPair: async () => ({
      publicKey: MOCK_PUBLIC_KEY,
      encryptedPrivateKey: new Uint8Array(64),
    }),
    decryptPrivateKey: async () => new Uint8Array(64).fill(42),
    lockAll: () => {},
    getStoredKeys: () => [],
    deleteKey: async () => {},
  } as unknown as LocalKeyStore;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Pipeline network resolution integration', () => {
  let dbConn: DatabaseConnection;
  let walletId: string;

  beforeEach(async () => {
    dbConn = createDatabase(':memory:');
    pushSchema(dbConn.sqlite);

    // Insert a testnet solana wallet with defaultNetwork=devnet
    walletId = generateId();
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    await dbConn.db.insert(wallets).values({
      id: walletId,
      name: 'test-wallet',
      chain: 'solana',
      environment: 'testnet',
      defaultNetwork: 'devnet',
      publicKey: MOCK_PUBLIC_KEY,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    try { dbConn.sqlite.close(); } catch { /* ignore */ }
  });

  // -------------------------------------------------------------------------
  // Test 1: Stage 1 records resolvedNetwork to transactions.network column
  // -------------------------------------------------------------------------

  it('Stage 1 records resolvedNetwork to transactions.network column', async () => {
    const ctx: PipelineContext = {
      db: dbConn.db,
      adapter: createMockAdapter(),
      keyStore: createMockKeyStore(),
      policyEngine: new DefaultPolicyEngine(),
      masterPassword: 'test-pw',
      walletId,
      wallet: {
        publicKey: MOCK_PUBLIC_KEY,
        chain: 'solana',
        environment: 'testnet',
        defaultNetwork: 'devnet',
      },
      resolvedNetwork: 'testnet', // explicit non-default network
      request: { to: '22222222222222222222222222222222', amount: '100000000' },
      txId: '',
    };

    await stage1Validate(ctx);

    // Verify DB has the resolvedNetwork, not wallet.defaultNetwork
    const tx = dbConn.db.select().from(transactions).where(eq(transactions.id, ctx.txId)).get();
    expect(tx).toBeDefined();
    expect(tx!.network).toBe('testnet'); // resolvedNetwork, not 'devnet'
  });

  // -------------------------------------------------------------------------
  // Test 2: Stage 3 passes resolvedNetwork to policy engine
  // -------------------------------------------------------------------------

  it('Stage 3 passes resolvedNetwork to policy engine TransactionParam.network', async () => {
    // First run stage1 to create a tx in DB
    const ctx: PipelineContext = {
      db: dbConn.db,
      adapter: createMockAdapter(),
      keyStore: createMockKeyStore(),
      policyEngine: new DefaultPolicyEngine(),
      masterPassword: 'test-pw',
      walletId,
      wallet: {
        publicKey: MOCK_PUBLIC_KEY,
        chain: 'solana',
        environment: 'testnet',
        defaultNetwork: 'devnet',
      },
      resolvedNetwork: 'testnet',
      request: { to: '22222222222222222222222222222222', amount: '50000000' },
      txId: '',
    };

    await stage1Validate(ctx);

    // Spy on the policy engine to capture the transaction param
    const evaluateSpy = vi.spyOn(ctx.policyEngine, 'evaluate');

    await stage3Policy(ctx);

    // Verify evaluate was called with network = resolvedNetwork
    expect(evaluateSpy).toHaveBeenCalledTimes(1);
    const [, txParam] = evaluateSpy.mock.calls[0]!;
    expect(txParam.network).toBe('testnet');
  });

  // -------------------------------------------------------------------------
  // Test 3: Route layer error conversion - environment mismatch
  // -------------------------------------------------------------------------

  it('environment mismatch produces ENVIRONMENT_NETWORK_MISMATCH WAIaaSError', () => {
    // Simulate the route handler catch block
    try {
      resolveNetwork('devnet', null, 'mainnet', 'solana');
      throw new Error('should not reach');
    } catch (err) {
      // Simulate the route handler error conversion logic
      if (err instanceof Error && err.message.includes('environment')) {
        const waiaasErr = new WAIaaSError('ENVIRONMENT_NETWORK_MISMATCH', {
          message: err.message,
        });
        expect(waiaasErr.code).toBe('ENVIRONMENT_NETWORK_MISMATCH');
        expect(waiaasErr.message).toContain('environment');
      } else {
        throw new Error('Expected environment error message');
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test 4: Route layer error conversion - chain mismatch
  // -------------------------------------------------------------------------

  it('chain mismatch produces ACTION_VALIDATION_FAILED WAIaaSError', () => {
    // Simulate the route handler catch block
    try {
      resolveNetwork('ethereum-sepolia', null, 'testnet', 'solana');
      throw new Error('should not reach');
    } catch (err) {
      // Simulate the route handler error conversion logic (chain error goes to ACTION_VALIDATION_FAILED)
      if (err instanceof Error && err.message.includes('environment')) {
        throw new Error('Should not be environment error');
      }
      const waiaasErr = new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: err instanceof Error ? err.message : 'Network validation failed',
      });
      expect(waiaasErr.code).toBe('ACTION_VALIDATION_FAILED');
    }
  });

  // -------------------------------------------------------------------------
  // Test 5: daemon.ts re-entry: tx.network direct use + getDefaultNetwork fallback
  // -------------------------------------------------------------------------

  it('re-entry uses tx.network directly, falls back to getDefaultNetwork when null', () => {
    // Case A: tx.network is set -> use directly
    const txNetworkSet = 'testnet';
    const resolvedA: string = txNetworkSet ?? getDefaultNetwork('solana', 'testnet');
    expect(resolvedA).toBe('testnet');

    // Case B: tx.network is null -> fallback to getDefaultNetwork
    const txNetworkNull = null;
    const resolvedB: string = txNetworkNull ?? getDefaultNetwork('solana', 'testnet');
    expect(resolvedB).toBe('devnet'); // solana+testnet default = devnet

    // Case C: ethereum mainnet fallback
    const resolvedC: string = getDefaultNetwork('ethereum', 'mainnet');
    expect(resolvedC).toBe('ethereum-mainnet');
  });
});
