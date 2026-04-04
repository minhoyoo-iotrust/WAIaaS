/**
 * Tests for XrplDexProvider -- all 5 actions.
 * Mocks XrplOrderbookClient to isolate provider logic.
 *
 * @see Phase 02-02 Task 1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XrplDexProvider } from '../index.js';
import type { XrplOrderbookClient } from '../orderbook-client.js';
import type { ActionContext, ContractCallRequest, ApiDirectResult } from '@waiaas/core';
import { TF_IMMEDIATE_OR_CANCEL } from '../offer-builder.js';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

function createMockClient(overrides?: Partial<XrplOrderbookClient>): XrplOrderbookClient {
  return {
    ensureConnected: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getClient: vi.fn(),
    getOrderbook: vi.fn().mockResolvedValue({
      asks: [{ price: 0.5, amount: 10, total: 5, ownerFunds: '50000000', sequence: 100 }],
      bids: [{ price: 0.48, amount: 10, total: 4.8, ownerFunds: '100', sequence: 200 }],
      spread: 0.02,
    }),
    getAccountOffers: vi.fn().mockResolvedValue([
      { seq: 12345, takerGets: '5000000 drops', takerPays: '2.5 USD', flags: 0 },
    ]),
    checkTrustLine: vi.fn().mockResolvedValue(true),
    getAccountReserve: vi.fn().mockResolvedValue({
      balance: '50000000',
      ownerCount: 5,
      baseReserve: 1_000_000,
      ownerReserve: 200_000,
      availableBalance: '48000000',
    }),
    ...overrides,
  } as unknown as XrplOrderbookClient;
}

const defaultContext: ActionContext = {
  walletAddress: 'rMyWalletAddress123',
  chain: 'ripple',
  walletId: 'wallet-uuid-123',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('XrplDexProvider', () => {
  let provider: XrplDexProvider;
  let mockClient: XrplOrderbookClient;

  beforeEach(() => {
    mockClient = createMockClient();
    provider = new XrplDexProvider(mockClient);
  });

  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------

  describe('metadata', () => {
    it('has correct provider metadata', () => {
      expect(provider.metadata.name).toBe('xrpl_dex');
      expect(provider.metadata.displayName).toBe('XRPL DEX');
      expect(provider.metadata.chains).toEqual(['ripple']);
      expect(provider.metadata.mcpExpose).toBe(true);
      expect(provider.metadata.requiresSigningKey).toBe(false);
    });

    it('defines 5 actions', () => {
      expect(provider.actions).toHaveLength(5);
      const names = provider.actions.map((a) => a.name);
      expect(names).toContain('swap');
      expect(names).toContain('limit_order');
      expect(names).toContain('cancel_order');
      expect(names).toContain('get_orderbook');
      expect(names).toContain('get_offers');
    });
  });

  // -----------------------------------------------------------------------
  // swap
  // -----------------------------------------------------------------------

  describe('swap', () => {
    it('returns ContractCallRequest with tfImmediateOrCancel for XRP->IOU', async () => {
      const result = await provider.resolve('swap', {
        takerGets: 'XRP',
        takerGetsAmount: '1000000',
        takerPays: 'USD.rIssuer123',
        takerPaysAmount: '0.5',
        slippageBps: 50,
      }, defaultContext) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.actionProvider).toBe('xrpl_dex');
      expect(result.actionName).toBe('swap');
      expect(result.to).toBe('rIssuer123');
      expect(result.value).toBe('1000000');

      const calldata = JSON.parse(result.calldata!);
      expect(calldata.xrplTxType).toBe('OfferCreate');
      expect(calldata.TakerGets).toBe('1000000');
      expect(calldata.Flags).toBe(TF_IMMEDIATE_OR_CANCEL);
      // TakerPays should be IOU with slippage applied
      expect(calldata.TakerPays.currency).toBe('USD');
      expect(calldata.TakerPays.issuer).toBe('rIssuer123');
      expect(parseFloat(calldata.TakerPays.value)).toBeCloseTo(0.4975, 3);
    });

    it('returns ContractCallRequest for IOU->IOU swap', async () => {
      const result = await provider.resolve('swap', {
        takerGets: 'EUR.rIssuerA',
        takerGetsAmount: '50',
        takerPays: 'USD.rIssuerB',
        takerPaysAmount: '55',
        slippageBps: 100,
      }, defaultContext) as ContractCallRequest;

      const calldata = JSON.parse(result.calldata!);
      expect(calldata.TakerGets.currency).toBe('EUR');
      expect(calldata.TakerPays.currency).toBe('USD');
      expect(result.value).toBeUndefined(); // no XRP value for IOU->IOU
    });

    it('returns 2-step [TrustSet, OfferCreate] when trust line missing', async () => {
      mockClient = createMockClient({
        checkTrustLine: vi.fn().mockResolvedValue(false),
      });
      provider = new XrplDexProvider(mockClient);

      const result = await provider.resolve('swap', {
        takerGets: 'XRP',
        takerGetsAmount: '1000000',
        takerPays: 'USD.rIssuer123',
        takerPaysAmount: '0.5',
      }, defaultContext);

      expect(Array.isArray(result)).toBe(true);
      const steps = result as ContractCallRequest[];
      expect(steps).toHaveLength(2);

      // First step: TrustSet
      const trustCalldata = JSON.parse(steps[0]!.calldata!);
      expect(trustCalldata.xrplTxType).toBe('TrustSet');
      expect(trustCalldata.LimitAmount.currency).toBe('USD');
      expect(trustCalldata.LimitAmount.issuer).toBe('rIssuer123');
      expect(steps[0]!.actionName).toBe('trust_set_auto');

      // Second step: OfferCreate
      const swapCalldata = JSON.parse(steps[1]!.calldata!);
      expect(swapCalldata.xrplTxType).toBe('OfferCreate');
      expect(swapCalldata.Flags).toBe(TF_IMMEDIATE_OR_CANCEL);
    });

    it('skips trust line check for XRP TakerPays', async () => {
      const result = await provider.resolve('swap', {
        takerGets: 'USD.rIssuer',
        takerGetsAmount: '100',
        takerPays: 'XRP',
        takerPaysAmount: '10000000',
      }, defaultContext) as ContractCallRequest;

      // Should return single ContractCallRequest, no trust set
      expect(result.type).toBe('CONTRACT_CALL');
      expect(Array.isArray(result)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // limit_order
  // -----------------------------------------------------------------------

  describe('limit_order', () => {
    it('returns ContractCallRequest with Expiration, no IoC flag', async () => {
      const result = await provider.resolve('limit_order', {
        takerGets: 'XRP',
        takerGetsAmount: '5000000',
        takerPays: 'USD.rIssuer',
        takerPaysAmount: '10',
        expirationSeconds: 3600,
      }, defaultContext) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.actionName).toBe('limit_order');

      const calldata = JSON.parse(result.calldata!);
      expect(calldata.xrplTxType).toBe('OfferCreate');
      expect(calldata.Flags).toBeUndefined(); // no tfImmediateOrCancel
      expect(calldata.Expiration).toBeDefined();
      expect(typeof calldata.Expiration).toBe('number');
    });

    it('validates reserve before placing order', async () => {
      mockClient = createMockClient({
        getAccountReserve: vi.fn().mockResolvedValue({
          balance: '1500000',
          ownerCount: 10,
          baseReserve: 1_000_000,
          ownerReserve: 200_000,
          availableBalance: '0',
        }),
      });
      provider = new XrplDexProvider(mockClient);

      await expect(
        provider.resolve('limit_order', {
          takerGets: 'XRP',
          takerGetsAmount: '1000000',
          takerPays: 'USD.rIssuer',
          takerPaysAmount: '1',
        }, defaultContext),
      ).rejects.toThrow('Insufficient XRP');
    });

    it('includes XRP value when takerGets is XRP', async () => {
      const result = await provider.resolve('limit_order', {
        takerGets: 'XRP',
        takerGetsAmount: '5000000',
        takerPays: 'USD.rIssuer',
        takerPaysAmount: '10',
      }, defaultContext) as ContractCallRequest;

      expect(result.value).toBe('5000000');
    });
  });

  // -----------------------------------------------------------------------
  // cancel_order
  // -----------------------------------------------------------------------

  describe('cancel_order', () => {
    it('returns OfferCancel ContractCallRequest', async () => {
      const result = await provider.resolve('cancel_order', {
        offerSequence: 12345,
      }, defaultContext) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.actionName).toBe('cancel_order');
      expect(result.to).toBe('native');

      const calldata = JSON.parse(result.calldata!);
      expect(calldata.xrplTxType).toBe('OfferCancel');
      expect(calldata.OfferSequence).toBe(12345);
    });
  });

  // -----------------------------------------------------------------------
  // get_orderbook (ApiDirectResult)
  // -----------------------------------------------------------------------

  describe('get_orderbook', () => {
    it('returns ApiDirectResult with bids/asks/spread', async () => {
      const result = await provider.resolve('get_orderbook', {
        base: 'XRP',
        counter: 'USD.rIssuer',
        limit: 10,
      }, defaultContext) as ApiDirectResult;

      expect(result.__apiDirect).toBe(true);
      expect(result.provider).toBe('xrpl_dex');
      expect(result.action).toBe('get_orderbook');
      expect(result.status).toBe('success');
      expect(result.data.bids).toBeDefined();
      expect(result.data.asks).toBeDefined();
      expect(result.data.spread).toBe(0.02);
    });
  });

  // -----------------------------------------------------------------------
  // get_offers (ApiDirectResult)
  // -----------------------------------------------------------------------

  describe('get_offers', () => {
    it('returns ApiDirectResult with active offers', async () => {
      const result = await provider.resolve('get_offers', {}, defaultContext) as ApiDirectResult;

      expect(result.__apiDirect).toBe(true);
      expect(result.provider).toBe('xrpl_dex');
      expect(result.action).toBe('get_offers');
      expect(result.data.account).toBe('rMyWalletAddress123');
      expect(Array.isArray(result.data.offers)).toBe(true);
      expect(result.data.count).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Unknown action
  // -----------------------------------------------------------------------

  describe('unknown action', () => {
    it('throws ChainError for unknown action name', async () => {
      await expect(
        provider.resolve('unknown_action', {}, defaultContext),
      ).rejects.toThrow('Unknown XRPL DEX action');
    });
  });
});
