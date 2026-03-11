/**
 * PendleYieldProvider unit tests.
 * Tests buyPT, buyYT action resolution via mock PendleApiClient.
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
    data: '0xcalldata123',
    value: '0',
  },
  amountOut: '950000000000000000',
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

describe('PendleYieldProvider', () => {
  describe('metadata', () => {
    it('has correct provider name', () => {
      const provider = new PendleYieldProvider();
      expect(provider.metadata.name).toBe('pendle_yield');
    });

    it('has 5 actions', () => {
      const provider = new PendleYieldProvider();
      expect(provider.actions).toHaveLength(5);
    });

    it('exposes expected action names', () => {
      const provider = new PendleYieldProvider();
      const names = provider.actions.map((a) => a.name);
      expect(names).toEqual(['buy_pt', 'buy_yt', 'redeem_pt', 'add_liquidity', 'remove_liquidity']);
    });

    it('mcpExpose is true', () => {
      const provider = new PendleYieldProvider();
      expect(provider.metadata.mcpExpose).toBe(true);
    });

    it('chains includes ethereum', () => {
      const provider = new PendleYieldProvider();
      expect(provider.metadata.chains).toContain('ethereum');
    });
  });

  describe('buy_pt', () => {
    it('returns ContractCallRequest with correct fields', async () => {
      const provider = new PendleYieldProvider();
      const result = await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000000000000000',
      }, CONTEXT);

      expect(Array.isArray(result)).toBe(true);
      const calls = result as Array<{ type: string; to: string; calldata: string }>;
      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.type).toBe('CONTRACT_CALL');
      expect(call.to).toBe('0xPendleRouter');
      expect(call.calldata).toBe('0xcalldata123');
    });

    it('sends PT address as tokensOut to Convert API', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('tokensOut')).toBe('0xPTAddr');
      expect(url.searchParams.get('tokensIn')).toBe('0xUnderlying');
    });

    it('sends receiver as wallet address', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('receiver')).toBe(CONTEXT.walletAddress);
    });

    it('throws on unknown market', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('buy_pt', {
          market: '0xNonExistent',
          tokenIn: '0xUnderlying',
          amountIn: '1000000',
        }, CONTEXT),
      ).rejects.toThrow('market not found');
    });

    it('applies default slippage when not specified', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippage')).toBe('0.01'); // 100bps = 1%
    });

    it('clamps user slippage to max', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_pt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
        slippageBps: 1000, // 10% — should be clamped to max 5%
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('slippage')).toBe('0.05'); // 500bps = 5%
    });
  });

  describe('buy_yt', () => {
    it('returns ContractCallRequest for YT purchase', async () => {
      const provider = new PendleYieldProvider();
      const result = await provider.resolve('buy_yt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000000000000000',
      }, CONTEXT);

      const calls = result as Array<{ type: string; to: string }>;
      expect(calls).toHaveLength(1);
      expect(calls[0]!.type).toBe('CONTRACT_CALL');
    });

    it('sends YT address as tokensOut', async () => {
      let capturedUrl = '';
      server.use(
        http.get(`${BASE_URL}/v2/sdk/1/convert`, ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json(CONVERT_RESPONSE);
        }),
      );

      const provider = new PendleYieldProvider();
      await provider.resolve('buy_yt', {
        market: '0xMarketAddr',
        tokenIn: '0xUnderlying',
        amountIn: '1000000',
      }, CONTEXT);

      const url = new URL(capturedUrl);
      expect(url.searchParams.get('tokensOut')).toBe('0xYTAddr');
    });
  });

  describe('unknown action', () => {
    it('throws on unknown action name', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('unknown_action', {}, CONTEXT),
      ).rejects.toThrow('Unknown Pendle action');
    });
  });

  describe('input validation', () => {
    it('rejects buy_pt with missing market', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('buy_pt', { tokenIn: '0xA', amountIn: '100' }, CONTEXT),
      ).rejects.toThrow();
    });

    it('rejects buy_pt with missing amountIn', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('buy_pt', { market: '0xM', tokenIn: '0xA' }, CONTEXT),
      ).rejects.toThrow();
    });

    it('rejects buy_yt with missing tokenIn', async () => {
      const provider = new PendleYieldProvider();
      await expect(
        provider.resolve('buy_yt', { market: '0xM', amountIn: '100' }, CONTEXT),
      ).rejects.toThrow();
    });
  });

  describe('IPositionProvider', () => {
    it('getProviderName returns pendle', () => {
      const provider = new PendleYieldProvider();
      expect(provider.getProviderName()).toBe('pendle');
    });

    it('getSupportedCategories returns YIELD', () => {
      const provider = new PendleYieldProvider();
      expect(provider.getSupportedCategories()).toEqual(['YIELD']);
    });
  });
});
