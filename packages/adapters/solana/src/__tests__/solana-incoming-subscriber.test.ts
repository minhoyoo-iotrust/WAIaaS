/**
 * SolanaIncomingSubscriber + parser unit tests with mock RPC.
 *
 * Tests cover:
 * - parseSOLTransfer: SOL native transfer detection (5 tests)
 * - parseSPLTransfers: SPL/Token-2022 transfer detection (5 tests)
 * - SolanaIncomingSubscriber: IChainSubscriber 6-method interface + pollAll (6 tests)
 * - SolanaHeartbeat: 60s getSlot ping lifecycle (3 tests)
 *
 * Mock strategy: vi.mock('@solana/kit') with vi.hoisted() for mock RPC objects.
 * No real network calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- Hoisted mock setup (vi.hoisted runs before vi.mock) ----

const { mockRpc, mockRpcSubscriptions } = vi.hoisted(() => {
  const mockRpc = {
    getSlot: vi.fn(),
    getTransaction: vi.fn(),
    getSignaturesForAddress: vi.fn(),
  };
  const mockRpcSubscriptions = {
    logsNotifications: vi.fn(),
  };
  return { mockRpc, mockRpcSubscriptions };
});

// Mock @solana/kit module
vi.mock('@solana/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@solana/kit')>();
  return {
    ...actual,
    createSolanaRpc: vi.fn().mockReturnValue(mockRpc),
    createSolanaRpcSubscriptions: vi.fn().mockReturnValue(mockRpcSubscriptions),
    // Passthrough address() to avoid base58 validation on test addresses
    address: vi.fn().mockImplementation((addr: string) => addr),
  };
});

// Import after mock
import { parseSOLTransfer, parseSPLTransfers } from '../incoming-tx-parser.js';
import { SolanaIncomingSubscriber, SolanaHeartbeat } from '../solana-incoming-subscriber.js';
import type { SolanaTransactionResult } from '../incoming-tx-parser.js';
import type { IncomingTransaction } from '@waiaas/core';

// ---- Helpers ----

/** Create a chainable RPC method mock: method(...).send() -> resolves(value) */
function mockSend<T>(value: T) {
  return vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue(value) });
}

/** Create a stubbed generateId function */
let idCounter = 0;
function stubGenerateId(): string {
  return `test-id-${++idCounter}`;
}

// ---- Test fixtures ----

const WALLET_ADDRESS = 'WalletPubkey11111111111111111111111111111';
const SENDER_ADDRESS = 'SenderPubkey11111111111111111111111111111';
const OTHER_ADDRESS = 'OtherPubkey111111111111111111111111111111';
const WALLET_ID = 'wallet-001';
const NETWORK = 'devnet';

function createBasicSOLTx(opts: {
  preBalances: number[];
  postBalances: number[];
  accountKeys?: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
  err?: unknown | null;
}): SolanaTransactionResult {
  return {
    slot: 12345,
    transaction: {
      signatures: ['5wHu1qwD7q7TXLRP1CEvwD9fQzG8RKZE4mNvYfLdV4j'],
      message: {
        accountKeys: opts.accountKeys ?? [
          { pubkey: SENDER_ADDRESS, signer: true, writable: true },
          { pubkey: WALLET_ADDRESS, signer: false, writable: true },
          { pubkey: OTHER_ADDRESS, signer: false, writable: false },
        ],
        instructions: [],
      },
    },
    meta: {
      err: opts.err ?? null,
      preBalances: opts.preBalances,
      postBalances: opts.postBalances,
      preTokenBalances: [],
      postTokenBalances: [],
    },
  };
}

