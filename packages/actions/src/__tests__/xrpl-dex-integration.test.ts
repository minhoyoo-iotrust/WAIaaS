/**
 * Integration tests for XrplDexProvider -- validates full resolve()
 * to ContractCallRequest/ApiDirectResult contract for all 5 actions.
 *
 * @see Phase 02-03 Task 2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XrplDexProvider } from '../providers/xrpl-dex/index.js';
import type { XrplOrderbookClient } from '../providers/xrpl-dex/orderbook-client.js';
import { TF_IMMEDIATE_OR_CANCEL } from '../providers/xrpl-dex/offer-builder.js';
import type { ContractCallRequest, ApiDirectResult, ActionContext } from '@waiaas/core';
import { isApiDirectResult } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

function createMockOrderbookClient(overrides?: Partial<XrplOrderbookClient>): XrplOrderbookClient {
  return {
    ensureConnected: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getClient: vi.fn(),
    getOrderbook: vi.fn().mockResolvedValue({
      asks: [
        { price: 0.5, amount: 10, total: 5, ownerFunds: '50000000', sequence: 100 },
        { price: 0.51, amount: 20, total: 10.2, ownerFunds: '30000000', sequence: 101 },
      ],
      bids: [
        { price: 0.48, amount: 15, total: 7.2, ownerFunds: '200', sequence: 200 },
      ],
      spread: 0.02,
    }),
    getAccountOffers: vi.fn().mockResolvedValue([
      { seq: 12345, takerGets: '5000000 drops', takerPays: '2.5 USD', flags: 0 },
      { seq: 12346, takerGets: '10 EUR', takerPays: '10000000 drops', flags: 0x00020000, expiration: 828662400 },
    ]),
    checkTrustLine: vi.fn().mockResolvedValue(true),
    getAccountReserve: vi.fn().mockResolvedValue({
      balance: '100000000',
      ownerCount: 3,
      baseReserve: 1_000_000,
      ownerReserve: 200_000,
      availableBalance: '98400000',
    }),
    ...overrides,
  } as unknown as XrplOrderbookClient;
}

const testContext: ActionContext = {
  walletAddress: 'rIntegrationTestWallet',
  chain: 'ripple',
  walletId: 'wallet-integration-123',
  sessionId: 'session-456',
};

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('XrplDexProvider Integration', () => {
  let provider: XrplDexProvider;
  let mockClient: XrplOrderbookClient;

  beforeEach(() => {
    mockClient = createMockOrderbookClient();
    provider = new XrplDexProvider(mockClient);
  });

  // -----------------------------------------------------------------------
  // swap: XRP -> IOU
  // -----------------------------------------------------------------------

  describe('swap XRP->IOU end-to-end', () => {
    it('produces ContractCallRequest with correct calldata structure', async () => {
      const result = await provider.resolve('swap', {
        takerGets: 'XRP',
        takerGetsAmount: '50000000', // 50 XRP
        takerPays: 'USD.rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
        takerPaysAmount: '25',
        slippageBps: 100, // 1%
      }, testContext);

      // Must be ContractCallRequest (not array, not ApiDirect)
      expect(isApiDirectResult(result)).toBe(false);
      expect(Array.isArray(result)).toBe(false);

      const req = result as ContractCallRequest;
      expect(req.type).toBe('CONTRACT_CALL');
      expect(req.to).toBe('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe');
      expect(req.value).toBe('50000000');

      // Parse calldata
      const calldata = JSON.parse(req.calldata!);
      expect(calldata.xrplTxType).toBe('OfferCreate');
      expect(calldata.TakerGets).toBe('50000000'); // XRP drops string
      expect(calldata.Flags).toBe(TF_IMMEDIATE_OR_CANCEL);

      // TakerPays: IOU with slippage applied (25 * 0.99 = 24.75)
      expect(typeof calldata.TakerPays).toBe('object');
      expect(calldata.TakerPays.currency).toBe('USD');
      expect(calldata.TakerPays.issuer).toBe('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe');
      expect(parseFloat(calldata.TakerPays.value)).toBeCloseTo(24.75, 2);
    });
  });

  // -----------------------------------------------------------------------
  // swap: IOU -> IOU
  // -----------------------------------------------------------------------

  describe('swap IOU->IOU end-to-end', () => {
    it('produces ContractCallRequest with both sides as IOU objects', async () => {
      const result = await provider.resolve('swap', {
        takerGets: 'EUR.rIssuerA',
        takerGetsAmount: '100',
        takerPays: 'USD.rIssuerB',
        takerPaysAmount: '110',
        slippageBps: 50,
      }, testContext) as ContractCallRequest;

      const calldata = JSON.parse(result.calldata!);
      expect(calldata.xrplTxType).toBe('OfferCreate');

      // Both TakerGets and TakerPays are IOU objects
      expect(calldata.TakerGets).toEqual({ currency: 'EUR', issuer: 'rIssuerA', value: '100' });
      expect(typeof calldata.TakerPays).toBe('object');
      expect(calldata.TakerPays.currency).toBe('USD');
      expect(calldata.TakerPays.issuer).toBe('rIssuerB');

      // No XRP value for IOU->IOU
      expect(result.value).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // swap: trust line auto-setup (2-step)
  // -----------------------------------------------------------------------

  describe('swap with missing trust line', () => {
    it('returns [TrustSet, OfferCreate] 2-step array', async () => {
      mockClient = createMockOrderbookClient({
        checkTrustLine: vi.fn().mockResolvedValue(false),
      });
      provider = new XrplDexProvider(mockClient);

      const result = await provider.resolve('swap', {
        takerGets: 'XRP',
        takerGetsAmount: '1000000',
        takerPays: 'USD.rNewIssuer',
        takerPaysAmount: '0.5',
      }, testContext);

      expect(Array.isArray(result)).toBe(true);
      const steps = result as ContractCallRequest[];
      expect(steps).toHaveLength(2);

      // Step 1: TrustSet
      const trustCalldata = JSON.parse(steps[0]!.calldata!);
      expect(trustCalldata.xrplTxType).toBe('TrustSet');
      expect(trustCalldata.LimitAmount).toEqual({
        currency: 'USD',
        issuer: 'rNewIssuer',
        value: '1000000000000000',
      });
      expect(trustCalldata.Flags).toBe(0x00020000); // tfSetNoRipple
      expect(steps[0]!.actionName).toBe('trust_set_auto');
      expect(steps[0]!.to).toBe('rNewIssuer');

      // Step 2: OfferCreate
      const swapCalldata = JSON.parse(steps[1]!.calldata!);
      expect(swapCalldata.xrplTxType).toBe('OfferCreate');
      expect(swapCalldata.Flags).toBe(TF_IMMEDIATE_OR_CANCEL);
    });
  });

  // -----------------------------------------------------------------------
  // limit_order
  // -----------------------------------------------------------------------

  describe('limit_order end-to-end', () => {
    it('produces ContractCallRequest without tfImmediateOrCancel with Expiration', async () => {
      const result = await provider.resolve('limit_order', {
        takerGets: 'XRP',
        takerGetsAmount: '10000000',
        takerPays: 'USD.rIssuer',
        takerPaysAmount: '5',
        expirationSeconds: 7200,
      }, testContext) as ContractCallRequest;

      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.actionName).toBe('limit_order');
      expect(result.value).toBe('10000000');

      const calldata = JSON.parse(result.calldata!);
      expect(calldata.xrplTxType).toBe('OfferCreate');
      expect(calldata.Flags).toBeUndefined(); // no tfImmediateOrCancel
      expect(calldata.Expiration).toBeDefined();
      expect(typeof calldata.Expiration).toBe('number');
      expect(calldata.TakerGets).toBe('10000000');
      expect(calldata.TakerPays).toEqual({ currency: 'USD', issuer: 'rIssuer', value: '5' });
    });

    it('throws on insufficient reserve', async () => {
      mockClient = createMockOrderbookClient({
        getAccountReserve: vi.fn().mockResolvedValue({
          balance: '1200000',
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
        }, testContext),
      ).rejects.toThrow('Insufficient XRP');
    });
  });

  // -----------------------------------------------------------------------
  // cancel_order
  // -----------------------------------------------------------------------

  describe('cancel_order end-to-end', () => {
    it('produces OfferCancel ContractCallRequest', async () => {
      const result = await provider.resolve('cancel_order', {
        offerSequence: 12345,
      }, testContext) as ContractCallRequest;

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

  describe('get_orderbook end-to-end', () => {
    it('produces ApiDirectResult with bids, asks, and spread', async () => {
      const result = await provider.resolve('get_orderbook', {
        base: 'XRP',
        counter: 'USD.rIssuer',
        limit: 10,
      }, testContext);

      expect(isApiDirectResult(result)).toBe(true);
      const direct = result as ApiDirectResult;

      expect(direct.__apiDirect).toBe(true);
      expect(direct.provider).toBe('xrpl_dex');
      expect(direct.action).toBe('get_orderbook');
      expect(direct.status).toBe('success');
      expect(Array.isArray(direct.data.asks)).toBe(true);
      expect(Array.isArray(direct.data.bids)).toBe(true);
      expect(direct.data.spread).toBe(0.02);
      expect(direct.data.base).toBe('XRP');
      expect(direct.data.counter).toBe('USD.rIssuer');

      // Verify ask structure
      const asks = direct.data.asks as Array<{ price: number; amount: number; sequence: number }>;
      expect(asks).toHaveLength(2);
      expect(asks[0]!.price).toBe(0.5);
      expect(asks[0]!.sequence).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // get_offers (ApiDirectResult)
  // -----------------------------------------------------------------------

  describe('get_offers end-to-end', () => {
    it('produces ApiDirectResult with active offers including seq', async () => {
      const result = await provider.resolve('get_offers', {}, testContext);

      expect(isApiDirectResult(result)).toBe(true);
      const direct = result as ApiDirectResult;

      expect(direct.__apiDirect).toBe(true);
      expect(direct.provider).toBe('xrpl_dex');
      expect(direct.action).toBe('get_offers');
      expect(direct.data.account).toBe('rIntegrationTestWallet');
      expect(direct.data.count).toBe(2);

      const offers = direct.data.offers as Array<{ seq: number }>;
      expect(offers).toHaveLength(2);
      expect(offers[0]!.seq).toBe(12345);
      expect(offers[1]!.seq).toBe(12346);
    });
  });

  // -----------------------------------------------------------------------
  // registerBuiltInProviders gate
  // -----------------------------------------------------------------------

  describe('registerBuiltInProviders gate', () => {
    it('loads xrpl_dex when enabled', async () => {
      const { registerBuiltInProviders } = await import('../index.js');

      const registeredProviders: Array<{ metadata: { name: string } }> = [];
      const mockRegistry = {
        register: vi.fn((provider: { metadata: { name: string } }) => {
          registeredProviders.push(provider);
        }),
      };

      const mockSettings = {
        get: vi.fn((key: string) => {
          if (key === 'actions.xrpl_dex_enabled') return 'true';
          return '';
        }),
      };

      const { loaded } = registerBuiltInProviders(mockRegistry, mockSettings);
      expect(loaded).toContain('xrpl_dex');
    });

    it('skips xrpl_dex when disabled', async () => {
      const { registerBuiltInProviders } = await import('../index.js');

      const mockRegistry = { register: vi.fn() };
      const mockSettings = {
        get: vi.fn(() => ''),
      };

      const { skipped } = registerBuiltInProviders(mockRegistry, mockSettings);
      expect(skipped).toContain('xrpl_dex');
    });
  });
});
