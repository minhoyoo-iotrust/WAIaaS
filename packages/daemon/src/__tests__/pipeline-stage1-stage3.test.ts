/**
 * TDD tests for Stage 1 discriminatedUnion 5-type parsing
 * and Stage 3 type-based policy filtering.
 *
 * Tests that:
 * - Stage 1 correctly parses all 5 transaction types and INSERTs with correct type
 * - Stage 1 maintains backward compat for legacy SendTransactionRequest (no type field)
 * - Stage 1 rejects invalid types and missing required fields
 * - Stage 3 routes to correct policy evaluators based on transaction type
 * - Stage 3 delegates BATCH to evaluateBatch 2-stage policy
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { agents, transactions, policies } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import {
  stage1Validate,
  stage3Policy,
} from '../pipeline/stages.js';
import type { PipelineContext } from '../pipeline/stages.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { DefaultPolicyEngine } from '../pipeline/default-policy-engine.js';
import type {
  IChainAdapter,
  IPolicyEngine,
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  SendTransactionRequest,
  TransactionRequest,
  TransferRequestInput,
  TokenTransferRequest,
  ContractCallRequest,
  ApproveRequest,
  BatchRequest,
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

async function insertTestAgent(conn: DatabaseConnection): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(agents).values({
    id,
    name: 'test-agent',
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
  agentId: string,
  overrides: Partial<PipelineContext> = {},
): PipelineContext {
  return {
    db: conn.db,
    adapter: createMockAdapter(),
    keyStore: createMockKeyStore(),
    policyEngine: new DefaultPolicyEngine(),
    masterPassword: 'test-master',
    agentId,
    agent: { publicKey: MOCK_PUBLIC_KEY, chain: 'solana', network: 'devnet' },
    request: { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '1000000000' },
    txId: '',
    ...overrides,
  };
}

// Helper: insert a policy into the DB
async function insertPolicy(
  conn: DatabaseConnection,
  agentId: string | null,
  type: string,
  rules: Record<string, unknown>,
  priority: number = 100,
): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id,
    agentId,
    type,
    rules: JSON.stringify(rules),
    priority,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
  return id;
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
// Stage 1: discriminatedUnion 5-type parsing (8 tests)
// ===========================================================================

describe('Stage 1: discriminatedUnion 5-type parsing', () => {
  it('should parse TRANSFER type and INSERT type=TRANSFER', async () => {
    const agentId = await insertTestAgent(conn);
    const request: TransferRequestInput = {
      type: 'TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
    });

    await stage1Validate(ctx);

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx).toBeTruthy();
    expect(tx!.type).toBe('TRANSFER');
    expect(tx!.status).toBe('PENDING');
    expect(tx!.amount).toBe('1000000000');
  });

  it('should parse TOKEN_TRANSFER type and INSERT type=TOKEN_TRANSFER', async () => {
    const agentId = await insertTestAgent(conn);
    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
    };
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
    });

    await stage1Validate(ctx);

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx).toBeTruthy();
    expect(tx!.type).toBe('TOKEN_TRANSFER');
  });

  it('should parse CONTRACT_CALL type and INSERT type=CONTRACT_CALL', async () => {
    const agentId = await insertTestAgent(conn);
    const request: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      calldata: '0xa9059cbb0000000000000000',
    };
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
    });

    await stage1Validate(ctx);

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx).toBeTruthy();
    expect(tx!.type).toBe('CONTRACT_CALL');
  });

  it('should parse APPROVE type and INSERT type=APPROVE', async () => {
    const agentId = await insertTestAgent(conn);
    const request: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xabcdef1234567890abcdef1234567890abcdef12',
      token: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, symbol: 'USDC' },
      amount: '1000000',
    };
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
    });

    await stage1Validate(ctx);

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx).toBeTruthy();
    expect(tx!.type).toBe('APPROVE');
  });

  it('should parse BATCH type and INSERT type=BATCH', async () => {
    const agentId = await insertTestAgent(conn);
    const request: BatchRequest = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000' },
        { to: 'addr2', amount: '2000000' },
      ],
    };
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
    });

    await stage1Validate(ctx);

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx).toBeTruthy();
    expect(tx!.type).toBe('BATCH');
  });

  it('should maintain backward compat: no type field defaults to TRANSFER', async () => {
    const agentId = await insertTestAgent(conn);
    // Legacy request with no type field
    const request: SendTransactionRequest = {
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };
    const ctx = createPipelineContext(conn, agentId, { request });

    await stage1Validate(ctx);

    const tx = await conn.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ctx.txId))
      .get();
    expect(tx).toBeTruthy();
    expect(tx!.type).toBe('TRANSFER');
  });

  it('should reject invalid type value', async () => {
    const agentId = await insertTestAgent(conn);
    const request = {
      type: 'INVALID',
      to: 'addr1',
      amount: '1000',
    };
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
    });

    await expect(stage1Validate(ctx)).rejects.toThrow();
  });

  it('should reject TOKEN_TRANSFER with missing token object', async () => {
    const agentId = await insertTestAgent(conn);
    const request = {
      type: 'TOKEN_TRANSFER',
      to: 'addr1',
      amount: '1000',
      // missing token
    };
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
    });

    await expect(stage1Validate(ctx)).rejects.toThrow();
  });
});

// ===========================================================================
// Stage 3: type-based policy filtering (8 tests)
// ===========================================================================

describe('Stage 3: type-based policy filtering', () => {
  it('should apply ALLOWED_TOKENS for TOKEN_TRANSFER and allow whitelisted token', async () => {
    const agentId = await insertTestAgent(conn);

    // Set up ALLOWED_TOKENS policy
    await insertPolicy(conn, agentId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
    });
    // Set up SPENDING_LIMIT so we don't hit passthrough
    await insertPolicy(conn, agentId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    // Stage 3 should pass -- ALLOWED_TOKENS check passes, token is whitelisted
    await stage3Policy(ctx);

    expect(ctx.tier).toBe('INSTANT');
  });

  it('should apply ALLOWED_TOKENS for TOKEN_TRANSFER and deny non-whitelisted token', async () => {
    const agentId = await insertTestAgent(conn);

    // Set up ALLOWED_TOKENS policy (different token)
    await insertPolicy(conn, agentId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'SomeOtherMint' }],
    });
    await insertPolicy(conn, agentId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    // Stage 3 should deny -- token not in ALLOWED_TOKENS
    await expect(stage3Policy(ctx)).rejects.toThrow(/policy/i);
  });

  it('should apply CONTRACT_WHITELIST for CONTRACT_CALL and allow whitelisted contract', async () => {
    const agentId = await insertTestAgent(conn);

    await insertPolicy(conn, agentId, 'CONTRACT_WHITELIST', {
      contracts: [{ address: '0x1234567890abcdef1234567890abcdef12345678' }],
    });
    await insertPolicy(conn, agentId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      calldata: '0xa9059cbb0000000000000000',
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    expect(ctx.tier).toBe('INSTANT');
  });

  it('should apply APPROVED_SPENDERS for APPROVE and deny unapproved spender', async () => {
    const agentId = await insertTestAgent(conn);

    await insertPolicy(conn, agentId, 'APPROVED_SPENDERS', {
      spenders: [{ address: '0xDifferentSpender' }],
    });
    await insertPolicy(conn, agentId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xabcdef1234567890abcdef1234567890abcdef12',
      token: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, symbol: 'USDC' },
      amount: '1000000',
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    // Stage 3 should deny -- spender not in APPROVED_SPENDERS
    await expect(stage3Policy(ctx)).rejects.toThrow(/policy/i);
  });

  it('should use evaluateBatch for BATCH type requests', async () => {
    const agentId = await insertTestAgent(conn);

    // Set up policies for batch evaluation
    await insertPolicy(conn, agentId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: BatchRequest = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000' },
        { to: 'addr2', amount: '2000000' },
      ],
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    // Spy on evaluateBatch to verify it gets called
    const evaluateBatchSpy = vi.spyOn(policyEngine, 'evaluateBatch');

    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // evaluateBatch should be called for BATCH type, not evaluate
    expect(evaluateBatchSpy).toHaveBeenCalled();
    expect(ctx.tier).toBe('INSTANT');
  });

  it('should apply only SPENDING_LIMIT + WHITELIST for plain TRANSFER (no type-specific policies)', async () => {
    const agentId = await insertTestAgent(conn);

    await insertPolicy(conn, agentId, 'SPENDING_LIMIT', {
      instant_max: '500000000',
      notify_max: '1000000000',
      delay_max: '5000000000',
      delay_seconds: 60,
    });
    await insertPolicy(conn, agentId, 'WHITELIST', {
      allowed_addresses: ['Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'],
    });

    const request: TransferRequestInput = {
      type: 'TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // Amount 1B > instant_max (500M), <= notify_max (1B) -> NOTIFY tier
    expect(ctx.tier).toBe('NOTIFY');
  });

  it('should pass correct TransactionParam with tokenAddress for TOKEN_TRANSFER', async () => {
    const agentId = await insertTestAgent(conn);

    // Set up policy that checks tokenAddress
    await insertPolicy(conn, agentId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
    });
    await insertPolicy(conn, agentId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    // Spy on evaluate to check the TransactionParam passed
    const evaluateSpy = vi.spyOn(policyEngine, 'evaluateAndReserve');

    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // evaluateAndReserve should be called with tokenAddress in the TransactionParam
    expect(evaluateSpy).toHaveBeenCalled();
    const param = evaluateSpy.mock.calls[0]![1];
    expect(param.type).toBe('TOKEN_TRANSFER');
    expect(param.tokenAddress).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });

  it('should pass correct TransactionParam with contractAddress and selector for CONTRACT_CALL', async () => {
    const agentId = await insertTestAgent(conn);

    await insertPolicy(conn, agentId, 'CONTRACT_WHITELIST', {
      contracts: [{ address: '0x1234567890abcdef1234567890abcdef12345678' }],
    });
    await insertPolicy(conn, agentId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      calldata: '0xa9059cbb0000000000000000',
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const evaluateSpy = vi.spyOn(policyEngine, 'evaluateAndReserve');

    const ctx = createPipelineContext(conn, agentId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    expect(evaluateSpy).toHaveBeenCalled();
    const param = evaluateSpy.mock.calls[0]![1];
    expect(param.type).toBe('CONTRACT_CALL');
    expect(param.contractAddress).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(param.selector).toBe('0xa9059cbb');
  });
});
