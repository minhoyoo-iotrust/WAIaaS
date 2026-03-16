/**
 * Unit tests for stageGasCondition: Pipeline Stage 3.5 gas condition check.
 *
 * Features tested:
 * 1. No gasCondition field -> no-op (backward compat)
 * 2. gasCondition present -> GAS_WAITING transition + PIPELINE_HALTED
 * 3. gasCondition present but gas_condition.enabled = false -> no-op
 * 4. max_pending_count limit enforcement
 * 5. bridgeMetadata stored with correct fields
 * 6. TX_GAS_WAITING notification emitted
 * 7. timeout resolution (request > settings default > hardcoded)
 * 8. timeout clamped to max_timeout_sec
 *
 * Uses in-memory SQLite + Drizzle + pushSchema pattern.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import { stageGasCondition } from '../pipeline/stages.js';
import type { PipelineContext } from '../pipeline/stages.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import { WAIaaSError } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;

const MOCK_PUBLIC_KEY = '11111111111111111111111111111112';

function createMockAdapter() {
  return {
    chain: 'solana' as const,
    network: 'devnet' as const,
    connect: async () => {},
    disconnect: async () => {},
    isConnected: () => true,
    getHealth: async () => ({ healthy: true, latencyMs: 1 }),
    getBalance: async (addr: string) => ({
      address: addr, balance: 1_000_000_000n, decimals: 9, symbol: 'SOL',
    }),
    buildTransaction: async () => ({
      chain: 'solana', serialized: new Uint8Array(128), estimatedFee: 5000n, metadata: {},
    }),
    simulateTransaction: async () => ({ success: true, logs: [] }),
    signTransaction: async () => new Uint8Array(256),
    submitTransaction: async () => ({ txHash: 'mock-hash', status: 'submitted' as const }),
    waitForConfirmation: async (txHash: string) => ({
      txHash, status: 'confirmed' as const, confirmations: 1,
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
  } as any;
}

function createMockKeyStore() {
  return {
    generateKeyPair: async () => ({
      publicKey: MOCK_PUBLIC_KEY,
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

async function insertTestWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'ethereum',
    environment: 'testnet',
    publicKey: MOCK_PUBLIC_KEY + '-' + id.slice(0, 8),
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertTransaction(
  walletId: string,
  overrides: { status?: string } = {},
): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(transactions).values({
    id,
    walletId,
    chain: 'ethereum',
    type: 'TRANSFER',
    status: overrides.status ?? 'PENDING',
    amount: '1000000000',
    toAddress: '0x1234567890123456789012345678901234567890',
    createdAt: now,
  });
  return id;
}

function createPipelineContext(
  walletId: string,
  txId: string,
  overrides: Partial<PipelineContext> = {},
): PipelineContext {
  return {
    db: conn.db,
    adapter: createMockAdapter(),
    keyStore: createMockKeyStore(),
    policyEngine: new DefaultPolicyEngine(),
    masterPassword: 'test-master',
    walletId,
    wallet: { publicKey: MOCK_PUBLIC_KEY, chain: 'ethereum', environment: 'testnet' },
    resolvedNetwork: 'ethereum-sepolia',
    request: {
      type: 'TRANSFER' as const,
      to: '0x1234567890123456789012345678901234567890',
      amount: '1000000000',
    },
    txId,
    ...overrides,
  } as PipelineContext;
}

/** Create a mock SettingsService that returns values from a map. */
function createMockSettingsService(values: Record<string, string> = {}) {
  return {
    get: (key: string) => {
      if (key in values) return values[key];
      throw new Error(`Unknown setting key: ${key}`);
    },
    set: () => {},
    getAll: () => [],
    getAllMasked: () => [],
  } as any;
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
// Tests
// ---------------------------------------------------------------------------

describe('stageGasCondition', () => {
  describe('no-op when gasCondition absent', () => {
    it('passes through when request has no gasCondition (legacy SendTransactionRequest)', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: { to: '0xAddr', amount: '100' } as any,
      });

      // Should not throw
      await stageGasCondition(ctx);

      // Transaction status should remain PENDING (unchanged)
      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      expect(tx!.status).toBe('PENDING');
    });

    it('passes through when 5-type request has no gasCondition', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId);

      // Should not throw
      await stageGasCondition(ctx);

      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      expect(tx!.status).toBe('PENDING');
    });
  });

  describe('GAS_WAITING transition when gasCondition present', () => {
    it('transitions to GAS_WAITING and throws PIPELINE_HALTED', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000' },
        } as any,
      });

      try {
        await stageGasCondition(ctx);
        expect.unreachable('stageGasCondition should throw PIPELINE_HALTED');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        expect((err as WAIaaSError).code).toBe('PIPELINE_HALTED');
      }

      // Transaction status should be GAS_WAITING
      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      expect(tx!.status).toBe('GAS_WAITING');
    });

    it('stores gasCondition metadata in bridgeMetadata', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000', maxPriorityFee: '2000000000' },
        } as any,
      });

      try {
        await stageGasCondition(ctx);
      } catch { /* PIPELINE_HALTED expected */ }

      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      expect(tx!.bridgeMetadata).toBeDefined();
      const metadata = JSON.parse(tx!.bridgeMetadata!);
      expect(metadata.tracker).toBe('gas-condition');
      expect(metadata.gasCondition.maxGasPrice).toBe('50000000000');
      expect(metadata.gasCondition.maxPriorityFee).toBe('2000000000');
      expect(metadata.chain).toBe('ethereum');
      expect(metadata.network).toBe('ethereum-sepolia');
      expect(metadata.gasConditionCreatedAt).toBeTypeOf('number');
    });

    it('uses default timeout of 3600 when not specified', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000' },
        } as any,
      });

      try {
        await stageGasCondition(ctx);
      } catch { /* PIPELINE_HALTED expected */ }

      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      const metadata = JSON.parse(tx!.bridgeMetadata!);
      expect(metadata.gasCondition.timeout).toBe(3600);
    });

    it('uses request timeout when specified', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000', timeout: 1800 },
        } as any,
      });

      try {
        await stageGasCondition(ctx);
      } catch { /* PIPELINE_HALTED expected */ }

      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      const metadata = JSON.parse(tx!.bridgeMetadata!);
      expect(metadata.gasCondition.timeout).toBe(1800);
    });
  });

  describe('gas_condition.enabled setting', () => {
    it('passes through when gas_condition.enabled is false', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000' },
        } as any,
        settingsService: createMockSettingsService({
          'gas_condition.enabled': 'false',
        }),
      });

      // Should not throw
      await stageGasCondition(ctx);

      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      expect(tx!.status).toBe('PENDING');
    });

    it('defaults to enabled when setting key not registered', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000' },
        } as any,
        settingsService: createMockSettingsService({}), // no gas_condition keys registered
      });

      try {
        await stageGasCondition(ctx);
        expect.unreachable('Should throw PIPELINE_HALTED');
      } catch (err) {
        expect((err as WAIaaSError).code).toBe('PIPELINE_HALTED');
      }
    });
  });

  describe('max_pending_count limit', () => {
    it('rejects when max_pending_count reached', async () => {
      const walletId = await insertTestWallet();

      // Insert 3 GAS_WAITING transactions
      await insertTransaction(walletId, { status: 'GAS_WAITING' });
      await insertTransaction(walletId, { status: 'GAS_WAITING' });
      await insertTransaction(walletId, { status: 'GAS_WAITING' });

      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000' },
        } as any,
        settingsService: createMockSettingsService({
          'gas_condition.enabled': 'true',
          'gas_condition.max_pending_count': '3',
        }),
      });

      try {
        await stageGasCondition(ctx);
        expect.unreachable('Should throw validation error');
      } catch (err) {
        expect(err).toBeInstanceOf(WAIaaSError);
        expect((err as WAIaaSError).code).toBe('ACTION_VALIDATION_FAILED');
        expect((err as WAIaaSError).message).toContain('pending limit reached');
      }

      // Transaction should remain PENDING (not GAS_WAITING)
      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      expect(tx!.status).toBe('PENDING');
    });

    it('allows when under max_pending_count', async () => {
      const walletId = await insertTestWallet();

      // Insert 2 GAS_WAITING (under limit of 3)
      await insertTransaction(walletId, { status: 'GAS_WAITING' });
      await insertTransaction(walletId, { status: 'GAS_WAITING' });

      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000' },
        } as any,
        settingsService: createMockSettingsService({
          'gas_condition.enabled': 'true',
          'gas_condition.max_pending_count': '3',
        }),
      });

      try {
        await stageGasCondition(ctx);
        expect.unreachable('Should throw PIPELINE_HALTED');
      } catch (err) {
        expect((err as WAIaaSError).code).toBe('PIPELINE_HALTED');
      }

      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      expect(tx!.status).toBe('GAS_WAITING');
    });
  });

  describe('timeout resolution', () => {
    it('uses settings default_timeout_sec when request timeout not specified', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000' },
        } as any,
        settingsService: createMockSettingsService({
          'gas_condition.enabled': 'true',
          'gas_condition.default_timeout_sec': '7200',
          'gas_condition.max_timeout_sec': '86400',
          'gas_condition.max_pending_count': '100',
        }),
      });

      try {
        await stageGasCondition(ctx);
      } catch { /* PIPELINE_HALTED expected */ }

      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      const metadata = JSON.parse(tx!.bridgeMetadata!);
      expect(metadata.gasCondition.timeout).toBe(7200);
    });

    it('clamps request timeout to max_timeout_sec', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000', timeout: 86400 },
        } as any,
        settingsService: createMockSettingsService({
          'gas_condition.enabled': 'true',
          'gas_condition.max_timeout_sec': '3600',
          'gas_condition.max_pending_count': '100',
        }),
      });

      try {
        await stageGasCondition(ctx);
      } catch { /* PIPELINE_HALTED expected */ }

      const tx = await conn.db.select().from(transactions).where(eq(transactions.id, txId)).get();
      const metadata = JSON.parse(tx!.bridgeMetadata!);
      expect(metadata.gasCondition.timeout).toBe(3600);
    });
  });

  describe('notification emission', () => {
    it('emits TX_GAS_WAITING notification', async () => {
      const walletId = await insertTestWallet();
      const txId = await insertTransaction(walletId);
      const notifyFn = vi.fn();
      const mockNotificationService = { notify: notifyFn } as any;

      const ctx = createPipelineContext(walletId, txId, {
        request: {
          type: 'TRANSFER' as const,
          to: '0xAddr',
          amount: '100',
          gasCondition: { maxGasPrice: '50000000000', maxPriorityFee: '2000000000' },
        } as any,
        notificationService: mockNotificationService,
      });

      try {
        await stageGasCondition(ctx);
      } catch { /* PIPELINE_HALTED expected */ }

      // Wait for fire-and-forget notification
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(notifyFn).toHaveBeenCalledTimes(1);
      expect(notifyFn).toHaveBeenCalledWith(
        'TX_GAS_WAITING',
        walletId,
        expect.objectContaining({
          txId,
          maxGasPrice: '50000000000',
          maxPriorityFee: '2000000000',
          chain: 'ethereum',
          network: 'ethereum-sepolia',
        }),
        { txId },
      );
    });
  });
});
