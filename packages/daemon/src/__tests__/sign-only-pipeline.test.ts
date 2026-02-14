/**
 * Unit tests for sign-only pipeline (executeSignOnly).
 *
 * Tests:
 * - Happy path: INSTANT tier NATIVE_TRANSFER -> signed
 * - Happy path: NOTIFY tier -> signed (NOTIFY is allowed for sign-only)
 * - Parse failure -> INVALID_TRANSACTION error
 * - Policy denied -> CANCELLED + POLICY_DENIED
 * - DELAY tier -> immediate rejection with clear message
 * - APPROVAL tier -> immediate rejection with clear message
 * - reserved_amount accumulation across multiple sign-only requests
 * - SIGNED status reservation included in evaluateAndReserve SUM
 * - Signing error -> key release (verify cleanup)
 * - Multi-op transaction -> evaluateBatch + manual reserved_amount
 *
 * Uses in-memory SQLite + Drizzle, MockAdapter, MockKeyStore,
 * DatabasePolicyEngine with real evaluateAndReserve.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, transactions, policies } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { executeSignOnly, mapOperationToParam } from '../pipeline/sign-only.js';
import type { SignOnlyDeps, SignOnlyRequest } from '../pipeline/sign-only.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import type {
  IChainAdapter,
  ParsedTransaction,
  SignedTransaction,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
} from '@waiaas/core';
import { WAIaaSError, ChainError } from '@waiaas/core';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const MOCK_PRIVATE_KEY = new Uint8Array(64).fill(42);

const DEFAULT_PARSED_TX: ParsedTransaction = {
  operations: [
    {
      type: 'NATIVE_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: 1_000_000_000n, // 1 SOL
    },
  ],
  rawTx: 'base64encodedtx',
};

const DEFAULT_SIGNED_TX: SignedTransaction = {
  signedTransaction: 'signed-base64-tx',
  txHash: 'mock-tx-hash-123',
};

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
    estimateFee: async () => {
      throw new Error('not implemented');
    },
    buildTokenTransfer: async () => {
      throw new Error('not implemented');
    },
    getTokenInfo: async () => {
      throw new Error('not implemented');
    },
    buildContractCall: async () => {
      throw new Error('not implemented');
    },
    buildApprove: async () => {
      throw new Error('not implemented');
    },
    buildBatch: async () => {
      throw new Error('not implemented');
    },
    getTransactionFee: async () => {
      throw new Error('not implemented');
    },
    getCurrentNonce: async () => 0,
    sweepAll: async () => {
      throw new Error('not implemented');
    },
    parseTransaction: async (): Promise<ParsedTransaction> => DEFAULT_PARSED_TX,
    signExternalTransaction: async (): Promise<SignedTransaction> => DEFAULT_SIGNED_TX,
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;
let walletId: string;
let policyEngine: DatabasePolicyEngine;

async function insertTestWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'devnet',
    publicKey: '11111111111111111111111111111112',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertPolicy(overrides: {
  walletId?: string | null;
  type: string;
  rules: string;
  priority?: number;
  enabled?: boolean;
}): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id,
    walletId: overrides.walletId ?? null,
    type: overrides.type,
    rules: overrides.rules,
    priority: overrides.priority ?? 0,
    enabled: overrides.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

function createDeps(overrides: Partial<SignOnlyDeps> = {}): SignOnlyDeps {
  return {
    db: conn.db,
    sqlite: conn.sqlite,
    adapter: createMockAdapter(),
    keyStore: createMockKeyStore(),
    policyEngine,
    masterPassword: 'test-master-password',
    ...overrides,
  };
}

function createRequest(overrides: Partial<SignOnlyRequest> = {}): SignOnlyRequest {
  return {
    transaction: 'base64encodedtx',
    chain: 'solana',
    network: 'devnet',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
  policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
  walletId = await insertTestWallet();
});

afterEach(() => {
  conn.sqlite.close();
});

// ---------------------------------------------------------------------------
// mapOperationToParam tests
// ---------------------------------------------------------------------------

describe('mapOperationToParam', () => {
  it('should map NATIVE_TRANSFER to TRANSFER', () => {
    const result = mapOperationToParam(
      { type: 'NATIVE_TRANSFER', to: 'addr1', amount: 1000n },
      'solana',
      'devnet',
    );
    expect(result.type).toBe('TRANSFER');
    expect(result.amount).toBe('1000');
    expect(result.toAddress).toBe('addr1');
    expect(result.chain).toBe('solana');
    expect(result.network).toBe('devnet');
  });

  it('should map TOKEN_TRANSFER with tokenAddress', () => {
    const result = mapOperationToParam(
      { type: 'TOKEN_TRANSFER', to: 'addr1', amount: 500n, token: 'TokenMint123' },
      'solana',
      'devnet',
    );
    expect(result.type).toBe('TOKEN_TRANSFER');
    expect(result.tokenAddress).toBe('TokenMint123');
  });

  it('should map CONTRACT_CALL with programId', () => {
    const result = mapOperationToParam(
      { type: 'CONTRACT_CALL', programId: 'Prog111', method: '0x12345678' },
      'ethereum',
    );
    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.contractAddress).toBe('Prog111');
    expect(result.selector).toBe('0x12345678');
    expect(result.amount).toBe('0');
  });

  it('should map APPROVE with spenderAddress', () => {
    const result = mapOperationToParam(
      { type: 'APPROVE', to: 'spender1', amount: 100n },
      'ethereum',
    );
    expect(result.type).toBe('APPROVE');
    expect(result.spenderAddress).toBe('spender1');
    expect(result.approveAmount).toBe('100');
  });

  it('should map UNKNOWN to CONTRACT_CALL', () => {
    const result = mapOperationToParam(
      { type: 'UNKNOWN', programId: 'UnknownProg', method: '0xabcdef' },
      'solana',
    );
    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.contractAddress).toBe('UnknownProg');
  });
});

// ---------------------------------------------------------------------------
// executeSignOnly tests
// ---------------------------------------------------------------------------

describe('executeSignOnly', () => {
  // Test 1: Happy path INSTANT tier NATIVE_TRANSFER
  it('should sign and return result for INSTANT tier NATIVE_TRANSFER', async () => {
    // SPENDING_LIMIT: 1 SOL instant, 10 SOL notify, 50 SOL delay
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '2000000000', // 2 SOL
        notify_max: '10000000000',
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const deps = createDeps();
    const result = await executeSignOnly(deps, walletId, createRequest());

    expect(result.id).toBeTruthy();
    expect(result.signedTransaction).toBe('signed-base64-tx');
    expect(result.txHash).toBe('mock-tx-hash-123');
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]!.type).toBe('NATIVE_TRANSFER');
    expect(result.operations[0]!.to).toBe('Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');
    expect(result.operations[0]!.amount).toBe('1000000000');
    expect(result.policyResult.tier).toBe('INSTANT');

    // Verify DB record
    const txRow = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, result.id))
      .get();
    expect(txRow).toBeTruthy();
    expect(txRow!.type).toBe('SIGN');
    expect(txRow!.status).toBe('SIGNED');
    expect(txRow!.tier).toBe('INSTANT');
    expect(txRow!.executedAt).toBeTruthy();
  });

  // Test 2: Happy path NOTIFY tier
  it('should sign and return result for NOTIFY tier', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '500000000', // 0.5 SOL
        notify_max: '10000000000', // 10 SOL
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const deps = createDeps();
    const result = await executeSignOnly(deps, walletId, createRequest());

    expect(result.signedTransaction).toBe('signed-base64-tx');
    expect(result.policyResult.tier).toBe('NOTIFY');

    // Verify DB: status=SIGNED, tier=NOTIFY
    const txRow = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, result.id))
      .get();
    expect(txRow!.status).toBe('SIGNED');
    expect(txRow!.tier).toBe('NOTIFY');
  });

  // Test 3: Parse failure -> INVALID_TRANSACTION error
  it('should throw INVALID_TRANSACTION when parsing fails', async () => {
    const adapter = createMockAdapter({
      parseTransaction: async () => {
        throw new Error('Cannot decode transaction bytes');
      },
    });

    const deps = createDeps({ adapter });
    await expect(
      executeSignOnly(deps, walletId, createRequest()),
    ).rejects.toThrow(WAIaaSError);

    try {
      await executeSignOnly(deps, walletId, createRequest());
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('INVALID_TRANSACTION');
      expect((err as WAIaaSError).message).toContain('Cannot decode transaction bytes');
    }
  });

  // Test 4: Policy denied -> CANCELLED + POLICY_DENIED
  it('should deny and cancel when WHITELIST policy rejects', async () => {
    await insertPolicy({
      type: 'WHITELIST',
      rules: JSON.stringify({
        allowed_addresses: ['AllowedAddress111'],
      }),
      priority: 10,
    });

    const deps = createDeps();
    await expect(
      executeSignOnly(deps, walletId, createRequest()),
    ).rejects.toThrow(WAIaaSError);

    try {
      await executeSignOnly(deps, walletId, createRequest());
    } catch (err) {
      expect((err as WAIaaSError).code).toBe('POLICY_DENIED');
    }

    // Verify DB: at least one transaction is CANCELLED
    const txRows = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.walletId, walletId))
      .all();
    const cancelledRows = txRows.filter((r) => r.status === 'CANCELLED');
    expect(cancelledRows.length).toBeGreaterThan(0);
    expect(cancelledRows[0]!.error).toContain('not in whitelist');
  });

  // Test 5: DELAY tier rejection
  it('should immediately reject DELAY tier with clear message', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000', // very low
        notify_max: '200000', // very low
        delay_max: '50000000000', // 50 SOL
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const deps = createDeps();
    try {
      await executeSignOnly(deps, walletId, createRequest());
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('POLICY_DENIED');
      expect((err as WAIaaSError).message).toContain('DELAY tier');
      expect((err as WAIaaSError).message).toContain('/v1/transactions/send');
    }

    // Verify DB: status=CANCELLED, tier=DELAY
    const txRows = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.walletId, walletId))
      .all();
    const cancelledRow = txRows.find((r) => r.status === 'CANCELLED');
    expect(cancelledRow).toBeTruthy();
    expect(cancelledRow!.tier).toBe('DELAY');
  });

  // Test 6: APPROVAL tier rejection
  it('should immediately reject APPROVAL tier with clear message', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '100000',
        notify_max: '200000',
        delay_max: '300000', // all very low
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const deps = createDeps();
    try {
      await executeSignOnly(deps, walletId, createRequest());
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(WAIaaSError);
      expect((err as WAIaaSError).code).toBe('POLICY_DENIED');
      expect((err as WAIaaSError).message).toContain('APPROVAL tier');
      expect((err as WAIaaSError).message).toContain('/v1/transactions/send');
    }

    // Verify DB: status=CANCELLED, tier=APPROVAL
    const txRows = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.walletId, walletId))
      .all();
    const cancelledRow = txRows.find((r) => r.status === 'CANCELLED');
    expect(cancelledRow).toBeTruthy();
    expect(cancelledRow!.tier).toBe('APPROVAL');
  });

  // Test 7: reserved_amount accumulation
  it('should accumulate reserved_amount across multiple sign-only requests', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000000000', // 10 SOL
        notify_max: '50000000000',
        delay_max: '100000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // First sign: 1 SOL (1_000_000_000)
    const adapter1 = createMockAdapter({
      parseTransaction: async (): Promise<ParsedTransaction> => ({
        operations: [
          { type: 'NATIVE_TRANSFER', to: 'addr1', amount: 5_000_000_000n },
        ],
        rawTx: 'tx1',
      }),
    });

    const deps1 = createDeps({ adapter: adapter1 });
    const result1 = await executeSignOnly(deps1, walletId, createRequest());
    expect(result1.policyResult.tier).toBe('INSTANT');

    // Second sign: another 5 SOL -> total reserved = 10 SOL
    const adapter2 = createMockAdapter({
      parseTransaction: async (): Promise<ParsedTransaction> => ({
        operations: [
          { type: 'NATIVE_TRANSFER', to: 'addr2', amount: 3_000_000_000n },
        ],
        rawTx: 'tx2',
      }),
    });

    const deps2 = createDeps({ adapter: adapter2 });
    const result2 = await executeSignOnly(deps2, walletId, createRequest());
    expect(result2.policyResult.tier).toBe('INSTANT');

    // Verify both transactions have reserved_amount set
    const txRows = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.walletId, walletId))
      .all();
    const signedRows = txRows.filter((r) => r.status === 'SIGNED');
    expect(signedRows).toHaveLength(2);

    // Both should have reserved_amount set
    const reservedAmounts = signedRows.map((r) => BigInt(r.reservedAmount ?? '0'));
    expect(reservedAmounts).toContain(5_000_000_000n);
    expect(reservedAmounts).toContain(3_000_000_000n);
  });

  // Test 8: SIGNED status reservation included in evaluateAndReserve SUM
  it('should include SIGNED status in reservation SUM query', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '5000000000', // 5 SOL instant
        notify_max: '10000000000', // 10 SOL notify
        delay_max: '50000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    // First sign: 4 SOL -> INSTANT
    const adapter1 = createMockAdapter({
      parseTransaction: async (): Promise<ParsedTransaction> => ({
        operations: [
          { type: 'NATIVE_TRANSFER', to: 'addr1', amount: 4_000_000_000n },
        ],
        rawTx: 'tx1',
      }),
    });

    const deps1 = createDeps({ adapter: adapter1 });
    const result1 = await executeSignOnly(deps1, walletId, createRequest());
    expect(result1.policyResult.tier).toBe('INSTANT');

    // Second sign: 3 SOL -> effective = 4 + 3 = 7 SOL -> should be NOTIFY (above 5 SOL instant)
    const adapter2 = createMockAdapter({
      parseTransaction: async (): Promise<ParsedTransaction> => ({
        operations: [
          { type: 'NATIVE_TRANSFER', to: 'addr2', amount: 3_000_000_000n },
        ],
        rawTx: 'tx2',
      }),
    });

    const deps2 = createDeps({ adapter: adapter2 });
    const result2 = await executeSignOnly(deps2, walletId, createRequest());
    // 4 SOL (SIGNED reserved) + 3 SOL = 7 SOL > 5 SOL instant_max -> NOTIFY
    expect(result2.policyResult.tier).toBe('NOTIFY');
  });

  // Test 9: Signing error -> key release
  it('should release key even when signing fails', async () => {
    const releaseKey = vi.fn();
    const keyStore = createMockKeyStore({ releaseKey });

    const adapter = createMockAdapter({
      signExternalTransaction: async () => {
        throw new ChainError('SIGNING_FAILED', 'PERMANENT', 'Signing operation failed');
      },
    });

    const deps = createDeps({ adapter, keyStore });

    await expect(
      executeSignOnly(deps, walletId, createRequest()),
    ).rejects.toThrow();

    // Verify releaseKey was called (cleanup in finally block)
    expect(releaseKey).toHaveBeenCalled();

    // Verify DB: status=FAILED
    const txRows = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.walletId, walletId))
      .all();
    const failedRow = txRows.find((r) => r.status === 'FAILED');
    expect(failedRow).toBeTruthy();
  });

  // Test 10: Multi-op transaction
  it('should handle multi-operation transaction with evaluateBatch', async () => {
    await insertPolicy({
      type: 'SPENDING_LIMIT',
      rules: JSON.stringify({
        instant_max: '10000000000', // 10 SOL
        notify_max: '50000000000',
        delay_max: '100000000000',
        delay_seconds: 300,
      }),
      priority: 10,
    });

    const multiOpParsed: ParsedTransaction = {
      operations: [
        { type: 'NATIVE_TRANSFER', to: 'addr1', amount: 2_000_000_000n },
        { type: 'NATIVE_TRANSFER', to: 'addr2', amount: 3_000_000_000n },
      ],
      rawTx: 'multi-op-tx',
    };

    const adapter = createMockAdapter({
      parseTransaction: async () => multiOpParsed,
    });

    const deps = createDeps({ adapter });
    const result = await executeSignOnly(deps, walletId, createRequest());

    expect(result.operations).toHaveLength(2);
    expect(result.operations[0]!.type).toBe('NATIVE_TRANSFER');
    expect(result.operations[1]!.type).toBe('NATIVE_TRANSFER');
    expect(result.policyResult.tier).toBe('INSTANT');

    // Verify DB: SIGNED + reserved_amount set (sum of native amounts)
    const txRow = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, result.id))
      .get();
    expect(txRow!.status).toBe('SIGNED');
    expect(txRow!.type).toBe('SIGN');
    // reserved_amount = 2 SOL + 3 SOL = 5 SOL
    expect(txRow!.reservedAmount).toBe('5000000000');
  });

  // Test 11: No policies -> INSTANT passthrough
  it('should pass through with INSTANT when no policies exist', async () => {
    const deps = createDeps();
    const result = await executeSignOnly(deps, walletId, createRequest());

    expect(result.signedTransaction).toBe('signed-base64-tx');
    expect(result.policyResult.tier).toBe('INSTANT');

    const txRow = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, result.id))
      .get();
    expect(txRow!.status).toBe('SIGNED');
  });

  // Test 12: SignOnlyResult.txHash is optional (may be undefined)
  it('should handle undefined txHash from signExternalTransaction', async () => {
    const adapter = createMockAdapter({
      signExternalTransaction: async (): Promise<SignedTransaction> => ({
        signedTransaction: 'signed-no-hash',
        // txHash omitted (undefined)
      }),
    });

    const deps = createDeps({ adapter });
    const result = await executeSignOnly(deps, walletId, createRequest());

    expect(result.signedTransaction).toBe('signed-no-hash');
    expect(result.txHash).toBeUndefined();
  });
});