function createSPLTx(opts: {
  preTokenBalances: SolanaTransactionResult['meta'] extends infer M
    ? M extends { preTokenBalances: infer T }
      ? T
      : never
    : never;
  postTokenBalances: SolanaTransactionResult['meta'] extends infer M
    ? M extends { postTokenBalances: infer T }
      ? T
      : never
    : never;
  err?: unknown | null;
}): SolanaTransactionResult {
  return {
    slot: 12345,
    transaction: {
      signatures: ['5wHu1qwD7q7TXLRP1CEvwD9fQzG8RKZE4mNvYfLdV4j'],
      message: {
        accountKeys: [
          { pubkey: SENDER_ADDRESS, signer: true, writable: true },
          { pubkey: WALLET_ADDRESS, signer: false, writable: true },
        ],
        instructions: [],
      },
    },
    meta: {
      err: opts.err ?? null,
      preBalances: [1000000000, 500000000],
      postBalances: [1000000000, 500000000],
      preTokenBalances: opts.preTokenBalances,
      postTokenBalances: opts.postTokenBalances,
    },
  };
}

const MINT_A = 'MintAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const MINT_B = 'MintBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

// ─── parseSOLTransfer ───────────────────────────────────────────

describe('parseSOLTransfer', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('detects SOL incoming transfer (positive delta) and returns correct IncomingTransaction', () => {
    const tx = createBasicSOLTx({
      preBalances: [2000000000, 500000000, 100000000],
      postBalances: [1000000000, 1495000000, 100000000],
    });

    const result = parseSOLTransfer(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);

    expect(result).not.toBeNull();
    expect(result!.walletId).toBe(WALLET_ID);
    expect(result!.fromAddress).toBe(SENDER_ADDRESS);
    expect(result!.amount).toBe('995000000'); // 1495000000 - 500000000
    expect(result!.tokenAddress).toBeNull();
    expect(result!.chain).toBe('solana');
    expect(result!.network).toBe(NETWORK);
    expect(result!.status).toBe('DETECTED');
    expect(result!.blockNumber).toBe(12345);
    expect(result!.txHash).toBe('5wHu1qwD7q7TXLRP1CEvwD9fQzG8RKZE4mNvYfLdV4j');
    expect(result!.confirmedAt).toBeNull();
    expect(result!.id).toBe('test-id-1');
  });

  it('returns null for outgoing transfer (negative delta)', () => {
    const tx = createBasicSOLTx({
      preBalances: [500000000, 2000000000, 100000000],
      postBalances: [1495000000, 1000000000, 100000000],
    });

    const result = parseSOLTransfer(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);
    expect(result).toBeNull();
  });

  it('returns null for zero delta', () => {
    const tx = createBasicSOLTx({
      preBalances: [1000000000, 500000000, 100000000],
      postBalances: [1000000000, 500000000, 100000000],
    });

    const result = parseSOLTransfer(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);
    expect(result).toBeNull();
  });

  it('identifies sender (account with decreased balance)', () => {
    // Sender is at index 0, wallet at index 1
    const tx = createBasicSOLTx({
      preBalances: [5000000000, 100000000, 100000000],
      postBalances: [3000000000, 2095000000, 100000000],
    });

    const result = parseSOLTransfer(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);

    expect(result).not.toBeNull();
    expect(result!.fromAddress).toBe(SENDER_ADDRESS);
  });

  it('handles missing sender gracefully (fromAddress = "unknown")', () => {
    // All accounts have equal or increased balance (no clear sender)
    const tx = createBasicSOLTx({
      preBalances: [1000000000, 500000000, 100000000],
      postBalances: [1000000000, 1500000000, 100000000],
    });

    const result = parseSOLTransfer(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);

    expect(result).not.toBeNull();
    expect(result!.fromAddress).toBe('unknown');
  });
});

// ─── parseSPLTransfers ──────────────────────────────────────────

