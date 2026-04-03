/**
 * RippleAdapter unit tests with mocked xrpl.Client.
 *
 * Tests cover all 25 IChainAdapter methods:
 * - Connection management: connect, disconnect, isConnected, getHealth
 * - Balance query: getBalance (normal + account not found)
 * - Fee estimation: estimateFee with 120% safety margin
 * - Nonce: getCurrentNonce returns Sequence
 * - Transaction pipeline: build, simulate, sign, submit, waitForConfirmation
 * - Sign-only: parseTransaction, signExternalTransaction
 * - Assets: getAssets
 * - Utility: getTransactionFee
 * - Unsupported stubs: buildContractCall, buildBatch, approveNft, etc.
 * - Error mapping: connection, account not found, rate limit, timeout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChainError } from '@waiaas/core';
import type { TransferRequest, UnsignedTransaction } from '@waiaas/core';

// ---- Hoisted mock setup ----

const { mockClient, mockWallet } = vi.hoisted(() => {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    request: vi.fn(),
    autofill: vi.fn(),
  };

  const mockWallet = {
    address: 'rTestSenderAddr',
    sign: vi.fn().mockReturnValue({
      tx_blob: 'AABBCCDD',
      hash: 'DEADBEEF',
    }),
  };

  return { mockClient, mockWallet };
});

vi.mock('xrpl', () => ({
  Client: vi.fn().mockImplementation(() => mockClient),
  Wallet: {
    fromEntropy: vi.fn().mockReturnValue(mockWallet),
  },
  ECDSA: { ed25519: 'ed25519', secp256k1: 'ecdsa-secp256k1' },
  // Address validation functions used by address-utils.ts
  isValidClassicAddress: vi.fn((addr: string) => typeof addr === 'string' && addr.startsWith('r')),
  isValidXAddress: vi.fn((addr: string) => typeof addr === 'string' && (addr.startsWith('X') || addr.startsWith('T')) && addr.length > 30),
  xAddressToClassicAddress: vi.fn((xAddr: string) => ({
    classicAddress: 'rDecodedFromXAddr',
    tag: xAddr.includes('WithTag') ? 99999 : false,
  })),
}));

// Import adapter after mocks
import { RippleAdapter } from '../adapter.js';

// ---- Test fixtures ----

const TEST_RPC_URL = 'wss://s.altnet.rippletest.net:51233';

const MOCK_SERVER_INFO = {
  result: {
    info: {
      validated_ledger: {
        seq: 12345,
        base_fee_xrp: 0.00001,
        reserve_base_xrp: 10,
        reserve_inc_xrp: 2,
      },
    },
  },
};

const MOCK_ACCOUNT_INFO = {
  result: {
    account_data: {
      Balance: '50000000', // 50 XRP in drops
      Sequence: 42,
      OwnerCount: 3,
    },
  },
};

function createAdapter(): RippleAdapter {
  return new RippleAdapter('xrpl-testnet' as any);
}

async function connectAdapter(adapter: RippleAdapter): Promise<void> {
  mockClient.request.mockResolvedValueOnce(MOCK_SERVER_INFO);
  await adapter.connect(TEST_RPC_URL);
}

describe('RippleAdapter', () => {
  let adapter: RippleAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createAdapter();
  });

  afterEach(async () => {
    try {
      await adapter.disconnect();
    } catch {
      // ignore
    }
  });

  // -- Connection management --

  describe('connect', () => {
    it('creates client and connects', async () => {
      mockClient.request.mockResolvedValueOnce(MOCK_SERVER_INFO);
      await adapter.connect(TEST_RPC_URL);

      expect(mockClient.connect).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(true);
    });

    it('fetches server_info on connect', async () => {
      mockClient.request.mockResolvedValueOnce(MOCK_SERVER_INFO);
      await adapter.connect(TEST_RPC_URL);

      expect(mockClient.request).toHaveBeenCalledWith({ command: 'server_info' });
    });
  });

  describe('disconnect', () => {
    it('disconnects and resets state', async () => {
      await connectAdapter(adapter);

      mockClient.isConnected.mockReturnValue(false);
      await adapter.disconnect();

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('returns false before connect', () => {
      expect(adapter.isConnected()).toBe(false);
    });

    it('returns true after connect', async () => {
      mockClient.isConnected.mockReturnValue(true);
      await connectAdapter(adapter);
      expect(adapter.isConnected()).toBe(true);
    });
  });

  describe('getHealth', () => {
    it('returns healthy with ledger index', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockResolvedValueOnce(MOCK_SERVER_INFO);

      const health = await adapter.getHealth();

      expect(health.healthy).toBe(true);
      expect(health.blockHeight).toBe(12345n);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns unhealthy on error', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockRejectedValueOnce(new Error('Connection lost'));

      const health = await adapter.getHealth();

      expect(health.healthy).toBe(false);
    });
  });

  // -- Balance query --

  describe('getBalance', () => {
    it('returns correct balance in drops', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockResolvedValueOnce(MOCK_ACCOUNT_INFO);

      const balance = await adapter.getBalance('rTestAddr');

      expect(balance.balance).toBe(50_000_000n);
      expect(balance.decimals).toBe(6);
      expect(balance.symbol).toBe('XRP');
      expect(balance.address).toBe('rTestAddr');
    });

    it('returns 0 balance for unfunded account', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockRejectedValueOnce(new Error('actNotFound'));

      const balance = await adapter.getBalance('rUnfunded');

      expect(balance.balance).toBe(0n);
      expect(balance.symbol).toBe('XRP');
    });

    it('throws for other errors', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockRejectedValueOnce(new Error('WebSocket connection lost'));

      await expect(adapter.getBalance('rAddr')).rejects.toThrow(ChainError);
    });
  });

  // -- Fee estimation --

  describe('estimateFee', () => {
    it('returns fee with 120% safety margin', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockResolvedValueOnce(MOCK_SERVER_INFO);

      const fee = await adapter.estimateFee({ from: 'rA', to: 'rB', amount: 1000n });

      // base_fee_xrp = 0.00001 XRP = 10 drops. 10 * 120 / 100 = 12
      expect(fee.fee).toBe(12n);
      expect(fee.details).toEqual({
        baseFee: '10',
        safetyMargin: '120%',
      });
    });
  });

  // -- Nonce --

  describe('getCurrentNonce', () => {
    it('returns Sequence from account_info', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockResolvedValueOnce(MOCK_ACCOUNT_INFO);

      const nonce = await adapter.getCurrentNonce('rTestAddr');

      expect(nonce).toBe(42);
    });

    it('returns 0 for unfunded account', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockRejectedValueOnce(new Error('actNotFound'));

      const nonce = await adapter.getCurrentNonce('rUnfunded');

      expect(nonce).toBe(0);
    });
  });

  // -- Transaction pipeline --

  describe('buildTransaction', () => {
    it('creates Payment with correct fields', async () => {
      await connectAdapter(adapter);

      const autofilledPayment = {
        TransactionType: 'Payment',
        Account: 'rSender',
        Destination: 'rReceiver',
        Amount: '1000000',
        Sequence: 10,
        Fee: '12',
        LastLedgerSequence: 12370,
      };
      mockClient.autofill.mockResolvedValueOnce(autofilledPayment);

      const request: TransferRequest = {
        from: 'rSender',
        to: 'rReceiver',
        amount: 1_000_000n,
      };

      const tx = await adapter.buildTransaction(request);

      expect(tx.chain).toBe('ripple');
      expect(tx.estimatedFee).toBe(14n); // 12 * 120 / 100 = 14.4 -> 14n (bigint truncation)
      expect(tx.metadata['Sequence']).toBe(10);
      expect(tx.metadata['LastLedgerSequence']).toBe(12370);
      expect(tx.nonce).toBe(10);
    });

    it('includes DestinationTag from memo (numeric string)', async () => {
      await connectAdapter(adapter);

      const autofilledPayment = {
        TransactionType: 'Payment',
        Account: 'rSender',
        Destination: 'rReceiver',
        Amount: '1000000',
        DestinationTag: 12345,
        Sequence: 10,
        Fee: '12',
        LastLedgerSequence: 12370,
      };
      mockClient.autofill.mockResolvedValueOnce(autofilledPayment);

      const request: TransferRequest = {
        from: 'rSender',
        to: 'rReceiver',
        amount: 1_000_000n,
        memo: '12345',
      };

      const tx = await adapter.buildTransaction(request);
      expect(tx.metadata['DestinationTag']).toBe(12345);
    });

    it('applies fee safety margin (120%)', async () => {
      await connectAdapter(adapter);

      const autofilledPayment = {
        TransactionType: 'Payment',
        Account: 'rSender',
        Destination: 'rReceiver',
        Amount: '1000000',
        Sequence: 10,
        Fee: '100', // 100 drops base
        LastLedgerSequence: 12370,
      };
      mockClient.autofill.mockResolvedValueOnce(autofilledPayment);

      const tx = await adapter.buildTransaction({
        from: 'rSender',
        to: 'rReceiver',
        amount: 1_000_000n,
      });

      // 100 * 120 / 100 = 120
      expect(tx.estimatedFee).toBe(120n);
    });
  });

  describe('simulateTransaction', () => {
    it('validates via autofill', async () => {
      await connectAdapter(adapter);

      const txPayload = {
        TransactionType: 'Payment',
        Account: 'rSender',
        Destination: 'rReceiver',
        Amount: '1000000',
      };
      const serialized = new TextEncoder().encode(JSON.stringify(txPayload));

      mockClient.autofill.mockResolvedValueOnce(txPayload);

      const result = await adapter.simulateTransaction({
        chain: 'ripple',
        serialized,
        estimatedFee: 12n,
        metadata: {},
      });

      expect(result.success).toBe(true);
      expect(result.logs).toContain('autofill validation passed');
    });

    it('returns failure on autofill error', async () => {
      await connectAdapter(adapter);

      const txPayload = { TransactionType: 'Payment' };
      const serialized = new TextEncoder().encode(JSON.stringify(txPayload));

      mockClient.autofill.mockRejectedValueOnce(new Error('Invalid tx'));

      const result = await adapter.simulateTransaction({
        chain: 'ripple',
        serialized,
        estimatedFee: 12n,
        metadata: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid tx');
    });
  });

  describe('signTransaction', () => {
    it('signs with Ed25519 seed and returns tx_blob bytes', async () => {
      await connectAdapter(adapter);

      const txPayload = {
        TransactionType: 'Payment',
        Account: 'rTestSenderAddr',
        Destination: 'rReceiver',
        Amount: '1000000',
        Sequence: 10,
        Fee: '12',
      };
      const serialized = new TextEncoder().encode(JSON.stringify(txPayload));

      const unsignedTx: UnsignedTransaction = {
        chain: 'ripple',
        serialized,
        estimatedFee: 12n,
        metadata: {},
      };

      const privateKey = new Uint8Array(32).fill(1);
      const signedBytes = await adapter.signTransaction(unsignedTx, privateKey);

      expect(signedBytes).toBeInstanceOf(Uint8Array);
      expect(signedBytes.length).toBeGreaterThan(0);
    });

    it('throws WALLET_NOT_SIGNER if address mismatch', async () => {
      await connectAdapter(adapter);

      // mockWallet.address is 'rTestSenderAddr' but tx Account is different
      const txPayload = {
        TransactionType: 'Payment',
        Account: 'rWrongAddress',
        Destination: 'rReceiver',
        Amount: '1000000',
      };
      const serialized = new TextEncoder().encode(JSON.stringify(txPayload));

      const unsignedTx: UnsignedTransaction = {
        chain: 'ripple',
        serialized,
        estimatedFee: 12n,
        metadata: {},
      };

      const privateKey = new Uint8Array(32).fill(1);

      await expect(adapter.signTransaction(unsignedTx, privateKey)).rejects.toThrow(ChainError);
      try {
        await adapter.signTransaction(unsignedTx, privateKey);
      } catch (e) {
        expect((e as ChainError).code).toBe('WALLET_NOT_SIGNER');
      }
    });
  });

  describe('submitTransaction', () => {
    it('returns txHash and submitted status on tesSUCCESS', async () => {
      await connectAdapter(adapter);

      mockClient.request.mockResolvedValueOnce({
        result: {
          engine_result: 'tesSUCCESS',
          tx_json: { hash: 'AABBCCDD' },
        },
      });

      const signedTx = new Uint8Array(Buffer.from('DEADBEEF', 'hex'));
      const result = await adapter.submitTransaction(signedTx);

      expect(result.txHash).toBe('AABBCCDD');
      expect(result.status).toBe('submitted');
    });

    it('handles tec result as submitted', async () => {
      await connectAdapter(adapter);

      mockClient.request.mockResolvedValueOnce({
        result: {
          engine_result: 'tecNO_DST',
          tx_json: { hash: 'DEADBEEF' },
        },
      });

      const signedTx = new Uint8Array(Buffer.from('AABB', 'hex'));
      const result = await adapter.submitTransaction(signedTx);

      expect(result.status).toBe('submitted');
    });

    it('throws on rejected transaction (tef/tel/tem)', async () => {
      await connectAdapter(adapter);

      mockClient.request.mockResolvedValueOnce({
        result: {
          engine_result: 'tefPAST_SEQ',
          engine_result_message: 'Past sequence',
          tx_json: { hash: 'BAD' },
        },
      });

      const signedTx = new Uint8Array(Buffer.from('AABB', 'hex'));
      await expect(adapter.submitTransaction(signedTx)).rejects.toThrow(ChainError);
    });
  });

  describe('waitForConfirmation', () => {
    it('returns confirmed for validated tx', async () => {
      await connectAdapter(adapter);

      mockClient.request.mockResolvedValueOnce({
        result: {
          validated: true,
          meta: { TransactionResult: 'tesSUCCESS' },
          ledger_index: 12346,
          Fee: '12',
        },
      });

      const result = await adapter.waitForConfirmation('TXHASH', 5000);

      expect(result.status).toBe('confirmed');
      expect(result.txHash).toBe('TXHASH');
      expect(result.blockNumber).toBe(12346n);
      expect(result.fee).toBe(12n);
    });

    it('returns failed for validated tx with tec result', async () => {
      await connectAdapter(adapter);

      mockClient.request.mockResolvedValueOnce({
        result: {
          validated: true,
          meta: { TransactionResult: 'tecNO_DST' },
          ledger_index: 12346,
          Fee: '12',
        },
      });

      const result = await adapter.waitForConfirmation('TXHASH', 5000);

      expect(result.status).toBe('failed');
    });

    it('returns submitted on timeout', async () => {
      await connectAdapter(adapter);

      // Never return validated: true
      mockClient.request.mockRejectedValue(new Error('txnNotFound'));

      const result = await adapter.waitForConfirmation('TXHASH', 100);

      expect(result.status).toBe('submitted');
    });
  });

  // -- Assets --

  describe('getAssets', () => {
    it('returns native XRP asset', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockResolvedValueOnce(MOCK_ACCOUNT_INFO);

      const assets = await adapter.getAssets('rTestAddr');

      expect(assets).toHaveLength(1);
      expect(assets[0]!.symbol).toBe('XRP');
      expect(assets[0]!.isNative).toBe(true);
      expect(assets[0]!.balance).toBe(50_000_000n);
    });
  });

  // -- Utility --

  describe('getTransactionFee', () => {
    it('returns fee from metadata', async () => {
      const tx: UnsignedTransaction = {
        chain: 'ripple',
        serialized: new Uint8Array(0),
        estimatedFee: 12n,
        metadata: { Fee: '15' },
      };

      const fee = await adapter.getTransactionFee(tx);
      expect(fee).toBe(15n);
    });

    it('falls back to estimatedFee', async () => {
      const tx: UnsignedTransaction = {
        chain: 'ripple',
        serialized: new Uint8Array(0),
        estimatedFee: 12n,
        metadata: {},
      };

      const fee = await adapter.getTransactionFee(tx);
      expect(fee).toBe(12n);
    });
  });

  // -- Sign-only --

  describe('parseTransaction', () => {
    it('delegates to parseRippleTransaction', async () => {
      await connectAdapter(adapter);

      const rawTx = JSON.stringify({
        TransactionType: 'Payment',
        Account: 'rSender',
        Destination: 'rReceiver',
        Amount: '1000000',
      });

      const parsed = await adapter.parseTransaction(rawTx);
      expect(parsed.operations).toHaveLength(1);
      expect(parsed.operations[0]!.type).toBe('NATIVE_TRANSFER');
    });
  });

  describe('signExternalTransaction', () => {
    it('signs raw transaction JSON', async () => {
      await connectAdapter(adapter);

      const rawTx = JSON.stringify({
        TransactionType: 'Payment',
        Account: 'rSender',
        Destination: 'rReceiver',
        Amount: '1000000',
        Sequence: 10,
        Fee: '12',
      });

      const privateKey = new Uint8Array(32).fill(1);
      const result = await adapter.signExternalTransaction(rawTx, privateKey);

      expect(result.signedTransaction).toBe('AABBCCDD');
      expect(result.txHash).toBe('DEADBEEF');
    });
  });

  // -- Unsupported methods --

  describe('unsupported methods', () => {
    it('buildContractCall throws INVALID_INSTRUCTION', async () => {
      await expect(
        adapter.buildContractCall({ from: 'r1', to: 'r2' }),
      ).rejects.toThrow(ChainError);
    });

    it('buildBatch throws BATCH_NOT_SUPPORTED', async () => {
      await expect(
        adapter.buildBatch({ from: 'r1', instructions: [] }),
      ).rejects.toThrow(ChainError);
      try {
        await adapter.buildBatch({ from: 'r1', instructions: [] });
      } catch (e) {
        expect((e as ChainError).code).toBe('BATCH_NOT_SUPPORTED');
      }
    });

    it('approveNft throws', async () => {
      await expect(
        adapter.approveNft({ from: 'r1', spender: 'r2', token: { address: 'a', tokenId: '1', standard: 'ERC-721' }, approvalType: 'single' }),
      ).rejects.toThrow(ChainError);
    });

    it('buildTokenTransfer throws (Phase 472 stub)', async () => {
      await expect(
        adapter.buildTokenTransfer({ from: 'r1', to: 'r2', amount: 100n, token: { address: 'a', decimals: 6, symbol: 'USD' } }),
      ).rejects.toThrow(ChainError);
    });

    it('getTokenInfo throws (Phase 472 stub)', async () => {
      await expect(adapter.getTokenInfo('token')).rejects.toThrow(ChainError);
    });

    it('buildApprove throws (Phase 472 stub)', async () => {
      await expect(
        adapter.buildApprove({ from: 'r1', spender: 'r2', token: { address: 'a', decimals: 6, symbol: 'USD' }, amount: 100n }),
      ).rejects.toThrow(ChainError);
    });

    it('buildNftTransferTx throws (Phase 473 stub)', async () => {
      await expect(
        adapter.buildNftTransferTx({ from: 'r1', to: 'r2', token: { address: 'a', tokenId: '1', standard: 'ERC-721' }, amount: 1n }),
      ).rejects.toThrow(ChainError);
    });

    it('transferNft throws (Phase 473 stub)', async () => {
      await expect(
        adapter.transferNft({ from: 'r1', to: 'r2', token: { address: 'a', tokenId: '1', standard: 'ERC-721' }, amount: 1n }, new Uint8Array(32)),
      ).rejects.toThrow(ChainError);
    });
  });

  // -- Error mapping --

  describe('error mapping', () => {
    it('maps connection errors to RPC_CONNECTION_ERROR', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockRejectedValueOnce(new Error('WebSocket disconnected'));

      try {
        await adapter.getBalance('rAddr');
      } catch (e) {
        expect(e).toBeInstanceOf(ChainError);
        expect((e as ChainError).code).toBe('RPC_CONNECTION_ERROR');
      }
    });

    it('maps actNotFound to ACCOUNT_NOT_FOUND (balance returns 0)', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockRejectedValueOnce(new Error('actNotFound'));

      // getBalance handles actNotFound gracefully (returns 0)
      const balance = await adapter.getBalance('rUnfunded');
      expect(balance.balance).toBe(0n);
    });

    it('maps timeout errors to RPC_TIMEOUT', async () => {
      await connectAdapter(adapter);
      mockClient.request.mockRejectedValueOnce(new Error('Request timeout'));

      try {
        await adapter.getCurrentNonce('rAddr');
      } catch (e) {
        expect(e).toBeInstanceOf(ChainError);
        expect((e as ChainError).code).toBe('RPC_TIMEOUT');
      }
    });
  });

  // -- Not connected guard --

  describe('not connected guard', () => {
    it('throws RPC_CONNECTION_ERROR when not connected', async () => {
      await expect(adapter.getBalance('rAddr')).rejects.toThrow(ChainError);
    });
  });
});
