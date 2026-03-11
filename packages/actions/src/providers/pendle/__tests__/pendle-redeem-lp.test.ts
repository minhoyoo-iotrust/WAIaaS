/**
 * PendleYieldProvider redeem/LP action tests.
 * Tests redeemPT (pre/post maturity), addLiquidity, removeLiquidity.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { PendleYieldProvider } from '../index.js';
import type { ActionContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_MARKET = {
  address: '0xMarketAddr',
  name: 'PT-stETH-26DEC2025',
  expiry: '2025-12-26T00:00:00Z',
  pt: '0xPTAddr',
  yt: '0xYTAddr',
  sy: '0xSYAddr',
  underlyingAsset: {
    address: '0xUnderlying',
    symbol: 'stETH',
    decimals: 18,
  },
  chainId: 1,
  details: {
    impliedApy: 0.045,
    underlyingApy: 0.032,
    liquidity: 150000000,
  },
};

const CONVERT_RESPONSE = {
  tx: {
    to: '0xPendleRouter',
    data: '0xredeemcalldata',
    value: '0',
  },
  amountOut: '1000000000000000000',
};

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

const BASE_URL = 'https://api-v2.pendle.finance/core';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const server = setupServer(
  http.get(`${BASE_URL}/v1/markets/all`, () => {
    return HttpResponse.json([MOCK_MARKET]);
  }),
  http.get(`${BASE_URL}/v2/sdk/1/convert`, () => {
    return HttpResponse.json(CONVERT_RESPONSE);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendleYieldProvider: redeem + LP actions', () => {
  describe('redeem_pt', () => {
    it('returns ContractCallRequest for PT redemption', async () => {
      const provider = new PendleYieldProvider();
      const result = await provider.resolve('redeem_pt', {
        market: '0xMarketAddr',
        amount: '1000000000000000000',
      }, CONTEXT);

      const calls = result as Array<{ type: string; to: string; calldata: string }>;
      expect(calls).toHaveLength(1);
      expect(calls[0]!.type).toBe('CONTRACT_CALL');
      expect(calls[0]!.to).toBe('0xPendleRouter');
      expect(calls[0]!.calldata).toBe('0xredeemcalldata');
    });

    it('sends PT as tokensIn and underlying as tokensOut', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('redeem_pt', {
        market: '0xMarketAddr',
        amount: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('tokensIn')).toBe('0xPTAddr');
      expect(url.searchParams.get('tokensOut')).toBe('0xUnderlying');
      expect(url.searchParams.get('amountsIn')).toBe('1000000');
    });

    it('throws on unknown market', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('redeem_pt', {
          market: '0xNonExistent',
          amount: '1000000',
        }, CONTEXT),
      ).rejects.toThrow('market not found');
    });

    it('rejects missing amount', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('redeem_pt', { market: '0xMarketAddr' }, CONTEXT),
      ).rejects.toThrow();
    });
  });

  describe('add_liquidity', () => {
    it('returns ContractCallRequest for LP addition', async () => {
      const provider = new PendleYieldProvider();
      const result = await provider.resolve('add_liquidity', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000000000000000',
      }, CONTEXT);

      const calls = result as Array<{ type: string; to: string }>;
      expect(calls).toHaveLength(1);
      expect(calls[0]!.type).toBe('CONTRACT_CALL');
    });

    it('sends market address as tokensOut (LP token)', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('add_liquidity', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('tokensIn')).toBe('0xUnderlying');
      expect(url.searchParams.get('tokensOut')).toBe('0xMarketAddr');
    });
  });

  describe('remove_liquidity', () => {
    it('returns ContractCallRequest for LP removal', async () => {
      const provider = new PendleYieldProvider();
      const result = await provider.resolve('remove_liquidity', {
        market: '0xMarketAddr',
        amount: '1000000000000000000',
      }, CONTEXT);

      const calls = result as Array<{ type: string; to: string }>;
      expect(calls).toHaveLength(1);
      expect(calls[0]!.type).toBe('CONTRACT_CALL');
    });

    it('sends market address as tokensIn (LP burn) and underlying as tokensOut', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('remove_liquidity', {
        market: '0xMarketAddr',
        amount: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('tokensIn')).toBe('0xMarketAddr');
      expect(url.searchParams.get('tokensOut')).toBe('0xUnderlying');
      expect(url.searchParams.get('amountsIn')).toBe('1000000');
    });

    it('throws on unknown market', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('remove_liquidity', {
          market: '0xBadMarket',
          amount: '1000000',
        }, CONTEXT),
      ).rejects.toThrow('market not found');
    });
  });

  describe('IYieldProvider: getMarkets', () => {
    it('returns mapped YieldMarketInfo array', async () => {
      const provider = new PendleYieldProvider();
      const markets = await provider.getMarkets('ethereum');

      expect(markets).toHaveLength(1);
      const m = markets[0]!;
      expect(m.marketAddress).toBe('0xMarketAddr');
      expect(m.asset).toBe('stETH');
      expect(m.symbol).toBe('PT-stETH-26DEC2025');
      expect(m.impliedApy).toBe(0.045);
      expect(m.underlyingApy).toBe(0.032);
      expect(m.tvl).toBe(150000000);
      expect(m.chain).toBe('ethereum');
      expect(typeof m.maturity).toBe('number');
    });
  });

  describe('IYieldProvider: getYieldForecast', () => {
    it('returns forecast with prices and APY', async () => {
      server.use(
        http.get(`${BASE_URL}/v1/sdk/1/markets/:market/swapping-prices`, () => {
          return HttpResponse.json({ ptPrice: 0.96, ytPrice: 0.04 });
        }),
      );

      const provider = new PendleYieldProvider();
      const forecast = await provider.getYieldForecast('0xMarketAddr', CONTEXT);

      expect(forecast.marketId).toBe('0xMarketAddr');
      expect(forecast.impliedApy).toBe(0.045);
      expect(forecast.ptPrice).toBe(0.96);
      expect(forecast.ytPrice).toBe(0.04);
      expect(typeof forecast.maturityDate).toBe('number');
    });

    it('throws for unknown market', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.getYieldForecast('0xNonExistent', CONTEXT),
      ).rejects.toThrow('market not found');
    });
  });
});
