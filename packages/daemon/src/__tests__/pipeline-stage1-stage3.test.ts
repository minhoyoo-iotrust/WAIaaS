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
import { wallets, transactions, policies } from '../infrastructure/database/schema.js';
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
  UnsignedTransaction,
  SimulationResult,
  SubmitResult,
  BalanceInfo,
  HealthInfo,
  SendTransactionRequest,
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
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'devnet',
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
    wallet: { publicKey: MOCK_PUBLIC_KEY, chain: 'solana', environment: 'testnet', defaultNetwork: 'devnet' },
    resolvedNetwork: 'devnet',
    request: { to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', amount: '1000000000' },
    txId: '',
    ...overrides,
  };
}

// Helper: insert a policy into the DB
async function insertPolicy(
  conn: DatabaseConnection,
  walletId: string | null,
  type: string,
  rules: Record<string, unknown>,
  priority: number = 100,
): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id,
    walletId,
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
    const walletId = await insertTestAgent(conn);
    const request: TransferRequestInput = {
      type: 'TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };
    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);
    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC' },
    };
    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);
    const request: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      calldata: '0xa9059cbb0000000000000000',
    };
    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);
    const request: ApproveRequest = {
      type: 'APPROVE',
      spender: '0xabcdef1234567890abcdef1234567890abcdef12',
      token: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, symbol: 'USDC' },
      amount: '1000000',
    };
    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);
    const request: BatchRequest = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000' },
        { to: 'addr2', amount: '2000000' },
      ],
    };
    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);
    // Legacy request with no type field
    const request: SendTransactionRequest = {
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };
    const ctx = createPipelineContext(conn, walletId, { request });

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
    const walletId = await insertTestAgent(conn);
    const request = {
      type: 'INVALID',
      to: 'addr1',
      amount: '1000',
    };
    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
    });

    await expect(stage1Validate(ctx)).rejects.toThrow();
  });

  it('should reject TOKEN_TRANSFER with missing token object', async () => {
    const walletId = await insertTestAgent(conn);
    const request = {
      type: 'TOKEN_TRANSFER',
      to: 'addr1',
      amount: '1000',
      // missing token
    };
    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);

    // Set up ALLOWED_TOKENS policy
    await insertPolicy(conn, walletId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
    });
    // Set up SPENDING_LIMIT so we don't hit passthrough
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
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
    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);

    // Set up ALLOWED_TOKENS policy (different token)
    await insertPolicy(conn, walletId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'SomeOtherMint' }],
    });
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
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
    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    // Stage 3 should deny -- token not in ALLOWED_TOKENS
    await expect(stage3Policy(ctx)).rejects.toThrow(/not in allowed list/i);
  });

  it('should apply CONTRACT_WHITELIST for CONTRACT_CALL and allow whitelisted contract', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'CONTRACT_WHITELIST', {
      contracts: [{ address: '0x1234567890abcdef1234567890abcdef12345678' }],
    });
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
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
    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    expect(ctx.tier).toBe('INSTANT');
  });

  it('should apply APPROVED_SPENDERS for APPROVE and deny unapproved spender', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'APPROVED_SPENDERS', {
      spenders: [{ address: '0xDifferentSpender' }],
    });
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
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
    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
    });

    await stage1Validate(ctx);
    // Stage 3 should deny -- spender not in APPROVED_SPENDERS
    await expect(stage3Policy(ctx)).rejects.toThrow(/not in approved list/i);
  });

  it('should use evaluateBatch for BATCH type requests', async () => {
    const walletId = await insertTestAgent(conn);

    // Set up policies for batch evaluation
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
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

    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '500000000',
      notify_max: '1000000000',
      delay_max: '5000000000',
      delay_seconds: 60,
    });
    await insertPolicy(conn, walletId, 'WHITELIST', {
      allowed_addresses: ['Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'],
    });

    const request: TransferRequestInput = {
      type: 'TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);

    // Set up policy that checks tokenAddress
    await insertPolicy(conn, walletId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }],
    });
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
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

    const ctx = createPipelineContext(conn, walletId, {
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
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'CONTRACT_WHITELIST', {
      contracts: [{ address: '0x1234567890abcdef1234567890abcdef12345678' }],
    });
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
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

    const ctx = createPipelineContext(conn, walletId, {
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

// ===========================================================================
// Stage 3: USD Policy Integration (Phase 127 -- 9 tests)
// ===========================================================================

import type { IPriceOracle, PriceInfo, CacheStats, TokenRef } from '@waiaas/core';
import { auditLog } from '../infrastructure/database/schema.js';
import { hintedTokens } from '../pipeline/stages.js';
import { PriceNotAvailableError } from '../infrastructure/oracle/oracle-errors.js';

function createMockPriceOracle(overrides: Partial<IPriceOracle> = {}): IPriceOracle {
  return {
    getPrice: async (): Promise<PriceInfo> => ({
      usdPrice: 1.0,
      source: 'pyth',
      timestamp: Date.now(),
      confidence: 0.01,
      isStale: false,
    }),
    getPrices: async () => new Map(),
    getNativePrice: async (): Promise<PriceInfo> => ({
      usdPrice: 150.0,
      source: 'pyth',
      timestamp: Date.now(),
      confidence: 0.5,
      isStale: false,
    }),
    getCacheStats: (): CacheStats => ({ hits: 0, misses: 0, staleHits: 0, size: 0, evictions: 0 }),
    ...overrides,
  };
}

describe('Stage 3: USD Policy Integration', () => {
  beforeEach(() => {
    // Reset hintedTokens between tests
    hintedTokens.clear();
  });

  it('priceOracle 있음 + TRANSFER + success: usdAmount가 evaluateAndReserve에 전달됨', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request = {
      type: 'TRANSFER' as const,
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };

    const priceOracle = createMockPriceOracle({
      getNativePrice: async () => ({
        usdPrice: 150.0,
        source: 'pyth',
        timestamp: Date.now(),
        confidence: 0.5,
        isStale: false,
      }),
    });

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const evaluateSpy = vi.spyOn(policyEngine, 'evaluateAndReserve');

    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      priceOracle,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // evaluateAndReserve should have been called with usdAmount (4th arg)
    expect(evaluateSpy).toHaveBeenCalled();
    const usdArg = evaluateSpy.mock.calls[0]![3];
    expect(usdArg).toBeGreaterThan(0);
    // 1 SOL (1e9 lamports) * $150 = $150
    expect(usdArg).toBeCloseTo(150.0, 0);
  });

  it('priceOracle 있음 + TOKEN_TRANSFER + notListed: tier가 최소 NOTIFY로 격상 + audit_log 삽입', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'UnknownMintXYZ' }],
    });
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'UnknownMintXYZ', decimals: 6, symbol: 'UNKNOWN' },
    };

    const priceOracle = createMockPriceOracle({
      getPrice: async (token: TokenRef) => {
        throw new PriceNotAvailableError(token.address, 'solana');
      },
    });

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      priceOracle,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // tier should be upgraded to at least NOTIFY
    expect(ctx.tier).toBe('NOTIFY');

    // audit_log should have UNLISTED_TOKEN_TRANSFER entry
    const logs = await conn.db.select().from(auditLog).all();
    const unlistedLog = logs.find((l) => l.eventType === 'UNLISTED_TOKEN_TRANSFER');
    expect(unlistedLog).toBeTruthy();
    expect(unlistedLog!.walletId).toBe(walletId);
    const details = JSON.parse(unlistedLog!.details);
    expect(details.tokenAddress).toBe('UnknownMintXYZ');
    expect(details.chain).toBe('solana');
  });

  it('priceOracle 있음 + oracleDown: 네이티브 금액만으로 평가 (usdAmount 미전달)', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request = {
      type: 'TRANSFER' as const,
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };

    const priceOracle = createMockPriceOracle({
      getNativePrice: async () => {
        throw new Error('Oracle down');
      },
    });

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const evaluateSpy = vi.spyOn(policyEngine, 'evaluateAndReserve');

    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      priceOracle,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // evaluateAndReserve should be called without usdAmount (undefined)
    expect(evaluateSpy).toHaveBeenCalled();
    const usdArg = evaluateSpy.mock.calls[0]![3];
    expect(usdArg).toBeUndefined();
    // Tier should still be determined by native amount
    expect(ctx.tier).toBe('INSTANT');
  });

  it('priceOracle 미설정 (undefined): 기존 네이티브 전용 평가 (하위 호환)', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request = {
      type: 'TRANSFER' as const,
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000000',
    };

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const evaluateSpy = vi.spyOn(policyEngine, 'evaluateAndReserve');

    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      // priceOracle is NOT set -- undefined
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // evaluateAndReserve should be called without usdAmount
    expect(evaluateSpy).toHaveBeenCalled();
    const usdArg = evaluateSpy.mock.calls[0]![3];
    expect(usdArg).toBeUndefined();
    expect(ctx.tier).toBe('INSTANT');
  });

  it('notListed + CoinGecko 키 미설정: 힌트 포함 알림 발송 + hintedTokens 등록', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'UnknownMintABC' }],
    });
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'UnknownMintABC', decimals: 6, symbol: 'UNK' },
    };

    const priceOracle = createMockPriceOracle({
      getPrice: async (token: TokenRef) => {
        throw new PriceNotAvailableError(token.address, 'solana');
      },
    });

    const mockNotify = vi.fn();
    const notificationService = { notify: mockNotify } as any;

    // settingsService returns undefined for CoinGecko key (not configured)
    const settingsService = {
      get: vi.fn().mockReturnValue(undefined),
    } as any;

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      priceOracle,
      notificationService,
      settingsService,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // Notification should have been called with hint
    expect(mockNotify).toHaveBeenCalled();
    const notifyCall = mockNotify.mock.calls.find(
      (c: unknown[]) => c[0] === 'POLICY_VIOLATION' && (c[2] as Record<string, string>).hint,
    );
    expect(notifyCall).toBeTruthy();
    expect(notifyCall[2].hint).toContain('CoinGecko API 키');

    // hintedTokens should contain the cache key
    expect(hintedTokens.has('solana:UnknownMintABC')).toBe(true);
  });

  it('notListed + 동일 토큰 재전송: 힌트가 두 번째에는 포함되지 않음 (최초 1회)', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'RepeatMintXYZ' }],
    });
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'RepeatMintXYZ', decimals: 6, symbol: 'RPT' },
    };

    const priceOracle = createMockPriceOracle({
      getPrice: async (token: TokenRef) => {
        throw new PriceNotAvailableError(token.address, 'solana');
      },
    });

    const mockNotify = vi.fn();
    const notificationService = { notify: mockNotify } as any;
    const settingsService = { get: vi.fn().mockReturnValue(undefined) } as any;

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);

    // First call: should include hint
    const ctx1 = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      priceOracle,
      notificationService,
      settingsService,
    });
    await stage1Validate(ctx1);
    await stage3Policy(ctx1);

    // Second call: should NOT include hint
    mockNotify.mockClear();
    const ctx2 = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      priceOracle,
      notificationService,
      settingsService,
    });
    await stage1Validate(ctx2);
    await stage3Policy(ctx2);

    // Second call notification should NOT have hint
    const secondNotify = mockNotify.mock.calls.find(
      (c: unknown[]) => c[0] === 'POLICY_VIOLATION',
    );
    expect(secondNotify).toBeTruthy();
    expect(secondNotify[2].hint).toBeUndefined();
  });

  it('BATCH + 일부 notListed: notListed 격상 + 감사 로그', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });
    // ALLOWED_TOKENS policy to allow the token in batch
    await insertPolicy(conn, walletId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'UnlistedBatchToken' }],
    });

    const request: BatchRequest = {
      type: 'BATCH',
      instructions: [
        { to: 'addr1', amount: '1000000' },
        {
          to: 'addr2',
          amount: '5000000',
          token: { address: 'UnlistedBatchToken', decimals: 6, symbol: 'UBT' },
        },
      ],
    };

    const priceOracle = createMockPriceOracle({
      getNativePrice: async () => ({
        usdPrice: 150.0,
        source: 'pyth',
        timestamp: Date.now(),
        confidence: 0.5,
        isStale: false,
      }),
      getPrice: async (token: TokenRef) => {
        throw new PriceNotAvailableError(token.address, 'solana');
      },
    });

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      priceOracle,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // tier should be at least NOTIFY (notListed upgrade)
    expect(ctx.tier).toBe('NOTIFY');

    // audit_log should have UNLISTED_TOKEN_TRANSFER entry
    const logs = await conn.db.select().from(auditLog).all();
    const unlistedLog = logs.find((l) => l.eventType === 'UNLISTED_TOKEN_TRANSFER');
    expect(unlistedLog).toBeTruthy();
    const details = JSON.parse(unlistedLog!.details);
    expect(details.tokenAddress).toBe('UnlistedBatchToken');
    expect(details.failedCount).toBe(1);
  });

  it('priceOracle 있음 + TRANSFER + success + INSTANT tier: 그대로 INSTANT 유지 (격상 불필요)', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request = {
      type: 'TRANSFER' as const,
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '1000000',
    };

    const priceOracle = createMockPriceOracle({
      getNativePrice: async () => ({
        usdPrice: 150.0,
        source: 'pyth',
        timestamp: Date.now(),
        confidence: 0.5,
        isStale: false,
      }),
    });

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      priceOracle,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // success priceResult -> no upgrade, INSTANT should remain
    expect(ctx.tier).toBe('INSTANT');

    // No audit_log entries for success case
    const logs = await conn.db.select().from(auditLog).all();
    expect(logs.filter((l) => l.eventType === 'UNLISTED_TOKEN_TRANSFER')).toHaveLength(0);
  });

  it('notListed + CoinGecko 키 설정됨: 힌트 포함되지 않음', async () => {
    const walletId = await insertTestAgent(conn);

    await insertPolicy(conn, walletId, 'ALLOWED_TOKENS', {
      tokens: [{ address: 'HintlessMint' }],
    });
    await insertPolicy(conn, walletId, 'SPENDING_LIMIT', {
      instant_max: '999999999999',
      notify_max: '999999999999',
      delay_max: '999999999999',
      delay_seconds: 60,
    });

    const request: TokenTransferRequest = {
      type: 'TOKEN_TRANSFER',
      to: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
      amount: '5000000',
      token: { address: 'HintlessMint', decimals: 6, symbol: 'HLS' },
    };

    const priceOracle = createMockPriceOracle({
      getPrice: async (token: TokenRef) => {
        throw new PriceNotAvailableError(token.address, 'solana');
      },
    });

    const mockNotify = vi.fn();
    const notificationService = { notify: mockNotify } as any;

    // settingsService returns a CoinGecko key (configured)
    const settingsService = {
      get: vi.fn().mockReturnValue('CG-api-key-12345'),
    } as any;

    const policyEngine = new DatabasePolicyEngine(conn.db, conn.sqlite);
    const ctx = createPipelineContext(conn, walletId, {
      request: request as unknown as SendTransactionRequest,
      policyEngine,
      sqlite: conn.sqlite,
      priceOracle,
      notificationService,
      settingsService,
    });

    await stage1Validate(ctx);
    await stage3Policy(ctx);

    // Notification should be called but WITHOUT hint (CoinGecko key is set)
    const policyNotify = mockNotify.mock.calls.find(
      (c: unknown[]) => c[0] === 'POLICY_VIOLATION',
    );
    expect(policyNotify).toBeTruthy();
    expect(policyNotify[2].hint).toBeUndefined();
  });
});