describe('parseSPLTransfers', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  it('detects SPL token incoming transfer and returns correct IncomingTransaction', () => {
    const tx = createSPLTx({
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: MINT_A,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1.0, uiAmountString: '1' },
        },
        {
          accountIndex: 1,
          mint: MINT_A,
          owner: WALLET_ADDRESS,
          uiTokenAmount: { amount: '500000', decimals: 6, uiAmount: 0.5, uiAmountString: '0.5' },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: MINT_A,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '200000', decimals: 6, uiAmount: 0.2, uiAmountString: '0.2' },
        },
        {
          accountIndex: 1,
          mint: MINT_A,
          owner: WALLET_ADDRESS,
          uiTokenAmount: { amount: '1300000', decimals: 6, uiAmount: 1.3, uiAmountString: '1.3' },
        },
      ],
    });

    const result = parseSPLTransfers(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);

    expect(result).toHaveLength(1);
    expect(result[0]!.tokenAddress).toBe(MINT_A);
    expect(result[0]!.amount).toBe('800000'); // 1300000 - 500000
    expect(result[0]!.fromAddress).toBe(SENDER_ADDRESS);
    expect(result[0]!.chain).toBe('solana');
    expect(result[0]!.status).toBe('DETECTED');
  });

  it('handles first-time token receipt (no preTokenBalance entry, defaults to 0n)', () => {
    const tx = createSPLTx({
      preTokenBalances: [
        // No entry for WALLET_ADDRESS -- first-time receipt
        {
          accountIndex: 0,
          mint: MINT_A,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1.0, uiAmountString: '1' },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: MINT_A,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '500000', decimals: 6, uiAmount: 0.5, uiAmountString: '0.5' },
        },
        {
          accountIndex: 1,
          mint: MINT_A,
          owner: WALLET_ADDRESS,
          uiTokenAmount: { amount: '500000', decimals: 6, uiAmount: 0.5, uiAmountString: '0.5' },
        },
      ],
    });

    const result = parseSPLTransfers(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);

    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe('500000'); // 500000 - 0 (first-time receipt)
    expect(result[0]!.fromAddress).toBe(SENDER_ADDRESS);
  });

  it('detects multiple tokens in single transaction', () => {
    const tx = createSPLTx({
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: MINT_A,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1.0, uiAmountString: '1' },
        },
        {
          accountIndex: 2,
          mint: MINT_B,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '2000000', decimals: 9, uiAmount: 0.002, uiAmountString: '0.002' },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: MINT_A,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '500000', decimals: 6, uiAmount: 0.5, uiAmountString: '0.5' },
        },
        {
          accountIndex: 1,
          mint: MINT_A,
          owner: WALLET_ADDRESS,
          uiTokenAmount: { amount: '500000', decimals: 6, uiAmount: 0.5, uiAmountString: '0.5' },
        },
        {
          accountIndex: 2,
          mint: MINT_B,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '1000000', decimals: 9, uiAmount: 0.001, uiAmountString: '0.001' },
        },
        {
          accountIndex: 3,
          mint: MINT_B,
          owner: WALLET_ADDRESS,
          uiTokenAmount: { amount: '1000000', decimals: 9, uiAmount: 0.001, uiAmountString: '0.001' },
        },
      ],
    });

    const result = parseSPLTransfers(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);

    expect(result).toHaveLength(2);
    expect(result[0]!.tokenAddress).toBe(MINT_A);
    expect(result[1]!.tokenAddress).toBe(MINT_B);
  });

  it('returns empty array for failed transaction (meta.err non-null)', () => {
    const tx = createSPLTx({
      preTokenBalances: [],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: MINT_A,
          owner: WALLET_ADDRESS,
          uiTokenAmount: { amount: '500000', decimals: 6, uiAmount: 0.5, uiAmountString: '0.5' },
        },
      ],
      err: { InstructionError: [0, 'InsufficientFunds'] },
    });

    const result = parseSPLTransfers(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);
    expect(result).toHaveLength(0);
  });

  it('finds token sender correctly (same mint, different owner, decreased balance)', () => {
    const tx = createSPLTx({
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: MINT_A,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '5000000', decimals: 6, uiAmount: 5.0, uiAmountString: '5' },
        },
        {
          accountIndex: 2,
          mint: MINT_A,
          owner: OTHER_ADDRESS,
          uiTokenAmount: { amount: '3000000', decimals: 6, uiAmount: 3.0, uiAmountString: '3' },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: MINT_A,
          owner: SENDER_ADDRESS,
          uiTokenAmount: { amount: '4000000', decimals: 6, uiAmount: 4.0, uiAmountString: '4' },
        },
        {
          accountIndex: 1,
          mint: MINT_A,
          owner: WALLET_ADDRESS,
          uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1.0, uiAmountString: '1' },
        },
        {
          accountIndex: 2,
          mint: MINT_A,
          owner: OTHER_ADDRESS,
          uiTokenAmount: { amount: '3000000', decimals: 6, uiAmount: 3.0, uiAmountString: '3' },
        },
      ],
    });

    const result = parseSPLTransfers(tx, WALLET_ADDRESS, WALLET_ID, NETWORK, stubGenerateId);

    expect(result).toHaveLength(1);
    // SENDER_ADDRESS decreased from 5M to 4M, OTHER_ADDRESS stayed at 3M
    expect(result[0]!.fromAddress).toBe(SENDER_ADDRESS);
  });
});

// ─── SolanaIncomingSubscriber ───────────────────────────────────

describe('SolanaIncomingSubscriber', () => {
  let subscriber: SolanaIncomingSubscriber;
  let receivedTxs: IncomingTransaction[];
  let onTx: (tx: IncomingTransaction) => void;

  beforeEach(() => {
    idCounter = 0;
    receivedTxs = [];
    onTx = (tx) => receivedTxs.push(tx);
    vi.clearAllMocks();

    subscriber = new SolanaIncomingSubscriber({
      rpcUrl: 'https://api.devnet.solana.com',
      wsUrl: 'wss://api.devnet.solana.com',
      mode: 'polling', // Use polling mode to avoid WebSocket complexity in tests
      generateId: stubGenerateId,
    });
  });

  afterEach(async () => {
    await subscriber.destroy();
  });

  it('subscribe() is idempotent (second call is no-op)', async () => {
    await subscriber.subscribe(WALLET_ID, WALLET_ADDRESS, NETWORK, onTx);
    await subscriber.subscribe(WALLET_ID, WALLET_ADDRESS, NETWORK, onTx);

    expect(subscriber.subscribedWallets()).toHaveLength(1);
  });

  it('subscribedWallets() returns subscribed wallet IDs', async () => {
    expect(subscriber.subscribedWallets()).toEqual([]);

    await subscriber.subscribe('w1', 'addr1', NETWORK, onTx);
    await subscriber.subscribe('w2', 'addr2', NETWORK, onTx);

    expect(subscriber.subscribedWallets()).toEqual(['w1', 'w2']);
  });

  it('unsubscribe() removes wallet from subscriptions', async () => {
    await subscriber.subscribe(WALLET_ID, WALLET_ADDRESS, NETWORK, onTx);
    expect(subscriber.subscribedWallets()).toHaveLength(1);

    await subscriber.unsubscribe(WALLET_ID);
    expect(subscriber.subscribedWallets()).toHaveLength(0);

    // idempotent: unsubscribe non-existent is a no-op
    await subscriber.unsubscribe(WALLET_ID);
    expect(subscriber.subscribedWallets()).toHaveLength(0);
  });

  it('destroy() clears all subscriptions and stops heartbeat', async () => {
    await subscriber.subscribe('w1', 'addr1', NETWORK, onTx);
    await subscriber.subscribe('w2', 'addr2', NETWORK, onTx);
    await subscriber.connect();

    expect(subscriber.subscribedWallets()).toHaveLength(2);

    await subscriber.destroy();
    expect(subscriber.subscribedWallets()).toHaveLength(0);
  });

  it('pollAll() calls onTransaction for detected incoming transfers', async () => {
    await subscriber.subscribe(WALLET_ID, WALLET_ADDRESS, NETWORK, onTx);

    // Mock getSignaturesForAddress to return one signature
    mockRpc.getSignaturesForAddress = mockSend([
      { signature: 'sig123', err: null, slot: 12345, memo: null, blockTime: null, confirmationStatus: 'confirmed' },
    ]);

    // Mock getTransaction to return a SOL transfer
    const txResult = createBasicSOLTx({
      preBalances: [2000000000, 500000000, 100000000],
      postBalances: [1000000000, 1495000000, 100000000],
    });
    mockRpc.getTransaction = mockSend(txResult);

    await subscriber.pollAll();

    expect(receivedTxs).toHaveLength(1);
    expect(receivedTxs[0]!.amount).toBe('995000000');
    expect(receivedTxs[0]!.fromAddress).toBe(SENDER_ADDRESS);
  });

  it('pollAll() isolates per-wallet errors (one wallet failure does not affect others)', async () => {
    // Subscribe two wallets
    const receivedTxs2: IncomingTransaction[] = [];
    await subscriber.subscribe('w-fail', 'addr-fail', NETWORK, onTx);
    await subscriber.subscribe('w-ok', WALLET_ADDRESS, NETWORK, (tx) => receivedTxs2.push(tx));

    // First wallet will fail (getSignaturesForAddress throws)
    let callCount = 0;
    mockRpc.getSignaturesForAddress = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { send: vi.fn().mockRejectedValue(new Error('RPC error')) };
      }
      return {
        send: vi.fn().mockResolvedValue([
          { signature: 'sig456', err: null, slot: 12345, memo: null, blockTime: null, confirmationStatus: 'confirmed' },
        ]),
      };
    });

    const txResult = createBasicSOLTx({
      preBalances: [2000000000, 500000000, 100000000],
      postBalances: [1000000000, 1495000000, 100000000],
    });
    mockRpc.getTransaction = mockSend(txResult);

    await subscriber.pollAll();

    // First wallet failed but second wallet should still have been polled
    expect(receivedTxs2).toHaveLength(1);
  });
});

// ─── SolanaHeartbeat ────────────────────────────────────────────

describe('SolanaHeartbeat', () => {
  let heartbeat: SolanaHeartbeat;

  beforeEach(() => {
    vi.useFakeTimers();
    heartbeat = new SolanaHeartbeat();
  });

  afterEach(() => {
    heartbeat.stop();
    vi.useRealTimers();
  });

  it('start() calls getSlot at 60s intervals', async () => {
    const mockGetSlot = vi.fn().mockResolvedValue(12345);
    heartbeat.start(mockGetSlot);

    // Should not have been called yet
    expect(mockGetSlot).not.toHaveBeenCalled();

    // Advance 60s
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockGetSlot).toHaveBeenCalledTimes(1);

    // Advance another 60s
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockGetSlot).toHaveBeenCalledTimes(2);
  });

  it('stop() clears the interval timer', async () => {
    const mockGetSlot = vi.fn().mockResolvedValue(12345);
    heartbeat.start(mockGetSlot);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockGetSlot).toHaveBeenCalledTimes(1);

    heartbeat.stop();

    // After stop, no more calls
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockGetSlot).toHaveBeenCalledTimes(1);
  });

  it('start() replaces existing timer (no double intervals)', async () => {
    const mockGetSlot1 = vi.fn().mockResolvedValue(1);
    const mockGetSlot2 = vi.fn().mockResolvedValue(2);

    heartbeat.start(mockGetSlot1);
    heartbeat.start(mockGetSlot2); // Should replace first timer

    await vi.advanceTimersByTimeAsync(60_000);

    // Only the second function should be called
    expect(mockGetSlot1).not.toHaveBeenCalled();
    expect(mockGetSlot2).toHaveBeenCalledTimes(1);
  });
});
